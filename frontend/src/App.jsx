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
  const [trustProfile, setTrustProfile] = useState(null);
  const [trustLoading, setTrustLoading] = useState(false);
  const [receiptStatusByEdge, setReceiptStatusByEdge] = useState({});
  const [assetCatalog, setAssetCatalog] = useState([]);
  const [selectedAssetByEdge, setSelectedAssetByEdge] = useState({});
  const [offsetStatusByEdge, setOffsetStatusByEdge] = useState({});
  const [offsetDecisionStatusById, setOffsetDecisionStatusById] = useState({});
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

  const incomingOffsetRequests = useMemo(
    () =>
      pendingSettlements.filter(
        (transaction) =>
          transaction.to === activeUser &&
          transaction.pending_offset &&
          transaction.settlement_status === "pending_offset",
      ),
    [activeUser, pendingSettlements],
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

  async function fetchTrustProfile(userName) {
    if (!userName) {
      return;
    }

    setTrustLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/trust-profile/${encodeURIComponent(userName)}`,
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.detail || "Failed to load trust profile");
      }

      const profileData = await response.json();
      setTrustProfile(profileData);
    } catch (error) {
      setTrustProfile(null);
      setStatusMessage(error.message || "Failed to load trust profile.");
    } finally {
      setTrustLoading(false);
    }
  }

  async function fetchAssetCatalog(userName) {
    if (!userName) {
      setAssetCatalog([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/assets?user_name=${encodeURIComponent(userName)}`,
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.detail || "Failed to load asset catalog");
      }

      const payload = await response.json();
      const assets = payload.assets || [];
      setAssetCatalog(assets);
    } catch (error) {
      setAssetCatalog([]);
      setStatusMessage(error.message || "Failed to load asset catalog.");
    }
  }

  useEffect(() => {
    fetchTrustProfile(activeUser);
    fetchAssetCatalog(activeUser);
  }, [activeUser]);

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

  async function handleOffsetProposal(transaction) {
    const selectedAssetCode =
      selectedAssetByEdge[transaction.edge_id] || assetCatalog[0]?.asset_code;
    if (!selectedAssetCode) {
      setStatusMessage("No voucher available to offer.");
      return;
    }

    setStatusMessage("");
    setOffsetStatusByEdge((current) => ({
      ...current,
      [transaction.edge_id]: "submitting",
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/offsets/propose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_user: transaction.from,
          to_user: transaction.to,
          expected_amount: Number(transaction.amount),
          asset_code: selectedAssetCode,
          quantity: 1,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(
          errorPayload.detail || "Failed to propose asset offset",
        );
      }

      setOffsetStatusByEdge((current) => ({
        ...current,
        [transaction.edge_id]: "pending",
      }));
      setStatusMessage("Asset offset proposed. Waiting for creditor response.");
      await refreshLedgerData();
      await fetchAssetCatalog(activeUser);
    } catch (error) {
      setOffsetStatusByEdge((current) => ({
        ...current,
        [transaction.edge_id]: "error",
      }));
      setStatusMessage(error.message || "Failed to propose asset offset.");
    }
  }

  async function handleOffsetDecision(offsetId, action) {
    setStatusMessage("");
    setOffsetDecisionStatusById((current) => ({
      ...current,
      [offsetId]: "submitting",
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/offsets/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offset_id: offsetId,
          actor_user: activeUser,
          action,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(
          errorPayload.detail || "Failed to process offset decision",
        );
      }

      setOffsetDecisionStatusById((current) => ({
        ...current,
        [offsetId]: action.toLowerCase(),
      }));
      setStatusMessage(
        action === "ACCEPT"
          ? "Asset offset accepted and debt cleared."
          : "Asset offset rejected.",
      );
      await refreshLedgerData();
      await fetchAssetCatalog(activeUser);
      await fetchTrustProfile(activeUser);
    } catch (error) {
      setOffsetDecisionStatusById((current) => ({
        ...current,
        [offsetId]: "error",
      }));
      setStatusMessage(error.message || "Failed to process offset decision.");
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
            {incomingOffsetRequests.length > 0 && (
              <div className="offset-alert-wrap">
                {incomingOffsetRequests.map((transaction) => {
                  const pendingOffset = transaction.pending_offset;
                  const pendingAsset = assetCatalog.find(
                    (asset) => asset.asset_code === pendingOffset?.asset_code,
                  );
                  const isSubmitting =
                    offsetDecisionStatusById[pendingOffset?.offset_id] ===
                    "submitting";

                  return (
                    <div
                      key={pendingOffset?.offset_id || transaction.edge_id}
                      className="offset-alert"
                    >
                      <p>
                        <strong>High Priority:</strong> {transaction.from} wants
                        to settle their {formatCurrency(transaction.amount)}{" "}
                        debt with {pendingOffset?.quantity || 1}x{" "}
                        {pendingAsset?.label || pendingOffset?.asset_code}.
                      </p>
                      <div className="offset-action-row">
                        <button
                          type="button"
                          className="offset-accept"
                          disabled={isSubmitting}
                          onClick={() =>
                            handleOffsetDecision(
                              pendingOffset.offset_id,
                              "ACCEPT",
                            )
                          }
                        >
                          {isSubmitting ? "Processing..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          className="offset-reject"
                          disabled={isSubmitting}
                          onClick={() =>
                            handleOffsetDecision(
                              pendingOffset.offset_id,
                              "REJECT",
                            )
                          }
                        >
                          {isSubmitting ? "Processing..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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
                      const isDebtor = transaction.from === activeUser;
                      const pendingOffset = transaction.pending_offset;
                      const hasPendingOffset =
                        transaction.settlement_status === "pending_offset" &&
                        pendingOffset;
                      const selectedAssetCode =
                        selectedAssetByEdge[transaction.edge_id] ||
                        assetCatalog[0]?.asset_code ||
                        "";
                      const selectedAsset = assetCatalog.find(
                        (asset) => asset.asset_code === selectedAssetCode,
                      );
                      const isProposingOffset =
                        offsetStatusByEdge[transaction.edge_id] ===
                        "submitting";

                      return (
                        <li
                          key={transaction.edge_id}
                          className="settlement-item settlement-pending"
                        >
                          <div className="settlement-main">
                            <span>
                              {transaction.from} pays {transaction.to}{" "}
                              {formatCurrency(transaction.amount)}
                            </span>
                            {hasPendingOffset && (
                              <strong className="pending-offset-chip">
                                Pending Offset
                              </strong>
                            )}
                          </div>

                          {hasPendingOffset ? (
                            <p className="offset-mini-text">
                              Waiting for {transaction.to} to review{" "}
                              {pendingOffset.quantity}x{" "}
                              {pendingOffset.asset_code}.
                            </p>
                          ) : (
                            <div className="settlement-actions">
                              <label className="upload-btn">
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={isUploading}
                                  onChange={(event) => {
                                    const selectedFile =
                                      event.target.files?.[0];
                                    handleReceiptUpload(
                                      transaction,
                                      selectedFile,
                                    );
                                    event.target.value = "";
                                  }}
                                />
                                {isUploading
                                  ? "Verifying..."
                                  : "Upload Receipt"}
                              </label>

                              {isDebtor && (
                                <div className="asset-offset-row">
                                  <select
                                    value={selectedAssetCode}
                                    onChange={(event) =>
                                      setSelectedAssetByEdge((current) => ({
                                        ...current,
                                        [transaction.edge_id]:
                                          event.target.value,
                                      }))
                                    }
                                    disabled={
                                      isProposingOffset ||
                                      assetCatalog.length === 0
                                    }
                                  >
                                    {assetCatalog.length === 0 ? (
                                      <option value="">No assets</option>
                                    ) : (
                                      assetCatalog.map((asset) => (
                                        <option
                                          key={asset.asset_code}
                                          value={asset.asset_code}
                                        >
                                          {asset.label} (You own:{" "}
                                          {asset.quantity})
                                        </option>
                                      ))
                                    )}
                                  </select>
                                  <button
                                    type="button"
                                    className="asset-settle-btn"
                                    disabled={
                                      isProposingOffset ||
                                      !selectedAssetCode ||
                                      !selectedAsset ||
                                      selectedAsset.quantity < 1
                                    }
                                    onClick={() =>
                                      handleOffsetProposal(transaction)
                                    }
                                  >
                                    {isProposingOffset
                                      ? "Proposing..."
                                      : "Settle with Asset"}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
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
          {!activeUser ? (
            <p>Select an active user to view trust profile.</p>
          ) : trustLoading ? (
            <p>Loading trust profile...</p>
          ) : trustProfile ? (
            <div className="trust-card">
              <div className="trust-header">
                <p className="trust-user">{trustProfile.user}</p>
                <span
                  className={`tier-badge tier-${String(trustProfile.tier || "").toLowerCase()}`}
                >
                  {trustProfile.tier}
                </span>
              </div>

              <p className="trust-points">
                {trustProfile.trust_points} Trust Points
              </p>

              <div className="trust-progress-wrap" aria-label="Trust progress">
                <div
                  className="trust-progress-fill"
                  style={{ width: `${trustProfile.progress_percent || 0}%` }}
                />
              </div>

              <p className="trust-meta">
                Scored settlements: {trustProfile.scored_settlements}
              </p>

              {trustProfile.points_to_next_tier != null ? (
                <p className="trust-meta">
                  {trustProfile.points_to_next_tier} points to reach next tier.
                </p>
              ) : (
                <p className="trust-meta">
                  Top tier reached. Keep settling fast.
                </p>
              )}
            </div>
          ) : (
            <p>Trust profile is unavailable right now.</p>
          )}
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
