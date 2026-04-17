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
PREDEFINED_ASSETS = [
    {
        "asset_code": "POSTER_12X18_MATTE",
        "label": "12x18 Matte Poster Voucher",
        "unit_value": 300.0,
    }
]
DEMO_EXPENSES = [
    {
        "paid_by": "User A",
        "amount": 900.0,
        "description": "Demo: Team travel",
        "split_among": ["User A", "User B", "User C"],
    },
    {
        "paid_by": "User C",
        "amount": 900.0,
        "description": "Demo: Booth setup",
        "split_among": ["User A", "User B", "User C"],
    },
]


class ExpenseCreate(BaseModel):
    paid_by: str
    amount: float = Field(gt=0)
    split_among: list[str] = Field(min_length=1)
    description: str = ""


class AssetOffsetCreate(BaseModel):
    from_user: str
    to_user: str
    expected_amount: float = Field(gt=0)
    asset_code: str
    quantity: int = Field(default=1, ge=1)


class AssetOffsetDecision(BaseModel):
    offset_id: int = Field(gt=0)
    actor_user: str
    action: str

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


def has_column(connection: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row["name"] == column_name for row in rows)


def parse_db_timestamp(timestamp_value: str | None) -> datetime | None:
    if not timestamp_value:
        return None

    normalized_value = timestamp_value.replace("T", " ").split(".")[0]
    for date_format in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(normalized_value, date_format)
        except ValueError:
            continue
    return None


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
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS debt_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user TEXT NOT NULL,
                to_user TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                debt_created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(from_user, to_user, amount_cents),
                FOREIGN KEY (from_user) REFERENCES users(name),
                FOREIGN KEY (to_user) REFERENCES users(name)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS digital_assets (
                asset_code TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                unit_value REAL NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_asset_wallet (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_name TEXT NOT NULL,
                asset_code TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 0,
                UNIQUE(user_name, asset_code),
                FOREIGN KEY (user_name) REFERENCES users(name),
                FOREIGN KEY (asset_code) REFERENCES digital_assets(asset_code)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_asset_offsets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user TEXT NOT NULL,
                to_user TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                asset_code TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                resolved_at TEXT,
                resolved_by TEXT,
                UNIQUE(from_user, to_user, amount_cents, asset_code, status),
                FOREIGN KEY (from_user) REFERENCES users(name),
                FOREIGN KEY (to_user) REFERENCES users(name),
                FOREIGN KEY (asset_code) REFERENCES digital_assets(asset_code),
                FOREIGN KEY (resolved_by) REFERENCES users(name)
            )
            """
        )

        if not has_column(connection, "settled_edges", "settlement_verified_at"):
            connection.execute(
                "ALTER TABLE settled_edges ADD COLUMN settlement_verified_at TEXT"
            )

        if not has_column(connection, "debt_assignments", "debt_created_at"):
            connection.execute(
                "ALTER TABLE debt_assignments ADD COLUMN debt_created_at TEXT DEFAULT CURRENT_TIMESTAMP"
            )

        if has_column(connection, "settled_edges", "settled_at"):
            connection.execute(
                """
                UPDATE settled_edges
                SET settlement_verified_at = COALESCE(settlement_verified_at, settled_at)
                """
            )
        for user_name in DEFAULT_USERS:
            connection.execute(
                "INSERT OR IGNORE INTO users(name) VALUES (?)",
                (user_name,),
            )

        for asset in PREDEFINED_ASSETS:
            connection.execute(
                """
                INSERT OR IGNORE INTO digital_assets(asset_code, label, unit_value)
                VALUES (?, ?, ?)
                """,
                (asset["asset_code"], asset["label"], asset["unit_value"]),
            )

        for user_name in DEFAULT_USERS:
            for asset in PREDEFINED_ASSETS:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO user_asset_wallet(user_name, asset_code, quantity)
                    VALUES (?, ?, ?)
                    """,
                    (user_name, asset["asset_code"], 3),
                )

        connection.commit()


