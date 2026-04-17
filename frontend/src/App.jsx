import { useEffect, useMemo, useState } from "react";
import "./App.css";

const tabs = ["Ledger", "Settle", "Trust Profile"];
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function formatCurrency(value) {
  return `Rs. ${Number(value).toFixed(2)}`;
}

function App() {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState("");
  const [apiHealthy, setApiHealthy] = useState(false);
  const [ledgerBalances, setLedgerBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [receiptStatusByEdge, setReceiptStatusByEdge] = useState({});
  const [expenseForm, setExpenseForm] = useState({
    paidBy: "",
    amount: "",
    description: "",
    splitAmong: [],
  });

  useEffect(() => {
    let isMounted = true;

    async function bootstrapApp() {
      try {
        const [
          healthResponse,
          usersResponse,
          ledgerResponse,
          expensesResponse,
        ] = await Promise.all([
          fetch(`${API_BASE_URL}/api/health`),
          fetch(`${API_BASE_URL}/api/users`),
          fetch(`${API_BASE_URL}/api/ledger`),
          fetch(`${API_BASE_URL}/api/expenses`),
        ]);

        if (
          !healthResponse.ok ||
          !usersResponse.ok ||
          !ledgerResponse.ok ||
          !expensesResponse.ok
        ) {
          throw new Error("Failed to load application data");
        }

        const healthData = await healthResponse.json();
        const usersData = await usersResponse.json();
        const ledgerData = await ledgerResponse.json();
        const expensesData = await expensesResponse.json();

        if (isMounted) {
          const loadedUsers = usersData.users || [];
          setApiHealthy(healthData.status === "ok");
          setUsers(loadedUsers);
          setLedgerBalances(ledgerData.balances || []);
          setSettlements(ledgerData.settlements || []);
          setExpenses(expensesData.expenses || []);

          if (loadedUsers.length > 0) {
            setActiveUser((current) => current || loadedUsers[0]);
            setExpenseForm((current) => ({
              ...current,
              paidBy: current.paidBy || loadedUsers[0],
              splitAmong:
                current.splitAmong.length > 0
                  ? current.splitAmong
                  : loadedUsers,
            }));
          }
        }
      } catch {
        if (isMounted) {
          setApiHealthy(false);
          setStatusMessage(
            "Could not connect to backend. Ensure FastAPI is running.",
          );
        }
      }
    }

    bootstrapApp();

    return () => {
      isMounted = false;
    };
  }, []);

  const personalizedInstructions = useMemo(() => {
    if (!activeUser) {
      return [];
    }

    return settlements
      .filter((transaction) => !transaction.is_settled)
      .map((transaction) => {
        if (transaction.from === activeUser) {
          return `You owe ${transaction.to} ${formatCurrency(transaction.amount)}`;
        }
        if (transaction.to === activeUser) {
          return `${transaction.from} owes you ${formatCurrency(transaction.amount)}`;
        }
        return null;
      })
      .filter(Boolean);
  }, [activeUser, settlements]);

  const pendingSettlements = useMemo(
    () => settlements.filter((transaction) => !transaction.is_settled),
    [settlements],
  );

  const settledSettlements = useMemo(
    () => settlements.filter((transaction) => transaction.is_settled),
    [settlements],
  );

  async function refreshLedgerData() {
    const [ledgerResponse, expensesResponse] = await Promise.all([
      fetch(`${API_BASE_URL}/api/ledger`),
      fetch(`${API_BASE_URL}/api/expenses`),
    ]);

    if (!ledgerResponse.ok || !expensesResponse.ok) {
      throw new Error("Failed to refresh ledger data");
    }

    const ledgerData = await ledgerResponse.json();
    const expensesData = await expensesResponse.json();

    setLedgerBalances(ledgerData.balances || []);
    setSettlements(ledgerData.settlements || []);
    setExpenses(expensesData.expenses || []);
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setStatusMessage("");

    if (expenseForm.splitAmong.length === 0) {
      setStatusMessage("Pick at least one person in Split Among.");
      return;
    }

    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      setStatusMessage("Amount must be greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paid_by: expenseForm.paidBy,
          amount: Number(expenseForm.amount),
          split_among: expenseForm.splitAmong,
          description: expenseForm.description,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.detail || "Failed to add expense");
      }

      setExpenseForm((current) => ({
        ...current,
        amount: "",
        description: "",
      }));
      await refreshLedgerData();
      setStatusMessage("Expense added successfully.");
    } catch (error) {
      setStatusMessage(error.message || "Something went wrong while saving.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSplitMember(userName) {
    setExpenseForm((current) => {
      const exists = current.splitAmong.includes(userName);
      const nextMembers = exists
        ? current.splitAmong.filter((name) => name !== userName)
        : [...current.splitAmong, userName];

      return {
        ...current,
        splitAmong: nextMembers,
      };
    });
  }

  async function handleReceiptUpload(transaction, file) {
    if (!file) {
      return;
    }

    setStatusMessage("");
    setReceiptStatusByEdge((current) => ({
      ...current,
      [transaction.edge_id]: "uploading",
    }));

    try {
      const formData = new FormData();
      formData.append("from_user", transaction.from);
      formData.append("to_user", transaction.to);
      formData.append("expected_amount", String(transaction.amount));
      formData.append("receipt", file);

      const response = await fetch(
        `${API_BASE_URL}/api/settlements/verify-receipt`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.detail || "Receipt verification failed");
      }

      setReceiptStatusByEdge((current) => ({
        ...current,
        [transaction.edge_id]: "verified",
      }));
      setStatusMessage("Receipt verified. Settlement marked as settled.");
      await refreshLedgerData();
    } catch (error) {
      setReceiptStatusByEdge((current) => ({
        ...current,
        [transaction.edge_id]: "error",
      }));
      setStatusMessage(error.message || "Receipt upload failed.");
    }
  }

  function renderTab() {
    if (activeTab === "Ledger") {
      return (
        <section className="tab-layout">
          <div className="panel">
            <h2>Add Group Expense</h2>
            <form className="expense-form" onSubmit={handleExpenseSubmit}>
              <label>
                <span>Paid By</span>
                <select
                  value={expenseForm.paidBy}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      paidBy: event.target.value,
                    }))
                  }
                >
                  {users.map((user) => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Amount</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={expenseForm.amount}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  placeholder="e.g. 1200"
                />
              </label>

              <label>
                <span>Description</span>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(event) =>
                    setExpenseForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Dinner, fuel, groceries"
                />
              </label>

              <fieldset className="split-box">
                <legend>Split Among</legend>
                {users.map((user) => (
                  <label key={user} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={expenseForm.splitAmong.includes(user)}
                      onChange={() => toggleSplitMember(user)}
                    />
                    <span>{user}</span>
                  </label>
                ))}
              </fieldset>

              <button type="submit" disabled={submitting || users.length === 0}>
                {submitting ? "Adding..." : "Add Expense"}
              </button>
            </form>
            {statusMessage && <p className="status-text">{statusMessage}</p>}
          </div>

          <div className="panel">
            <h2>Net Balances</h2>
            {ledgerBalances.length === 0 ? (
              <p>No balances yet. Add an expense to begin.</p>
            ) : (
              <ul className="balance-list">
                {ledgerBalances.map((row) => (
                  <li key={row.user}>
                    <span>{row.user}</span>
                    <strong
                      className={
                        row.balance > 0
                          ? "is-positive"
                          : row.balance < 0
                            ? "is-negative"
                            : ""
                      }
                    >
                      {formatCurrency(row.balance)}
                    </strong>
                  </li>
                ))}
              </ul>
            )}

            <h2>Raw Expenses</h2>
            {expenses.length === 0 ? (
              <p>No expenses recorded yet.</p>
            ) : (
              <ul className="expense-list">
                {expenses.map((expense) => (
                  <li key={expense.id}>
                    <p>
                      <strong>
                        {expense.description || "Untitled expense"}
                      </strong>
                    </p>
                    <p>
                      {expense.paid_by} paid {formatCurrency(expense.amount)}
                    </p>
                    <p>Split among: {expense.split_among.join(", ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      );
    }

    if (activeTab === "Settle") {
      return (
        <section className="tab-layout single">
          <div className="panel">
            <h2>Optimized Settlements</h2>
            {settlements.length === 0 ? (
              <p>All balances are settled. No transactions required.</p>
            ) : (
              <>
                <h3>Pending</h3>
                {pendingSettlements.length === 0 ? (
                  <p>No pending settlements.</p>
                ) : (
                  <ul className="settlement-list">
                    {pendingSettlements.map((transaction) => {
                      const receiptStatus =
                        receiptStatusByEdge[transaction.edge_id] || "idle";
                      const isUploading = receiptStatus === "uploading";
                      return (
                        <li
                          key={transaction.edge_id}
                          className="settlement-item settlement-pending"
                        >
                          <span>
                            {transaction.from} pays {transaction.to}{" "}
                            {formatCurrency(transaction.amount)}
                          </span>
                          <label className="upload-btn">
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isUploading}
                              onChange={(event) => {
                                const selectedFile = event.target.files?.[0];
                                handleReceiptUpload(transaction, selectedFile);
                                event.target.value = "";
                              }}
                            />
                            {isUploading ? "Verifying..." : "Upload Receipt"}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <h3>Settled</h3>
                {settledSettlements.length === 0 ? (
                  <p>No settlements verified yet.</p>
                ) : (
                  <ul className="settlement-list">
                    {settledSettlements.map((transaction) => (
                      <li
                        key={transaction.edge_id}
                        className="settlement-item settlement-done"
                      >
                        <span>
                          {transaction.from} paid {transaction.to}{" "}
                          {formatCurrency(transaction.amount)}
                        </span>
                        <strong className="settled-chip" aria-label="Settled">
                          ✔ Settled
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <h3>For {activeUser || "Active User"}</h3>
            {personalizedInstructions.length === 0 ? (
              <p>You are all settled up.</p>
            ) : (
              <ul className="instruction-list">
                {personalizedInstructions.map((instruction) => (
                  <li key={instruction}>{instruction}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="tab-layout single">
        <div className="panel">
          <h2>Trust Profile</h2>
          <p>
            Trust scoring and profile insights will be implemented in Module 3.
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-wrap">
          <span className="brand">Settle Kar</span>
          <span
            className={`health-dot ${apiHealthy ? "is-up" : "is-down"}`}
            title={apiHealthy ? "Backend connected" : "Backend disconnected"}
            aria-label={
              apiHealthy ? "Backend connected" : "Backend disconnected"
            }
          />
        </div>

        <label className="user-switch" htmlFor="active-user-select">
          <span>Switch Active User</span>
          <select
            id="active-user-select"
            value={activeUser}
            onChange={(event) => setActiveUser(event.target.value)}
            disabled={users.length === 0}
          >
            {users.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav className="tabs" aria-label="Main sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        <h1>{activeTab}</h1>
        <p className="active-user">Current active user: {activeUser}</p>
        {renderTab()}
      </main>
    </div>
  );
}

export default App;
