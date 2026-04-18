import { useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import "./App.css";
import ErrorBoundary from "./ErrorBoundary";

const tabs = ["Ledger", "Settle", "Trust Profile"];
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const TAB_META = {
  Ledger: {
    label: "Ledger",
    icon: LedgerIcon,
  },
  Settle: {
    label: "Settle",
    icon: SwapIcon,
  },
  "Trust Profile": {
    label: "Trust",
    icon: UserShieldIcon,
  },
};

function LedgerIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 3v2h10V7H7Zm0 4v2h10v-2H7Zm0 4v2h6v-2H7Z" />
    </svg>
  );
}

function SwapIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 7h10l-2.5-2.5L16 3l5 5-5 5-1.5-1.5L17 9H7V7Zm10 10H7l2.5 2.5L8 21l-5-5 5-5 1.5 1.5L7 15h10v2Z" />
    </svg>
  );
}

function UserShieldIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2 4 5v6c0 5.25 3.55 10.12 8 11 4.45-.88 8-5.75 8-11V5l-8-3Zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm-4 11a4 4 0 0 1 8 0H8Z" />
    </svg>
  );
}

function PlusIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M11 5h2v14h-2V5Zm-6 6h14v2H5v-2Z" />
    </svg>
  );
}

function ChevronUpIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="m7 14 5-5 5 5H7Z" />
    </svg>
  );
}

function CloseIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4Z" />
    </svg>
  );
}

