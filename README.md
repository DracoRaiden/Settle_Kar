# 💸 Settle Kar

**The algorithmic debt-simplification engine for localized cash economies.**

**Presentation Link:** https://gamma.app/docs/Split-smarter-Settle-faster-Trust-earned-anq4oy3qhpyrtu6?mode=doc

Built for the **"Money Moves"** FinTech Hackathon.

## 🚀 The Vision

In cash-heavy campus environments and shared living spaces, group expenses create a messy, high-friction web of micro-debts. When multiple people share dinners, travel, and supply costs, figuring out exactly "who owes whom" becomes a mathematical nightmare. This friction causes money to get stuck, settlements to be delayed, and trust to erode among peers.

**Settle Kar** is a mobile-first, Neo-Banking ledger that mathematically untangles group finances. Instead of just acting as a digital notebook, it actively optimizes how money moves.

When users input shared expenses, our backend engine runs a complex **graph optimization algorithm**. It instantly calculates the absolute minimum number of transactions required for the entire group to reach a zero balance. If User A owes User B Rs. 500, and User B owes User C Rs. 500, Settle Kar dynamically routes User A to pay User C directly—bypassing the middleman, reducing cash handovers, and accelerating liquidity in the local ecosystem.

## 🛠️ Tech Stack

We engineered Settle Kar for maximum speed and a frictionless user experience, splitting the architecture into a high-performance mathematical core and a highly polished client interface.

**Frontend (The Neo-Banking UI):**

- **React & Vite:** For blazing-fast local development and instant component rendering.
- **Tailwind CSS:** Implementing a mobile-first, high-trust FinTech design system with dynamic visual feedback (Net Balance Badges, Overlapping Avatars).
- **Vercel:** Edge-network deployment.

**Backend (The Algorithmic Core):**

- **Python 3:** The engine driving the heavy mathematical graph routing.
- **FastAPI:** A lightning-fast REST API framework that provides native JSON validation and seamless frontend-backend communication.
- **Greedy Network Flow Logic:** Custom-built debt simplification algorithms minimizing edges (transactions) in directed financial graphs.

## ✨ Core Features

- **Sleek, Mobile-First Dashboard:** A responsive UI that provides instant clarity on net balances (+ / -) without overwhelming the user with raw data.
- **Group-Based Ledger Isolation:** Manage multiple financial circles (e.g., "Hackathon Trip", "Hostel Room 402") with isolated debt graphs.
- **Algorithmic Path Optimization:** The core graph engine mathematically calculates the fewest possible transactions needed to settle all debts in a group.
- **Bank-Style Activity Feed:** Clear, categorized, and timestamped transaction histories for absolute financial transparency.

## 💻 Run it Locally

To test the application locally, you will need two terminal windows to run the frontend and backend concurrently.

### 1. Start the Python Backend

Navigate to the backend directory and start the FastAPI server:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

````

_The API will be live at `http://localhost:8000`_

### 2. Start the React Frontend

Open a new terminal, navigate to the frontend directory, and start Vite:

```bash
cd frontend
npm install
npm run dev
```

_The UI will be live at `http://localhost:5173`_

## 🏆 Why it Wins "Money Moves"

We didn't build a massive, multi-year banking platform with hundreds of bloated features. We built **100% of one highly specific, deeply impactful feature**. Settle Kar takes the anxiety out of shared finances, ensuring that capital keeps moving smoothly, quickly, and efficiently through localized economies.

---

_Designed and engineered during a 48-hour sprint._

```

```
````