def seed_demo_graph(connection: sqlite3.Connection) -> None:
    # Clear all runtime data so every demo starts from a known state.
    connection.execute("DELETE FROM pending_asset_offsets")
    connection.execute("DELETE FROM settled_edges")
    connection.execute("DELETE FROM receipt_hashes")
    connection.execute("DELETE FROM expense_splits")
    connection.execute("DELETE FROM expenses")
    connection.execute("DELETE FROM debt_assignments")
    connection.execute("DELETE FROM user_asset_wallet")
    connection.execute("DELETE FROM digital_assets")
    connection.execute("DELETE FROM users")

    for user_name in DEFAULT_USERS:
        connection.execute(
            "INSERT OR IGNORE INTO users(name) VALUES (?)",
            (user_name,),
        )

    for asset in PREDEFINED_ASSETS:
        connection.execute(
            """
            INSERT OR IGNORE INTO digital_assets(asset_code, label, unit_value)
            VALUES (?, ?, ?)
            """,
            (asset["asset_code"], asset["label"], asset["unit_value"]),
        )

    for user_name in DEFAULT_USERS:
        for asset in PREDEFINED_ASSETS:
            connection.execute(
                """
                INSERT OR IGNORE INTO user_asset_wallet(user_name, asset_code, quantity)
                VALUES (?, ?, ?)
                """,
                (user_name, asset["asset_code"], 3),
            )

    for demo_expense in DEMO_EXPENSES:
        split_members = sorted(set(demo_expense["split_among"]))
        shares = split_amount_evenly(float(demo_expense["amount"]), len(split_members))
        cursor = connection.execute(
            "INSERT INTO expenses(paid_by, amount, description) VALUES (?, ?, ?)",
            (
                demo_expense["paid_by"],
                float(demo_expense["amount"]),
                str(demo_expense["description"]),
            ),
        )
        expense_id = int(cursor.lastrowid)
        for participant, share in zip(split_members, shares):
            connection.execute(
                "INSERT INTO expense_splits(expense_id, user_name, share_amount) VALUES (?, ?, ?)",
                (expense_id, participant, share),
            )


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
    for settlement in settlements:
        from_user = str(settlement["from"])
        to_user = str(settlement["to"])
        amount_cents = int(round(float(settlement["amount"]) * 100))
        connection.execute(
            """
            INSERT OR IGNORE INTO debt_assignments(from_user, to_user, amount_cents)
            VALUES (?, ?, ?)
            """,
            (from_user, to_user, amount_cents),
        )

    assignment_rows = connection.execute(
        """
        SELECT from_user, to_user, amount_cents, debt_created_at
        FROM debt_assignments
        """
    ).fetchall()
    assignment_lookup = {
        (row["from_user"], row["to_user"], int(row["amount_cents"])): row["debt_created_at"]
        for row in assignment_rows
    }

    settled_rows = connection.execute(
        """
        SELECT from_user, to_user, amount_cents,
               COALESCE(settlement_verified_at, settled_at) AS verified_at
        FROM settled_edges
        """
    ).fetchall()
    settled_lookup = {
        (row["from_user"], row["to_user"], int(row["amount_cents"])): row["verified_at"]
        for row in settled_rows
    }

    pending_offset_rows = connection.execute(
        """
        SELECT id, from_user, to_user, amount_cents, asset_code, quantity, status, created_at
        FROM pending_asset_offsets
        WHERE status = 'PENDING'
        """
    ).fetchall()
    pending_offset_lookup = {
        (row["from_user"], row["to_user"], int(row["amount_cents"])): {
            "offset_id": int(row["id"]),
            "asset_code": row["asset_code"],
            "quantity": int(row["quantity"]),
            "status": row["status"],
            "created_at": row["created_at"],
        }
        for row in pending_offset_rows
    }

    settlement_rows: list[dict[str, float | str | bool | int | dict[str, int | str] | None]] = []
    for settlement in settlements:
        from_user = str(settlement["from"])
        to_user = str(settlement["to"])
        amount = round(float(settlement["amount"]), 2)
        amount_cents = int(round(amount * 100))
        debt_created_at = assignment_lookup.get((from_user, to_user, amount_cents))
        settlement_verified_at = settled_lookup.get((from_user, to_user, amount_cents))
        pending_offset = pending_offset_lookup.get((from_user, to_user, amount_cents))
        settlement_status = "pending_offset" if pending_offset else "pending_receipt"
        if settlement_verified_at is not None:
            settlement_status = "settled"

        settlement_rows.append(
            {
                "edge_id": settlement_edge_id(from_user, to_user, amount),
                "from": from_user,
                "to": to_user,
                "amount": amount,
                "debt_created_at": debt_created_at,
                "is_settled": settlement_verified_at is not None,
                "settlement_status": settlement_status,
                "pending_offset": pending_offset,
                "settlement_verified_at": settlement_verified_at,
            }
        )

    return settlement_rows


def trust_points_for_settlement(created_at: datetime, verified_at: datetime) -> int:
    elapsed_hours = (verified_at - created_at).total_seconds() / 3600

    if elapsed_hours <= 2:
        return 10
    if elapsed_hours <= 24:
        return 5
    if elapsed_hours > 48:
        return -5
    return 0


