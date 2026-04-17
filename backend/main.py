import hashlib
import io
import re
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import pytesseract
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image

DB_PATH = Path(__file__).with_name("settle_kar.db")
DEFAULT_USERS = ["User A", "User B", "User C"]


class ExpenseCreate(BaseModel):
    paid_by: str
    amount: float = Field(gt=0)
    split_among: list[str] = Field(min_length=1)
    description: str = ""

app = FastAPI(title="Settle Kar API")

# Allow local React frontend during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                paid_by TEXT NOT NULL,
                amount REAL NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (paid_by) REFERENCES users(name)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS expense_splits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL,
                user_name TEXT NOT NULL,
                share_amount REAL NOT NULL,
                FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                FOREIGN KEY (user_name) REFERENCES users(name)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS receipt_hashes (
                file_hash TEXT PRIMARY KEY,
                algorithm TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS settled_edges (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user TEXT NOT NULL,
                to_user TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                receipt_hash TEXT NOT NULL,
                receipt_timestamp TEXT NOT NULL,
                ocr_amount REAL NOT NULL,
                ocr_text TEXT NOT NULL,
                settled_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(from_user, to_user, amount_cents),
                FOREIGN KEY (from_user) REFERENCES users(name),
                FOREIGN KEY (to_user) REFERENCES users(name),
                FOREIGN KEY (receipt_hash) REFERENCES receipt_hashes(file_hash)
            )
            """
        )
        for user_name in DEFAULT_USERS:
            connection.execute(
                "INSERT OR IGNORE INTO users(name) VALUES (?)",
                (user_name,),
            )
        connection.commit()


@app.on_event("startup")
def on_startup() -> None:
    init_db()


def fetch_users(connection: sqlite3.Connection) -> list[str]:
    rows = connection.execute("SELECT name FROM users ORDER BY name").fetchall()
    return [row["name"] for row in rows]


def split_amount_evenly(total_amount: float, participant_count: int) -> list[float]:
    if participant_count <= 0:
        return []

    per_user = round(total_amount / participant_count, 2)
    shares = [per_user] * participant_count
    rounding_delta = round(total_amount - sum(shares), 2)
    shares[-1] = round(shares[-1] + rounding_delta, 2)
    return shares


def compute_net_balances(connection: sqlite3.Connection) -> dict[str, float]:
    users = fetch_users(connection)
    balances = {user: 0.0 for user in users}

    expense_rows = connection.execute("SELECT id, paid_by FROM expenses ORDER BY id").fetchall()
    for expense_row in expense_rows:
        payer = expense_row["paid_by"]
        split_rows = connection.execute(
            "SELECT user_name, share_amount FROM expense_splits WHERE expense_id = ?",
            (expense_row["id"],),
        ).fetchall()

        for split_row in split_rows:
            participant = split_row["user_name"]
            share_amount = float(split_row["share_amount"])
            if participant == payer:
                continue
            balances[participant] = round(balances[participant] - share_amount, 2)
            balances[payer] = round(balances[payer] + share_amount, 2)

    for user_name, balance in balances.items():
        if abs(balance) < 0.01:
            balances[user_name] = 0.0
    return balances


def optimize_settlements(balances: dict[str, float]) -> list[dict[str, float | str]]:
    creditors = [
        {"user": user, "amount": round(amount, 2)}
        for user, amount in balances.items()
        if amount > 0
    ]
    debtors = [
        {"user": user, "amount": round(-amount, 2)}
        for user, amount in balances.items()
        if amount < 0
    ]

    creditors.sort(key=lambda item: item["amount"], reverse=True)
    debtors.sort(key=lambda item: item["amount"], reverse=True)

    settlements: list[dict[str, float | str]] = []
    creditor_index = 0
    debtor_index = 0

    while creditor_index < len(creditors) and debtor_index < len(debtors):
        creditor = creditors[creditor_index]
        debtor = debtors[debtor_index]

        payment_amount = round(min(creditor["amount"], debtor["amount"]), 2)
        if payment_amount > 0:
            settlements.append(
                {
                    "from": debtor["user"],
                    "to": creditor["user"],
                    "amount": payment_amount,
                }
            )

        creditor["amount"] = round(creditor["amount"] - payment_amount, 2)
        debtor["amount"] = round(debtor["amount"] - payment_amount, 2)

        if creditor["amount"] <= 0:
            creditor_index += 1
        if debtor["amount"] <= 0:
            debtor_index += 1

    return settlements


def settlement_edge_id(from_user: str, to_user: str, amount: float) -> str:
    edge_key = f"{from_user}|{to_user}|{round(amount, 2):.2f}"
    return hashlib.sha256(edge_key.encode("utf-8")).hexdigest()[:16]


def parse_receipt_amount(ocr_text: str) -> float | None:
    normalized_text = ocr_text.replace(",", "")
    targeted_pattern = re.compile(
        r"(?:amount|total|paid|rs\.?|pkr)\s*[:\-]?\s*(\d+(?:\.\d{1,2})?)",
        flags=re.IGNORECASE,
    )
    targeted_matches = targeted_pattern.findall(normalized_text)
    if targeted_matches:
        return round(float(targeted_matches[-1]), 2)

    fallback_pattern = re.compile(r"\b\d+\.\d{1,2}\b")
    fallback_matches = fallback_pattern.findall(normalized_text)
    if fallback_matches:
        fallback_values = [float(value) for value in fallback_matches]
        return round(max(fallback_values), 2)

    return None


def parse_receipt_timestamp(ocr_text: str) -> datetime | None:
    date_time_patterns = [
        (r"\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\b", ["%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"]),
        (r"\b\d{2}/\d{2}/\d{4}[ T]\d{2}:\d{2}(?::\d{2})?\b", ["%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%m/%d/%Y %H:%M:%S"]),
        (r"\b\d{2}-\d{2}-\d{4}[ T]\d{2}:\d{2}(?::\d{2})?\b", ["%d-%m-%Y %H:%M", "%d-%m-%Y %H:%M:%S", "%m-%d-%Y %H:%M", "%m-%d-%Y %H:%M:%S"]),
    ]

    for pattern, formats in date_time_patterns:
        for match in re.findall(pattern, ocr_text):
            normalized_match = match.replace("T", " ")
            for date_format in formats:
                try:
                    return datetime.strptime(normalized_match, date_format)
                except ValueError:
                    continue

    return None


def build_settlement_rows(
    connection: sqlite3.Connection,
    settlements: list[dict[str, float | str]],
) -> list[dict[str, float | str | bool | None]]:
    settled_rows = connection.execute(
        """
        SELECT from_user, to_user, amount_cents, settled_at
        FROM settled_edges
        """
    ).fetchall()
    settled_lookup = {
        (row["from_user"], row["to_user"], int(row["amount_cents"])): row["settled_at"]
        for row in settled_rows
    }

    settlement_rows: list[dict[str, float | str | bool | None]] = []
    for settlement in settlements:
        from_user = str(settlement["from"])
        to_user = str(settlement["to"])
        amount = round(float(settlement["amount"]), 2)
        amount_cents = int(round(amount * 100))
        settled_at = settled_lookup.get((from_user, to_user, amount_cents))

        settlement_rows.append(
            {
                "edge_id": settlement_edge_id(from_user, to_user, amount),
                "from": from_user,
                "to": to_user,
                "amount": amount,
                "is_settled": settled_at is not None,
                "settled_at": settled_at,
            }
        )

    return settlement_rows


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/users")
def get_users() -> dict[str, list[str]]:
    with get_connection() as connection:
        return {"users": fetch_users(connection)}


@app.get("/api/expenses")
def get_expenses() -> dict[str, list[dict[str, float | int | str | list[str]]]]:
    with get_connection() as connection:
        expense_rows = connection.execute(
            "SELECT id, paid_by, amount, description, created_at FROM expenses ORDER BY id DESC"
        ).fetchall()

        expenses: list[dict[str, float | int | str | list[str]]] = []
        for expense_row in expense_rows:
            split_rows = connection.execute(
                "SELECT user_name FROM expense_splits WHERE expense_id = ? ORDER BY user_name",
                (expense_row["id"],),
            ).fetchall()
            expenses.append(
                {
                    "id": expense_row["id"],
                    "paid_by": expense_row["paid_by"],
                    "amount": float(expense_row["amount"]),
                    "description": expense_row["description"],
                    "split_among": [row["user_name"] for row in split_rows],
                    "created_at": expense_row["created_at"],
                }
            )

        return {"expenses": expenses}


@app.post("/api/expenses")
def create_expense(payload: ExpenseCreate) -> dict[str, float | int | str | list[str]]:
    unique_participants = sorted(set(payload.split_among))

    with get_connection() as connection:
        valid_users = set(fetch_users(connection))

        if payload.paid_by not in valid_users:
            raise HTTPException(status_code=400, detail="Paid By user does not exist")

        if not set(unique_participants).issubset(valid_users):
            raise HTTPException(status_code=400, detail="Split participants contain unknown users")

        shares = split_amount_evenly(payload.amount, len(unique_participants))

        cursor = connection.execute(
            "INSERT INTO expenses(paid_by, amount, description) VALUES (?, ?, ?)",
            (payload.paid_by, payload.amount, payload.description.strip()),
        )
        expense_id = cursor.lastrowid

        for participant, share in zip(unique_participants, shares):
            connection.execute(
                "INSERT INTO expense_splits(expense_id, user_name, share_amount) VALUES (?, ?, ?)",
                (expense_id, participant, share),
            )

        connection.commit()

    return {
        "id": expense_id,
        "paid_by": payload.paid_by,
        "amount": round(payload.amount, 2),
        "description": payload.description.strip(),
        "split_among": unique_participants,
    }


@app.get("/api/ledger")
def get_ledger() -> dict[str, list[dict[str, float | str | bool | None]]]:
    with get_connection() as connection:
        balances = compute_net_balances(connection)
        settlements = optimize_settlements(balances)
        settlement_rows = build_settlement_rows(connection, settlements)

    balance_rows = [
        {"user": user, "balance": round(amount, 2)}
        for user, amount in sorted(balances.items())
    ]

    return {
        "balances": balance_rows,
        "settlements": settlement_rows,
    }


@app.post("/api/settlements/verify-receipt")
async def verify_receipt_for_settlement(
    from_user: str = Form(...),
    to_user: str = Form(...),
    expected_amount: float = Form(..., gt=0),
    receipt: UploadFile = File(...),
) -> dict[str, float | str | bool]:
    with get_connection() as connection:
        users = set(fetch_users(connection))
        if from_user not in users or to_user not in users:
            raise HTTPException(status_code=400, detail="Unknown user in settlement")

        balances = compute_net_balances(connection)
        live_settlements = optimize_settlements(balances)
        expected_amount_rounded = round(expected_amount, 2)
        settlement_exists = any(
            str(item["from"]) == from_user
            and str(item["to"]) == to_user
            and abs(round(float(item["amount"]), 2) - expected_amount_rounded) < 0.01
            for item in live_settlements
        )
        if not settlement_exists:
            raise HTTPException(status_code=400, detail="Settlement is no longer pending")

        file_bytes = await receipt.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        file_hash = hashlib.sha256(file_bytes).hexdigest()
        duplicate_hash = connection.execute(
            "SELECT file_hash FROM receipt_hashes WHERE file_hash = ?",
            (file_hash,),
        ).fetchone()
        if duplicate_hash:
            raise HTTPException(
                status_code=409,
                detail="Duplicate receipt detected. This image was already used.",
            )

        try:
            image = Image.open(io.BytesIO(file_bytes))
            ocr_text = pytesseract.image_to_string(image)
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=f"OCR failed. Ensure Tesseract OCR is installed and configured. {error}",
            ) from error

        parsed_amount = parse_receipt_amount(ocr_text)
        if parsed_amount is None:
            raise HTTPException(status_code=400, detail="Could not parse amount from receipt")

        parsed_timestamp = parse_receipt_timestamp(ocr_text)
        if parsed_timestamp is None:
            raise HTTPException(status_code=400, detail="Could not parse timestamp from receipt")

        now = datetime.now()
        if parsed_timestamp < now - timedelta(hours=24) or parsed_timestamp > now + timedelta(minutes=10):
            raise HTTPException(
                status_code=400,
                detail="Receipt timestamp is not within the last 24 hours",
            )

        if abs(parsed_amount - expected_amount_rounded) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"Amount mismatch. Expected {expected_amount_rounded:.2f}, found {parsed_amount:.2f}",
            )

        amount_cents = int(round(expected_amount_rounded * 100))
        connection.execute(
            "INSERT INTO receipt_hashes(file_hash, algorithm) VALUES (?, ?)",
            (file_hash, "sha256"),
        )
        connection.execute(
            """
            INSERT INTO settled_edges(
                from_user,
                to_user,
                amount_cents,
                receipt_hash,
                receipt_timestamp,
                ocr_amount,
                ocr_text
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(from_user, to_user, amount_cents)
            DO UPDATE SET
                receipt_hash = excluded.receipt_hash,
                receipt_timestamp = excluded.receipt_timestamp,
                ocr_amount = excluded.ocr_amount,
                ocr_text = excluded.ocr_text,
                settled_at = CURRENT_TIMESTAMP
            """,
            (
                from_user,
                to_user,
                amount_cents,
                file_hash,
                parsed_timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                parsed_amount,
                ocr_text,
            ),
        )
        connection.commit()

    return {
        "verified": True,
        "from": from_user,
        "to": to_user,
        "amount": expected_amount_rounded,
        "receipt_hash": file_hash,
    }
