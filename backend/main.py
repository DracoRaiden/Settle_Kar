import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
def get_ledger() -> dict[str, list[dict[str, float | str]]]:
    with get_connection() as connection:
        balances = compute_net_balances(connection)
        settlements = optimize_settlements(balances)

    balance_rows = [
        {"user": user, "balance": round(amount, 2)}
        for user, amount in sorted(balances.items())
    ]

    return {
        "balances": balance_rows,
        "settlements": settlements,
    }