def map_tier(score: int) -> str:
    if score >= 150:
        return "Gold"
    if score >= 51:
        return "Silver"
    return "Bronze"


def calculate_progress(score: int, tier: str) -> tuple[int, int | None, int | None]:
    if tier == "Gold":
        return (100, None, None)

    if tier == "Silver":
        next_threshold = 150
        points_to_next = max(0, next_threshold - score)
        progress = int(max(0, min(100, ((score - 51) / 99) * 100)))
        return (progress, points_to_next, next_threshold)

    next_threshold = 51
    points_to_next = max(0, next_threshold - score)
    progress = int(max(0, min(100, (max(score, 0) / 50) * 100)))
    return (progress, points_to_next, next_threshold)


def get_user_trust_profile(
    connection: sqlite3.Connection,
    user_name: str,
) -> dict[str, int | str | float | None]:
    rows = connection.execute(
        """
        SELECT da.debt_created_at,
               COALESCE(se.settlement_verified_at, se.settled_at) AS settlement_verified_at
        FROM debt_assignments AS da
        JOIN settled_edges AS se
          ON da.from_user = se.from_user
         AND da.to_user = se.to_user
         AND da.amount_cents = se.amount_cents
        WHERE da.from_user = ?
          AND COALESCE(se.settlement_verified_at, se.settled_at) IS NOT NULL
        """,
        (user_name,),
    ).fetchall()

    total_points = 0
    scored_settlements = 0
    for row in rows:
        created_at = parse_db_timestamp(row["debt_created_at"])
        verified_at = parse_db_timestamp(row["settlement_verified_at"])
        if created_at is None or verified_at is None:
            continue
        total_points += trust_points_for_settlement(created_at, verified_at)
        scored_settlements += 1

    tier = map_tier(total_points)
    progress_percent, points_to_next_tier, next_tier_threshold = calculate_progress(total_points, tier)

    return {
        "user": user_name,
        "trust_points": total_points,
        "tier": tier,
        "progress_percent": progress_percent,
        "points_to_next_tier": points_to_next_tier,
        "next_tier_threshold": next_tier_threshold,
        "scored_settlements": scored_settlements,
    }


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/reset", include_in_schema=False)
def reset_demo_state() -> dict[str, object]:
    with get_connection() as connection:
        seed_demo_graph(connection)
        balances = compute_net_balances(connection)
        settlements = optimize_settlements(balances)
        connection.commit()

    return {
        "reset": True,
        "users": DEFAULT_USERS,
        "demo_expenses": len(DEMO_EXPENSES),
        "settlements": settlements,
    }


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
        connection.commit()

    balance_rows = [
        {"user": user, "balance": round(amount, 2)}
        for user, amount in sorted(balances.items())
    ]

    return {
        "balances": balance_rows,
        "settlements": settlement_rows,
    }


@app.get("/api/assets")
def get_asset_registry(user_name: str | None = None) -> dict[str, list[dict[str, float | int | str]]]:
    with get_connection() as connection:
        users = set(fetch_users(connection))
        if user_name and user_name not in users:
            raise HTTPException(status_code=404, detail="User not found")

        asset_rows = connection.execute(
            """
            SELECT da.asset_code, da.label, da.unit_value,
                   COALESCE(uaw.quantity, 0) AS quantity
            FROM digital_assets AS da
            LEFT JOIN user_asset_wallet AS uaw
              ON da.asset_code = uaw.asset_code
             AND (? IS NOT NULL AND uaw.user_name = ?)
            ORDER BY da.asset_code
            """,
            (user_name, user_name),
        ).fetchall()

        assets = [
            {
                "asset_code": row["asset_code"],
                "label": row["label"],
                "unit_value": float(row["unit_value"]),
                "quantity": int(row["quantity"]),
            }
            for row in asset_rows
        ]

        return {"assets": assets}


