# Settle Kar

Settle Kar is a split-expense and debt-settlement platform that combines digital trust, OCR-based settlement verification, and asset-backed offset clearing.

It includes:

- A FastAPI backend with SQLite persistence.
- A React + Vite frontend.
- Smart debt graph optimization.
- OCR proof verification for payment receipts.
- Trust-velocity scoring (Bronze, Silver, Gold).
- Multi-modal asset offsets using digital vouchers.

## Project Features

### 1. Expense + Ledger Engine

- Add expenses and split among users.
- Compute net balances for each user.
- Generate optimized debtor -> creditor settlement edges.

### 2. Zero-Cost Proof of Settlement (OCR)

- Upload receipt images to settle debts.
- OCR text extraction using Tesseract.
- Amount and timestamp validation.
- Duplicate receipt detection via SHA-256 hash.

### 3. Trust-Velocity Credit Scoring

- Records debt creation and settlement times.
- Awards trust points based on speed of settlement.
- Exposes trust profile and tier progression.

### 4. Multi-Modal Asset Offset (Liquidity Engine)

- Registers predefined digital vouchers.
- Debtor can propose settling debt with a voucher.
- Creditor receives a high-priority accept/reject notification.
- On accept, voucher ownership transfers and debt is cleared.

## Tech Stack

- Backend: FastAPI, SQLite, Pydantic
- Frontend: React 18, Vite
- OCR: pytesseract, Pillow, system Tesseract binary

## Repository Structure

```text
backend/
	main.py
	requirements.txt
frontend/
	package.json
	src/
```

## Prerequisites

Install these before setup:

1. Python 3.11+ (3.13 works as well)
2. Node.js 18+
3. npm (ships with Node.js)
4. Tesseract OCR (required for receipt verification)

### Install Tesseract OCR (Windows)

1. Install Tesseract (for example, from UB Mannheim builds).
2. Add the Tesseract install folder to PATH.
3. Verify in terminal:

```powershell
tesseract --version
```

If this command fails, OCR settlement verification endpoints will return errors.

## Complete Setup (First-Time Clone)

### 1. Clone and enter project

```powershell
git clone <your-repo-url>
cd Settle_Kar
```

### 2. Create and activate Python virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install backend dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r .\backend\requirements.txt
```

### 4. Install frontend dependencies

```powershell
cd frontend
npm install
cd ..
```

## Run the App

Open two terminals from the repository root.

### Terminal A: Start backend

```powershell
.\.venv\Scripts\python.exe -m uvicorn --app-dir .\backend main:app --host 127.0.0.1 --port 8000
```

Backend health URL:

```text
http://127.0.0.1:8000/api/health
```

### Terminal B: Start frontend

```powershell
cd frontend
npm run dev
```

Frontend URL (default Vite):

```text
http://127.0.0.1:5173
```

## Optional Frontend API Base URL

Frontend defaults to `http://127.0.0.1:8000`.

If needed, create `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## API Overview

Core endpoints:

- `GET /api/health`
- `GET /api/users`
- `GET /api/expenses`
- `POST /api/expenses`
- `GET /api/ledger`
- `POST /api/settlements/verify-receipt`
- `GET /api/trust-profile/{user_name}`
- `GET /api/assets`
- `POST /api/offsets/propose`
- `POST /api/offsets/respond`

## Demo Users and Assets

Seeded users:

- User A
- User B
- User C

Seeded asset:

- `POSTER_12X18_MATTE` -> 12x18 Matte Poster Voucher, Rs. 300

## Build and Validation

### Frontend production build

```powershell
cd frontend
npm run build
```

### Backend syntax check

```powershell
cd backend
python -m py_compile main.py
```

## Troubleshooting

### 1. `404 Not Found` for new endpoints

You are likely running an old backend process. Stop all running uvicorn servers and restart using the command from this README.

### 2. `Could not connect to backend`

- Ensure backend is running on port 8000.
- Ensure frontend points to the same API URL.

### 3. OCR errors during receipt verification

- Confirm Tesseract is installed.
- Confirm `tesseract --version` works in the same shell where backend runs.
- Restart backend after updating PATH.

### 4. Import/dependency issues

Always install using the same Python interpreter used to run uvicorn. Using different global Python versions can cause package mismatch.

## Contributor Notes

- Backend database file: `backend/settle_kar.db` (auto-created).
- CORS is enabled for local Vite dev origins.
- Keep backend and frontend running concurrently during development.
