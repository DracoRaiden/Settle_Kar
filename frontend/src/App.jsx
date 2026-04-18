import { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import "./App.css";
import ErrorBoundary from "./ErrorBoundary";

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

  // User management state
  const [newUserName, setNewUserName] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [removingUser, setRemovingUser] = useState("");
  const [showUserPanel, setShowUserPanel] = useState(false);

  function showSuccess(message) {
    setStatusMessage(message);
    toast.success(message, { duration: 2200 });
  }

  function showError(message) {
    setStatusMessage(message);
    toast.error(message, { duration: 2800 });
  }

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
          showError("Could not connect to backend. Ensure FastAPI is running.");
        }
      }
    }

    bootstrapApp();

    return () => {
      isMounted = false;
    };
  }, []);

  const personalizedInstructions = useMemo(() => {
    if (!activeUser) return [];
    return settlements
      .filter((t) => !t.is_settled)
      .map((t) => {
        if (t.from === activeUser) return `You owe ${t.to} ${formatCurrency(t.amount)}`;
        if (t.to === activeUser) return `${t.from} owes you ${formatCurrency(t.amount)}`;
        return null;
      })
      .filter(Boolean);
  }, [activeUser, settlements]);

  const pendingSettlements = useMemo(
    () => settlements.filter((t) => !t.is_settled),
    [settlements],
  );

  const settledSettlements = useMemo(
    () => settlements.filter((t) => t.is_settled),
    [settlements],
  );

  const incomingOffsetRequests = useMemo(
    () =>
      pendingSettlements.filter(
        (t) =>
          t.to === activeUser &&
          t.pending_offset &&
          t.settlement_status === "pending_offset",
      ),
    [activeUser, pendingSettlements],
  );

  async function refreshLedgerData() {
    const [lr, er] = await Promise.all([
      fetch(`${API_BASE_URL}/api/ledger`),
      fetch(`${API_BASE_URL}/api/expenses`),
    ]);
    if (!lr.ok || !er.ok) throw new Error("Failed to refresh ledger data");
    const ld = await lr.json();
    const ed = await er.json();
    setLedgerBalances(ld.balances || []);
    setSettlements(ld.settlements || []);
    setExpenses(ed.expenses || []);
  }

  async function fetchTrustProfile(userName) {
    if (!userName) return;
    setTrustLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/trust-profile/${encodeURIComponent(userName)}`);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Failed to load trust profile"); }
      setTrustProfile(await r.json());
    } catch (err) {
      setTrustProfile(null);
      showError(err.message || "Failed to load trust profile.");
    } finally {
      setTrustLoading(false);
    }
  }

  async function fetchAssetCatalog(userName) {
    if (!userName) { setAssetCatalog([]); return; }
    try {
      const r = await fetch(`${API_BASE_URL}/api/assets?user_name=${encodeURIComponent(userName)}`);
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Failed to load assets"); }
      setAssetCatalog((await r.json()).assets || []);
    } catch (err) {
      setAssetCatalog([]);
      showError(err.message || "Failed to load asset catalog.");
    }
  }

  useEffect(() => {
    fetchTrustProfile(activeUser);
    fetchAssetCatalog(activeUser);
  }, [activeUser]);

  async function handleAddUser(event) {
    event.preventDefault();
    const name = newUserName.trim();
    if (!name) return;
    setAddingUser(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Failed to add user"); }
      const data = await r.json();
      const updated = data.users || [];
      setUsers(updated);
      setNewUserName("");
      if (updated.length === 1) {
        setActiveUser(updated[0]);
        setExpenseForm((c) => ({ ...c, paidBy: updated[0], splitAmong: updated }));
      } else {
        setExpenseForm((c) => ({ ...c, splitAmong: updated }));
      }
      showSuccess(`"${name}" added to the group.`);
    } catch (err) {
      showError(err.message || "Failed to add user.");
    } finally {
      setAddingUser(false);
    }
  }

  async function handleRemoveUser(userName) {
    setRemovingUser(userName);
    try {
      const r = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(userName)}`, { method: "DELETE" });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Failed to remove user"); }
      const data = await r.json();
      const updated = data.users || [];
      setUsers(updated);
      if (activeUser === userName) setActiveUser(updated[0] || "");
      setExpenseForm((c) => ({
        ...c,
        paidBy: c.paidBy === userName ? (updated[0] || "") : c.paidBy,
        splitAmong: c.splitAmong.filter((u) => u !== userName),
      }));
      showSuccess(`"${userName}" removed from the group.`);
    } catch (err) {
      showError(err.message || "Failed to remove user.");
    } finally {
      setRemovingUser("");
    }
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setStatusMessage("");
    if (expenseForm.splitAmong.length === 0) { showError("Pick at least one person in Split Among."); return; }
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) { showError("Amount must be greater than zero."); return; }
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paid_by: expenseForm.paidBy,
          amount: Number(expenseForm.amount),
          split_among: expenseForm.splitAmong,
          description: expenseForm.description,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Failed to add expense"); }
      setExpenseForm((c) => ({ ...c, amount: "", description: "" }));
      await refreshLedgerData();
      showSuccess("Graph Optimized! Expense added successfully.");
    } catch (err) {
      showError(err.message || "Something went wrong while saving.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSplitMember(userName) {
    setExpenseForm((c) => {
      const exists = c.splitAmong.includes(userName);
      return { ...c, splitAmong: exists ? c.splitAmong.filter((n) => n !== userName) : [...c.splitAmong, userName] };
    });
  }

  async function handleReceiptUpload(transaction, file) {
    if (!file) return;
    setStatusMessage("");
    setReceiptStatusByEdge((c) => ({ ...c, [transaction.edge_id]: "uploading" }));
    try {
      const fd = new FormData();
      fd.append("from_user", transaction.from);
      fd.append("to_user", transaction.to);
      fd.append("expected_amount", String(transaction.amount));
      fd.append("receipt", file);
      const r = await fetch(`${API_BASE_URL}/api/settlements/verify-receipt`, { method: "POST", body: fd });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Receipt verification failed"); }
      setReceiptStatusByEdge((c) => ({ ...c, [transaction.edge_id]: "verified" }));
      showSuccess("Receipt Verified! Settlement marked as settled.");
      await refreshLedgerData();
    } catch (err) {
      setReceiptStatusByEdge((c) => ({ ...c, [transaction.edge_id]: "error" }));
      showError(err.message || "Receipt upload failed.");
    }
  }

  async function handleOffsetProposal(transaction) {
    const code = selectedAssetByEdge[transaction.edge_id] || assetCatalog[0]?.asset_code;
    if (!code) { showError("No voucher available to offer."); return; }
    setStatusMessage("");
    setOffsetStatusByEdge((c) => ({ ...c, [transaction.edge_id]: "submitting" }));
    try {
      const r = await fetch(`${API_BASE_URL}/api/offsets/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_user: transaction.from, to_user: transaction.to, expected_amount: Number(transaction.amount), asset_code: code, quantity: 1 }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Failed to propose asset offset"); }
      setOffsetStatusByEdge((c) => ({ ...c, [transaction.edge_id]: "pending" }));
      showSuccess("Offset proposed. Waiting for creditor response.");
      await refreshLedgerData();
      await fetchAssetCatalog(activeUser);
    } catch (err) {
      setOffsetStatusByEdge((c) => ({ ...c, [transaction.edge_id]: "error" }));
      showError(err.message || "Failed to propose asset offset.");
    }
  }

  async function handleOffsetDecision(offsetId, action) {
    setStatusMessage("");
    setOffsetDecisionStatusById((c) => ({ ...c, [offsetId]: "submitting" }));
    try {
      const r = await fetch(`${API_BASE_URL}/api/offsets/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset_id: offsetId, actor_user: activeUser, action }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Failed to process offset decision"); }
      setOffsetDecisionStatusById((c) => ({ ...c, [offsetId]: action.toLowerCase() }));
      showSuccess(action === "ACCEPT" ? "Asset Offset Accepted! Debt cleared." : "Asset Offset Rejected.");
      await refreshLedgerData();
      await fetchAssetCatalog(activeUser);
      await fetchTrustProfile(activeUser);
    } catch (err) {
      setOffsetDecisionStatusById((c) => ({ ...c, [offsetId]: "error" }));
      showError(err.message || "Failed to process offset decision.");
    }
  }

  function renderTab() {
    if (activeTab === "Ledger") {
      return (
        <section className="tab-layout">
          <div className="panel">
            <h2>Add Group Expense</h2>
            {users.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💸</div>
                <p>No participants yet.</p>
                <p className="empty-sub">Use <strong>Manage Users</strong> above to add people first.</p>
              </div>
            ) : (
              <form className="expense-form" onSubmit={handleExpenseSubmit}>
                <label>
                  <span>Paid By</span>
                  <select value={expenseForm.paidBy} onChange={(e) => setExpenseForm((c) => ({ ...c, paidBy: e.target.value }))}>
                    {users.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </label>
                <label>
                  <span>Amount</span>
                  <input type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm((c) => ({ ...c, amount: e.target.value }))} placeholder="e.g. 1200" />
                </label>
                <label>
                  <span>Description</span>
                  <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm((c) => ({ ...c, description: e.target.value }))} placeholder="Dinner, fuel, groceries" />
                </label>
                <fieldset className="split-box">
                  <legend>Split Among</legend>
                  {users.map((u) => (
                    <label key={u} className="checkbox-row">
                      <input type="checkbox" checked={expenseForm.splitAmong.includes(u)} onChange={() => toggleSplitMember(u)} />
                      <span>{u}</span>
                    </label>
                  ))}
                </fieldset>
                <button type="submit" disabled={submitting}>{submitting ? "Adding..." : "Add Expense"}</button>
              </form>
            )}
            {statusMessage && <p className="status-text">{statusMessage}</p>}
          </div>

          <div className="panel">
            <h2>Net Balances</h2>
            {ledgerBalances.length === 0 ? (
              <p className="muted">No balances yet. Add an expense to begin.</p>
            ) : (
              <ul className="balance-list">
                {ledgerBalances.map((row) => (
                  <li key={row.user}>
                    <span>{row.user}</span>
                    <strong className={row.balance > 0 ? "is-positive" : row.balance < 0 ? "is-negative" : ""}>
                      {formatCurrency(row.balance)}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            <h2>Raw Expenses</h2>
            {expenses.length === 0 ? (
              <p className="muted">No expenses recorded yet.</p>
            ) : (
              <ul className="expense-list">
                {expenses.map((expense) => (
                  <li key={expense.id}>
                    <p><strong>{expense.description || "Untitled expense"}</strong></p>
                    <p>{expense.paid_by} paid {formatCurrency(expense.amount)}</p>
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
                  const po = transaction.pending_offset;
                  const pa = assetCatalog.find((a) => a.asset_code === po?.asset_code);
                  const isSubmitting = offsetDecisionStatusById[po?.offset_id] === "submitting";
                  return (
                    <div key={po?.offset_id || transaction.edge_id} className="offset-alert">
                      <p><strong>High Priority:</strong> {transaction.from} wants to settle their {formatCurrency(transaction.amount)} debt with {po?.quantity || 1}x {pa?.label || po?.asset_code}.</p>
                      <div className="offset-action-row">
                        <button type="button" className="offset-accept" disabled={isSubmitting} onClick={() => handleOffsetDecision(po.offset_id, "ACCEPT")}>{isSubmitting ? "Processing..." : "Accept"}</button>
                        <button type="button" className="offset-reject" disabled={isSubmitting} onClick={() => handleOffsetDecision(po.offset_id, "REJECT")}>{isSubmitting ? "Processing..." : "Reject"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {settlements.length === 0 ? (
              <p className="muted">All balances are settled. No transactions required.</p>
            ) : (
              <>
                <h3>Pending</h3>
                {pendingSettlements.length === 0 ? (
                  <p className="muted">No pending settlements.</p>
                ) : (
                  <ul className="settlement-list">
                    {pendingSettlements.map((transaction) => {
                      const receiptStatus = receiptStatusByEdge[transaction.edge_id] || "idle";
                      const isUploading = receiptStatus === "uploading";
                      const isDebtor = transaction.from === activeUser;
                      const po = transaction.pending_offset;
                      const hasPO = transaction.settlement_status === "pending_offset" && po;
                      const selCode = selectedAssetByEdge[transaction.edge_id] || assetCatalog[0]?.asset_code || "";
                      const selAsset = assetCatalog.find((a) => a.asset_code === selCode);
                      const isProposing = offsetStatusByEdge[transaction.edge_id] === "submitting";
                      return (
                        <li key={transaction.edge_id} className="settlement-item settlement-pending">
                          <div className="settlement-main">
                            <span>{transaction.from} pays {transaction.to} {formatCurrency(transaction.amount)}</span>
                            {hasPO && <strong className="pending-offset-chip">Pending Offset</strong>}
                          </div>
                          {hasPO ? (
                            <p className="offset-mini-text">Waiting for {transaction.to} to review {po.quantity}x {po.asset_code}.</p>
                          ) : (
                            <div className="settlement-actions">
                              <label className="upload-btn">
                                <input type="file" accept="image/*" disabled={isUploading} onChange={(e) => { handleReceiptUpload(transaction, e.target.files?.[0]); e.target.value = ""; }} />
                                {isUploading ? "Verifying..." : "Upload Receipt"}
                              </label>
                              {isDebtor && (
                                <div className="asset-offset-row">
                                  <select value={selCode} onChange={(e) => setSelectedAssetByEdge((c) => ({ ...c, [transaction.edge_id]: e.target.value }))} disabled={isProposing || assetCatalog.length === 0}>
                                    {assetCatalog.length === 0 ? <option value="">No assets</option> : assetCatalog.map((a) => <option key={a.asset_code} value={a.asset_code}>{a.label} (You own: {a.quantity})</option>)}
                                  </select>
                                  <button type="button" className="asset-settle-btn" disabled={isProposing || !selCode || !selAsset || selAsset.quantity < 1} onClick={() => handleOffsetProposal(transaction)}>
                                    {isProposing ? "Proposing..." : "Settle with Asset"}
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
                  <p className="muted">No settlements verified yet.</p>
                ) : (
                  <ul className="settlement-list">
                    {settledSettlements.map((t) => (
                      <li key={t.edge_id} className="settlement-item settlement-done">
                        <span>{t.from} paid {t.to} {formatCurrency(t.amount)}</span>
                        <strong className="settled-chip" aria-label="Settled">✔ Settled</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <h3>For {activeUser || "Active User"}</h3>
            {personalizedInstructions.length === 0 ? (
              <p className="muted">You are all settled up.</p>
            ) : (
              <ul className="instruction-list">
                {personalizedInstructions.map((i) => <li key={i}>{i}</li>)}
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
            <p className="muted">Select an active user to view trust profile.</p>
          ) : trustLoading ? (
            <p className="muted">Loading trust profile...</p>
          ) : trustProfile ? (
            <div className="trust-card">
              <div className="trust-header">
                <p className="trust-user">{trustProfile.user}</p>
                <span className={`tier-badge tier-${String(trustProfile.tier || "").toLowerCase()}`}>{trustProfile.tier}</span>
              </div>
              <p className="trust-points">{trustProfile.trust_points} Trust Points</p>
              <div className="trust-progress-wrap" aria-label="Trust progress">
                <div className="trust-progress-fill" style={{ width: `${trustProfile.progress_percent || 0}%` }} />
              </div>
              <p className="trust-meta">Scored settlements: {trustProfile.scored_settlements}</p>
              {trustProfile.points_to_next_tier != null ? (
                <p className="trust-meta">{trustProfile.points_to_next_tier} points to reach next tier.</p>
              ) : (
                <p className="trust-meta">Top tier reached. Keep settling fast.</p>
              )}
            </div>
          ) : (
            <p className="muted">Trust profile is unavailable right now.</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontSize: "0.88rem", background: "#1e2533", color: "#e2e8f0", border: "1px solid #2d3748" },
        }}
      />
      <header className="top-bar">
        <div className="brand-wrap">
          <span className="brand">Settle Kar</span>
          <span
            className={`health-dot ${apiHealthy ? "is-up" : "is-down"}`}
            title={apiHealthy ? "Backend connected" : "Backend disconnected"}
            aria-label={apiHealthy ? "Backend connected" : "Backend disconnected"}
          />
        </div>
        <label className="user-switch" htmlFor="active-user-select">
          <span>Active User</span>
          <select id="active-user-select" value={activeUser} onChange={(e) => setActiveUser(e.target.value)} disabled={users.length === 0}>
            {users.length === 0 ? (
              <option value="">— Add users first —</option>
            ) : (
              users.map((u) => <option key={u} value={u}>{u}</option>)
            )}
          </select>
        </label>
      </header>

      <div className="user-manager-wrap">
        <div className={`user-panel ${showUserPanel ? "open" : ""}`}>
          <button className="user-panel-toggle" type="button" onClick={() => setShowUserPanel((v) => !v)}>
            <span className="user-panel-icon">👥</span>
            Manage Participants
            <span className="user-count-badge">{users.length}</span>
            <span className="chevron">{showUserPanel ? "▲" : "▼"}</span>
          </button>

          {showUserPanel && (
            <div className="user-panel-body">
              <form className="add-user-form" onSubmit={handleAddUser}>
                <input
                  type="text"
                  placeholder="Enter participant name…"
                  value={newUserName}
                  maxLength={50}
                  onChange={(e) => setNewUserName(e.target.value)}
                  disabled={addingUser}
                />
                <button type="submit" className="btn-add-user" disabled={addingUser || !newUserName.trim()}>
                  {addingUser ? "Adding…" : "+ Add"}
                </button>
              </form>

              {users.length === 0 ? (
                <p className="no-users-hint">No participants yet. Add names above to get started.</p>
              ) : (
                <ul className="user-chip-list">
                  {users.map((user) => (
                    <li key={user} className="user-chip">
                      <span className="user-chip-avatar">{user.charAt(0).toUpperCase()}</span>
                      <span className="user-chip-name">{user}</span>
                      <button
                        type="button"
                        className="user-chip-remove"
                        title={`Remove ${user}`}
                        disabled={removingUser === user}
                        onClick={() => handleRemoveUser(user)}
                      >
                        {removingUser === user ? "…" : "×"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <nav className="tabs" aria-label="Main sections">
        {tabs.map((tab) => (
          <button key={tab} type="button" className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        <h1>{activeTab}</h1>
        <p className="active-user">
          {activeUser ? `Viewing as: ${activeUser}` : "No active user selected"}
        </p>
        <ErrorBoundary>{renderTab()}</ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