@app.post("/api/offsets/propose")
def propose_asset_offset(payload: AssetOffsetCreate) -> dict[str, float | int | str]:
    with get_connection() as connection:
        users = set(fetch_users(connection))
        if payload.from_user not in users or payload.to_user not in users:
            raise HTTPException(status_code=400, detail="Unknown user in offset request")

        asset_row = connection.execute(
            "SELECT asset_code, unit_value, label FROM digital_assets WHERE asset_code = ?",
            (payload.asset_code,),
        ).fetchone()
        if asset_row is None:
            raise HTTPException(status_code=404, detail="Asset not found")

        expected_amount_rounded = round(payload.expected_amount, 2)
        amount_cents = int(round(expected_amount_rounded * 100))
        voucher_value = round(float(asset_row["unit_value"]) * int(payload.quantity), 2)
        if abs(voucher_value - expected_amount_rounded) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Asset value mismatch. {asset_row['label']} x {payload.quantity} is "
                    f"{voucher_value:.2f}, expected {expected_amount_rounded:.2f}"
                ),
            )

        balances = compute_net_balances(connection)
        live_settlements = optimize_settlements(balances)
        settlement_exists = any(
            str(item["from"]) == payload.from_user
            and str(item["to"]) == payload.to_user
            and abs(round(float(item["amount"]), 2) - expected_amount_rounded) < 0.01
            for item in live_settlements
        )
        if not settlement_exists:
            raise HTTPException(status_code=400, detail="Settlement is no longer pending")

        if connection.execute(
            """
            SELECT id FROM settled_edges
            WHERE from_user = ? AND to_user = ? AND amount_cents = ?
            """,
            (payload.from_user, payload.to_user, amount_cents),
        ).fetchone():
            raise HTTPException(status_code=400, detail="Settlement already cleared")

        wallet_row = connection.execute(
            """
            SELECT quantity
            FROM user_asset_wallet
            WHERE user_name = ? AND asset_code = ?
            """,
            (payload.from_user, payload.asset_code),
        ).fetchone()
        available_quantity = int(wallet_row["quantity"]) if wallet_row else 0
        if available_quantity < payload.quantity:
            raise HTTPException(status_code=400, detail="Insufficient voucher inventory")

        existing_pending = connection.execute(
            """
            SELECT id FROM pending_asset_offsets
            WHERE from_user = ? AND to_user = ? AND amount_cents = ? AND status = 'PENDING'
            """,
            (payload.from_user, payload.to_user, amount_cents),
        ).fetchone()
        if existing_pending:
            raise HTTPException(status_code=409, detail="An offset is already pending for this debt")

        connection.execute(
            """
            INSERT OR IGNORE INTO debt_assignments(from_user, to_user, amount_cents)
            VALUES (?, ?, ?)
            """,
            (payload.from_user, payload.to_user, amount_cents),
        )

        cursor = connection.execute(
            """
            INSERT INTO pending_asset_offsets(
                from_user,
                to_user,
                amount_cents,
                asset_code,
                quantity,
                status
            ) VALUES (?, ?, ?, ?, ?, 'PENDING')
            """,
            (
                payload.from_user,
                payload.to_user,
                amount_cents,
                payload.asset_code,
                payload.quantity,
            ),
        )
        connection.commit()

        return {
            "offset_id": int(cursor.lastrowid),
            "status": "PENDING",
            "from": payload.from_user,
            "to": payload.to_user,
            "amount": expected_amount_rounded,
            "asset_code": payload.asset_code,
            "asset_label": asset_row["label"],
            "quantity": int(payload.quantity),
        }