function avatarLabel(name) {
  if (!name) {
    return "?";
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function categoryForExpense(description) {
  const normalized = String(description || "").toLowerCase();
  if (/food|meal|dinner|lunch|breakfast|coffee|snack/.test(normalized)) {
    return { icon: "🍽️", label: "Food" };
  }
  if (/travel|fuel|ride|cab|taxi|trip|bus|train/.test(normalized)) {
    return { icon: "🧭", label: "Travel" };
  }
  if (/booth|setup|stage|print|poster|banner|marketing/.test(normalized)) {
    return { icon: "🧾", label: "Operations" };
  }
  if (/rent|hotel|stay|room/.test(normalized)) {
    return { icon: "🏨", label: "Stay" };
  }

  return { icon: "💸", label: "Expense" };
}

function buildExpenseShare(expense, activeUser) {
  const participants = expense.split_among || [];
  if (
    !participants.length ||
    !activeUser ||
    !participants.includes(activeUser)
  ) {
    return 0;
  }

  return Number((Number(expense.amount) / participants.length).toFixed(2));
}

function netBalanceForUser(ledgerBalances, activeUser) {
  const match = ledgerBalances.find((row) => row.user === activeUser);
  return match?.balance || 0;
}

function formatSignedCurrency(value) {
  const number = Number(value || 0);
  const absolute = Math.abs(number).toFixed(2);
  return number >= 0 ? `+Rs. ${absolute}` : `-Rs. ${absolute}`;
}

function formatShortCurrency(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

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
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    paidBy: "",
    amount: "",
    description: "",
    splitAmong: [],
  });

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
      showError(error.message || "Failed to load trust profile.");
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
      showError(error.message || "Failed to load asset catalog.");
    }
  }

  useEffect(() => {
    fetchTrustProfile(activeUser);
    fetchAssetCatalog(activeUser);
  }, [activeUser]);

  useEffect(() => {
    if (!isExpenseSheetOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isExpenseSheetOpen]);

  useEffect(() => {
    if (!isProfileSheetOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isProfileSheetOpen]);

  const activeBalance = useMemo(
    () => netBalanceForUser(ledgerBalances, activeUser),
    [activeUser, ledgerBalances],
  );

  const balanceTone =
    activeBalance > 0 ? "positive" : activeBalance < 0 ? "negative" : "neutral";

  const activeUserInitials = avatarLabel(activeUser || users[0] || "User");

  const expenseDraftTotal = useMemo(
    () => Number(expenseForm.amount || 0),
    [expenseForm.amount],
  );

  const splitEligibleUsers = users.length > 0 ? users : [];

  const selectedExpenseUsers =
    expenseForm.splitAmong.length > 0
      ? expenseForm.splitAmong
      : splitEligibleUsers;

  const expenseSplitCount = selectedExpenseUsers.length || 1;
  const expenseSplitPerPerson =
    expenseDraftTotal > 0 ? expenseDraftTotal / expenseSplitCount : 0;

  async function handleExpenseSubmit(event) {
    event.preventDefault();
    setStatusMessage("");

    if (expenseForm.splitAmong.length === 0) {
      showError("Pick at least one person in Split Among.");
      return;
    }

    if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
      showError("Amount must be greater than zero.");
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
      setIsExpenseSheetOpen(false);
      await refreshLedgerData();
      showSuccess("Graph Optimized! Expense added successfully.");
    } catch (error) {
      showError(error.message || "Something went wrong while saving.");
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

  function openExpenseSheet() {
    setExpenseForm((current) => ({
      ...current,
      paidBy: current.paidBy || activeUser || users[0] || "",
      splitAmong:
        current.splitAmong.length > 0 ? current.splitAmong : users.slice(),
    }));
    setIsExpenseSheetOpen(true);
  }

  function closeExpenseSheet() {
    setIsExpenseSheetOpen(false);
  }

  function openProfileSheet() {
    setIsProfileSheetOpen(true);
  }

  function closeProfileSheet() {
    setIsProfileSheetOpen(false);
  }

  function selectActiveUser(userName) {
    setActiveUser(userName);
    setIsProfileSheetOpen(false);
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
      showSuccess("Receipt Verified! Settlement marked as settled.");
      await refreshLedgerData();
    } catch (error) {
      setReceiptStatusByEdge((current) => ({
        ...current,
        [transaction.edge_id]: "error",
      }));
      showError(error.message || "Receipt upload failed.");
    }
  }

  async function handleOffsetProposal(transaction) {
    const selectedAssetCode =
      selectedAssetByEdge[transaction.edge_id] || assetCatalog[0]?.asset_code;
    if (!selectedAssetCode) {
      showError("No voucher available to offer.");
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
      showSuccess("Offset proposed. Waiting for creditor response.");
      await refreshLedgerData();
      await fetchAssetCatalog(activeUser);
    } catch (error) {
      setOffsetStatusByEdge((current) => ({
        ...current,
        [transaction.edge_id]: "error",
      }));
      showError(error.message || "Failed to propose asset offset.");
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
      if (action === "ACCEPT") {
        showSuccess("Asset Offset Accepted! Debt cleared.");
      } else {
        showSuccess("Asset Offset Rejected.");
      }
      await refreshLedgerData();
      await fetchAssetCatalog(activeUser);
      await fetchTrustProfile(activeUser);
    } catch (error) {
      setOffsetDecisionStatusById((current) => ({
        ...current,
        [offsetId]: "error",
      }));
      showError(error.message || "Failed to process offset decision.");
    }
  }

  function renderLedgerHero() {
    const isPositive = activeBalance > 0;
    const heroValue =
      activeBalance === 0 ? "Settled up" : formatSignedCurrency(activeBalance);
    const subtitle = isPositive
      ? "You are owed money."
      : activeBalance < 0
        ? "You owe the group."
        : "You are perfectly balanced.";

    return (
      <section className={`hero-card tone-${balanceTone}`}>
        <div className="hero-copy">
          <p className="eyebrow">Net Balance</p>
          <h2>{heroValue}</h2>
          <p className="hero-subtitle">{subtitle}</p>
        </div>

        <div className="hero-meta">
          <div className="hero-pill">
            <span>Active user</span>
            <strong>{activeUser || "Select user"}</strong>
          </div>
          <div className="hero-pill hero-pill-muted">
            <span>Trust tier</span>
            <strong>{trustProfile?.tier || "Bronze"}</strong>
          </div>
        </div>
      </section>
    );
  }

  function renderExpenseList() {
    if (expenses.length === 0) {
      return (
        <p className="empty-state">No expenses yet. Create the first one.</p>
      );
    }

    return (
      <ul className="txn-list">
        {expenses.map((expense) => {
          const category = categoryForExpense(expense.description);
          const splitShare = buildExpenseShare(expense, activeUser);
          const isOwed = activeUser && expense.paid_by === activeUser;

          return (
            <li key={expense.id} className="txn-card">
              <div className="txn-icon" aria-hidden="true">
                <span>{category.icon}</span>
              </div>
              <div className="txn-body">
                <div className="txn-title-row">
                  <strong>{expense.description || "Untitled expense"}</strong>
                  <span className="txn-badge">{category.label}</span>
                </div>
                <p>
                  Paid by {expense.paid_by}
                  {expense.split_among?.length
                    ? ` • Split with ${expense.split_among.length}`
                    : ""}
                </p>
              </div>
              <div className={`txn-amount ${isOwed ? "credit" : "debit"}`}>
                <strong>{formatShortCurrency(splitShare)}</strong>
                <span>{isOwed ? "You received" : "Your share"}</span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderTab() {
    if (activeTab === "Ledger") {
      return (
        <section className="ledger-screen">
          {renderLedgerHero()}

          <button
            type="button"
            className="new-expense-btn"
            onClick={openExpenseSheet}
          >
            <PlusIcon className="nav-icon" />
            <span>New Expense</span>
          </button>

          <section className="ledger-section">
            <div className="section-head">
              <h3>Recent Activity</h3>
              <p>Clear, bank-style transaction history.</p>
            </div>
            {renderExpenseList()}
          </section>
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
      <Toaster
        position="top-center"
        toastOptions={{ style: { fontSize: "0.88rem", borderRadius: "16px" } }}
      />
      <div className="app-frame">
        <header className="top-bar">
          <button
            type="button"
            className="brand-wrap brand-btn"
            onClick={() => setActiveTab("Ledger")}
          >
            <span className="brand-mark">SK</span>
            <span className="brand-stack">
              <span className="brand">Settle Kar</span>
              <span className="brand-subline">
                <span
                  className={`health-dot ${apiHealthy ? "is-up" : "is-down"}`}
                />
                <span>{apiHealthy ? "Live" : "Offline"}</span>
              </span>
            </span>
          </button>

          <button
            type="button"
            className="avatar-btn"
            onClick={openProfileSheet}
            aria-label="Switch active user"
          >
            <span>{activeUserInitials}</span>
          </button>
        </header>

        <main className="tab-content">
          <ErrorBoundary>{renderTab()}</ErrorBoundary>
        </main>

        <nav className="bottom-nav" aria-label="Primary navigation">
          {tabs.map((tab) => {
            const TabIcon = TAB_META[tab].icon;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                className={`bottom-nav-btn ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                <TabIcon className="nav-icon" />
                <span>{TAB_META[tab].label}</span>
              </button>
            );
          })}
        </nav>

        {isExpenseSheetOpen && (
          <div className="sheet-backdrop" onClick={closeExpenseSheet}>
            <section
              className="expense-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-handle-row">
                <span className="sheet-handle" />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={closeExpenseSheet}
                  aria-label="Close expense form"
                >
                  <CloseIcon className="nav-icon" />
                </button>
              </div>

              <div className="sheet-header">
                <div>
                  <p className="eyebrow">New Expense</p>
                  <h2>Split a payment instantly</h2>
                </div>
                <button
                  type="button"
                  className="sheet-chip"
                  onClick={() =>
                    setExpenseForm((current) => ({
                      ...current,
                      splitAmong: users.slice(),
                    }))
                  }
                >
                  Select all
                </button>
              </div>

              <form
                className="expense-form expense-sheet-form"
                onSubmit={handleExpenseSubmit}
              >
                <label className="form-field">
                  <span>Paid by</span>
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

                <label className="form-field amount-field">
                  <span>Amount</span>
                  <div className="calc-input-wrap">
                    <span className="currency-prefix">Rs.</span>
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
                      placeholder="1200"
                    />
                  </div>
                </label>

                <label className="form-field">
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
                    placeholder="Booth setup, dinner, fuel"
                  />
                </label>

                <div className="pill-group-wrap">
                  <div className="section-head compact">
                    <h3>Split among</h3>
                    <p>Tap to deselect users.</p>
                  </div>
                  <div className="pill-group">
                    {users.map((user) => {
                      const isSelected = expenseForm.splitAmong.length
                        ? expenseForm.splitAmong.includes(user)
                        : true;

                      return (
                        <button
                          key={user}
                          type="button"
                          className={`user-pill ${isSelected ? "selected" : "muted"}`}
                          onClick={() => toggleSplitMember(user)}
                        >
                          <span>{avatarLabel(user)}</span>
                          {user}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sheet-spacer" />
                <button
                  type="submit"
                  className="sheet-submit"
                  disabled={submitting || users.length === 0}
                >
                  {submitting
                    ? "Saving..."
                    : `Split Rs. ${expenseDraftTotal.toFixed(2)}${expenseDraftTotal > 0 ? ` • Rs. ${expenseSplitPerPerson.toFixed(2)} each` : ""}`}
                </button>
              </form>
            </section>
          </div>
        )}

        {isProfileSheetOpen && (
          <div className="sheet-backdrop" onClick={closeProfileSheet}>
            <section
              className="profile-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sheet-handle-row">
                <span className="sheet-handle" />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={closeProfileSheet}
                  aria-label="Close profile switcher"
                >
                  <CloseIcon className="nav-icon" />
                </button>
              </div>

              <div className="sheet-header">
                <div>
                  <p className="eyebrow">Active profile</p>
                  <h2>Switch user</h2>
                </div>
              </div>

              <div className="profile-list">
                {users.map((user) => (
                  <button
                    key={user}
                    type="button"
                    className={`profile-row ${activeUser === user ? "active" : ""}`}
                    onClick={() => selectActiveUser(user)}
                  >
                    <span className="profile-avatar">{avatarLabel(user)}</span>
                    <span className="profile-meta">
                      <strong>{user}</strong>
                      <small>
                        {activeUser === user ? "Current user" : "Tap to switch"}
                      </small>
                    </span>
                    {activeUser === user && <span className="profile-dot" />}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