@app.post("/api/offsets/respond")
def respond_asset_offset(payload: AssetOffsetDecision) -> dict[str, float | int | str]:
    normalized_action = payload.action.strip().upper()
    if normalized_action not in {"ACCEPT", "REJECT"}:
        raise HTTPException(status_code=400, detail="Action must be ACCEPT or REJECT")

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT pao.id, pao.from_user, pao.to_user, pao.amount_cents,
                   pao.asset_code, pao.quantity, pao.status,
                   da.label, da.unit_value
            FROM pending_asset_offsets AS pao
            JOIN digital_assets AS da ON pao.asset_code = da.asset_code
            WHERE pao.id = ?
            """,
            (payload.offset_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Offset request not found")

        if row["status"] != "PENDING":
            raise HTTPException(status_code=400, detail="Offset request is already resolved")

        if payload.actor_user != row["to_user"]:
            raise HTTPException(status_code=403, detail="Only the creditor can respond")

        amount = round(int(row["amount_cents"]) / 100.0, 2)

        if normalized_action == "REJECT":
            connection.execute(
                """
                UPDATE pending_asset_offsets
                SET status = 'REJECT',
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by = ?
                WHERE id = ?
                """,
                (payload.actor_user, payload.offset_id),
            )
            connection.commit()
            return {
                "offset_id": int(payload.offset_id),
                "status": "REJECT",
                "from": row["from_user"],
                "to": row["to_user"],
                "amount": amount,
            }

        debtor_wallet = connection.execute(
            """
            SELECT quantity
            FROM user_asset_wallet
            WHERE user_name = ? AND asset_code = ?
            """,
            (row["from_user"], row["asset_code"]),
        ).fetchone()
        debtor_quantity = int(debtor_wallet["quantity"]) if debtor_wallet else 0
        if debtor_quantity < int(row["quantity"]):
            raise HTTPException(status_code=400, detail="Debtor no longer has enough vouchers")

        balances = compute_net_balances(connection)
        live_settlements = optimize_settlements(balances)
        settlement_exists = any(
            str(item["from"]) == row["from_user"]
            and str(item["to"]) == row["to_user"]
            and abs(round(float(item["amount"]), 2) - amount) < 0.01
            for item in live_settlements
        )
        if not settlement_exists:
            raise HTTPException(status_code=400, detail="Settlement is no longer pending")

        connection.execute(
            """
            UPDATE user_asset_wallet
            SET quantity = quantity - ?
            WHERE user_name = ? AND asset_code = ?
            """,
            (int(row["quantity"]), row["from_user"], row["asset_code"]),
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO user_asset_wallet(user_name, asset_code, quantity)
            VALUES (?, ?, 0)
            """,
            (row["to_user"], row["asset_code"]),
        )
        connection.execute(
            """
            UPDATE user_asset_wallet
            SET quantity = quantity + ?
            WHERE user_name = ? AND asset_code = ?
            """,
            (int(row["quantity"]), row["to_user"], row["asset_code"]),
        )

        synthetic_hash = f"asset-offset-{payload.offset_id}"
        connection.execute(
            """
            INSERT OR IGNORE INTO receipt_hashes(file_hash, algorithm)
            VALUES (?, ?)
            """,
            (synthetic_hash, "asset_offset"),
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
                ocr_text,
                settlement_verified_at
            ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(from_user, to_user, amount_cents)
            DO UPDATE SET
                receipt_hash = excluded.receipt_hash,
                receipt_timestamp = CURRENT_TIMESTAMP,
                ocr_amount = excluded.ocr_amount,
                ocr_text = excluded.ocr_text,
                settled_at = CURRENT_TIMESTAMP,
                settlement_verified_at = CURRENT_TIMESTAMP
            """,
            (
                row["from_user"],
                row["to_user"],
                int(row["amount_cents"]),
                synthetic_hash,
                amount,
                f"ASSET_OFFSET:{row['asset_code']} x{row['quantity']}",
            ),
        )
        connection.execute(
            """
            UPDATE pending_asset_offsets
            SET status = 'ACCEPT',
                resolved_at = CURRENT_TIMESTAMP,
                resolved_by = ?
            WHERE id = ?
            """,
            (payload.actor_user, payload.offset_id),
        )
        connection.commit()

        return {
            "offset_id": int(payload.offset_id),
            "status": "ACCEPT",
            "from": row["from_user"],
            "to": row["to_user"],
            "amount": amount,
            "asset_code": row["asset_code"],
            "asset_label": row["label"],
            "quantity": int(row["quantity"]),
        }


@app.get("/api/trust-profile/{user_name}")
def get_trust_profile(user_name: str) -> dict[str, int | str | float | None]:
    with get_connection() as connection:
        users = set(fetch_users(connection))
        if user_name not in users:
            raise HTTPException(status_code=404, detail="User not found")

        return get_user_trust_profile(connection, user_name)


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

        amount_cents = int(round(expected_amount_rounded * 100))
        connection.execute(
            """
            INSERT OR IGNORE INTO debt_assignments(from_user, to_user, amount_cents)
            VALUES (?, ?, ?)
            """,
            (from_user, to_user, amount_cents),
        )

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
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Could not read amount, please retake photo",
            )

        parsed_amount = parse_receipt_amount(ocr_text)
        if parsed_amount is None:
            raise HTTPException(
                status_code=400,
                detail="Could not read amount, please retake photo",
            )

        parsed_timestamp = parse_receipt_timestamp(ocr_text)
        if parsed_timestamp is None:
            raise HTTPException(
                status_code=400,
                detail="Could not read timestamp, please retake photo",
            )

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
                settled_at = CURRENT_TIMESTAMP,
                settlement_verified_at = CURRENT_TIMESTAMP
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
        connection.execute(
            """
            UPDATE settled_edges
            SET settlement_verified_at = COALESCE(settlement_verified_at, CURRENT_TIMESTAMP)
            WHERE from_user = ?
              AND to_user = ?
              AND amount_cents = ?
            """,
            (from_user, to_user, amount_cents),
        )
        connection.commit()

    return {
        "verified": True,
        "from": from_user,
        "to": to_user,
        "amount": expected_amount_rounded,
        "receipt_hash": file_hash,
    }
