import { useMemo, useState } from "react";

const ROOT_TABS = {
  groups: "groups",
  trust: "trust",
  profile: "profile",
};

const API_BASE_URL = "http://127.0.0.1:8000";

function normalizePhoneNumber(phone) {
  const digitsOnly = phone.replace(/\D/g, "");
  if (digitsOnly) {
    return digitsOnly;
  }
  return phone.trim();
}

const GROUPS_MOCK = [
  {
    id: "hackathon-trip",
    name: "Hackathon Trip",
    activeMemberId: "ak",
    members: [
      { id: "ak", initials: "AK", name: "User A", phone: "+1 555 0100" },
      { id: "zm", initials: "ZM", name: "User B", phone: "+1 555 0200" },
      { id: "fr", initials: "FR", name: "User C", phone: "+1 555 0300" },
    ],
    expenses: [
      {
        id: "trip-1",
        title: "Dinner at Downtown Grill",
        subtitle: "You paid for the group",
        amount: 420,
        payerId: "ak",
        splitAmong: ["ak", "zm", "fr"],
      },
      {
        id: "trip-2",
        title: "Cab to venue",
        subtitle: "Split between 3 members",
        amount: 180,
        payerId: "zm",
        splitAmong: ["ak", "zm", "fr"],
      },
      {
        id: "trip-3",
        title: "Hotel advance",
        subtitle: "User B reimbursed you",
        amount: 300,
        payerId: "fr",
        splitAmong: ["ak", "zm", "fr"],
      },
    ],
  },
  {
    id: "weekend-foods",
    name: "Weekend Foods",
    activeMemberId: "ak",
    members: [
      { id: "ak", initials: "AK", name: "User A", phone: "+1 555 0100" },
      { id: "zh", initials: "ZH", name: "User B", phone: "+1 555 0400" },
      { id: "ra", initials: "RA", name: "User C", phone: "+1 555 0500" },
    ],
    expenses: [
      {
        id: "food-1",
        title: "Groceries",
        subtitle: "You covered the bill",
        amount: 250,
        payerId: "ak",
        splitAmong: ["ak", "zh", "ra"],
      },
      {
        id: "food-2",
        title: "Tea and snacks",
        subtitle: "Split equally",
        amount: 90,
        payerId: "zh",
        splitAmong: ["ak", "zh", "ra"],
      },
      {
        id: "food-3",
        title: "Cash settle-up",
        subtitle: "User C paid you back",
        amount: 180,
        payerId: "ra",
        splitAmong: ["ak", "zh", "ra"],
      },
    ],
  },
];

function HomeIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M3.75 10.5 12 4l8.25 6.5V19.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75V10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M12 3.75 5.25 6.5v5.25c0 4.2 2.7 8.02 6.75 9.25 4.05-1.23 6.75-5.05 6.75-9.25V6.5L12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m9.25 12.2 1.65 1.65 3.85-3.85"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5.75 19.25a6.25 6.25 0 0 1 12.5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NetBalanceBadge({ amount }) {
  const label = `${amount >= 0 ? "+" : "-"}Rs. ${Math.abs(amount)}`;

  if (amount >= 0) {
    return (
      <span className="bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-full text-sm inline-block">
        {label}
      </span>
    );
  }

  return (
    <span className="bg-rose-100 text-rose-700 font-bold px-3 py-1 rounded-full text-sm inline-block">
      {label}
    </span>
  );
}

function calculateBalancesFromExpenses(members, expenses) {
  const balances = Object.fromEntries(members.map((member) => [member.id, 0]));

  expenses.forEach((expense) => {
    const splitAmong = expense.splitAmong.filter(
      (memberId) => memberId in balances,
    );
    if (!splitAmong.length) {
      return;
    }

    const share = Math.round((expense.amount / splitAmong.length) * 100) / 100;
    const roundingDelta =
      Math.round((expense.amount - share * splitAmong.length) * 100) / 100;

    splitAmong.forEach((memberId, index) => {
      const shareAmount =
        index === splitAmong.length - 1 ? share + roundingDelta : share;
      balances[memberId] =
        Math.round((balances[memberId] - shareAmount) * 100) / 100;
    });

    balances[expense.payerId] =
      Math.round((balances[expense.payerId] + expense.amount) * 100) / 100;
  });

  Object.keys(balances).forEach((memberId) => {
    if (Math.abs(balances[memberId]) < 0.01) {
      balances[memberId] = 0;
    }
  });

  return balances;
}

function optimizeSettlementsFromBalances(balances) {
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({
      userId,
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((left, right) => right.amount - left.amount);

  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < 0)
    .map(([userId, amount]) => ({
      userId,
      amount: Math.round(-amount * 100) / 100,
    }))
    .sort((left, right) => right.amount - left.amount);

  const settlements = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      settlements.push({
        from: debtor.userId,
        to: creditor.userId,
        amount: Math.round(amount * 100) / 100,
      });
    }

    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;
    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;

    if (creditor.amount <= 0.01) {
      creditorIndex += 1;
    }
    if (debtor.amount <= 0.01) {
      debtorIndex += 1;
    }
  }

  return settlements;
}

function buildGraphPositions(nodes) {
  const activeNode = nodes.find((node) => node.active) ?? nodes[0];
  const otherNodes = nodes.filter((node) => node.id !== activeNode.id);
  const positions = {
    [activeNode.id]: { x: 160, y: 68 },
  };

  if (otherNodes.length > 0) {
    const centerX = 160;
    const centerY = 152;
    const radius = 88;
    const startAngle = (210 * Math.PI) / 180;
    const endAngle = (-30 * Math.PI) / 180;

    otherNodes.forEach((node, index) => {
      const ratio =
        otherNodes.length === 1 ? 0.5 : index / (otherNodes.length - 1);
      const angle = startAngle + (endAngle - startAngle) * ratio;
      positions[node.id] = {
        x: Math.round(centerX + radius * Math.cos(angle)),
        y: Math.round(centerY + radius * Math.sin(angle)),
      };
    });
  }

  return positions;
}

function buildArrowMetrics(source, target, nodeRadius = 28) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const offsetX = (dx / distance) * nodeRadius;
  const offsetY = (dy / distance) * nodeRadius;

  return {
    x1: source.x + offsetX,
    y1: source.y + offsetY,
    x2: target.x - offsetX,
    y2: target.y - offsetY,
    labelX: (source.x + target.x) / 2,
    labelY: (source.y + target.y) / 2 - 10,
  };
}

function DebtGraph({ group, balances, settlements }) {
  const nodes = group.members.map((member) => ({
    ...member,
    active: member.id === group.activeMemberId,
  }));
  const positions = buildGraphPositions(nodes);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Debt Flow</h3>
          <p className="text-xs text-slate-500">
            Computed from the current group roster.
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Local Data
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100">
        <svg
          viewBox="0 0 320 240"
          className="h-[280px] w-full"
          role="img"
          aria-label={`Debt graph for ${group.name}`}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6.5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="#475569" />
            </marker>
          </defs>

          {settlements.map((settlement) => {
            const source = positions[settlement.from];
            const target = positions[settlement.to];
            if (!source || !target) {
              return null;
            }

            const metrics = buildArrowMetrics(source, target);
            return (
              <g
                key={`${settlement.from}-${settlement.to}-${settlement.amount}`}
              >
                <line
                  x1={metrics.x1}
                  y1={metrics.y1}
                  x2={metrics.x2}
                  y2={metrics.y2}
                  stroke="#64748b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  markerEnd="url(#arrowhead)"
                />
                <rect
                  x={metrics.labelX - 26}
                  y={metrics.labelY - 11}
                  width="52"
                  height="22"
                  rx="11"
                  className="fill-white"
                  opacity="0.96"
                />
                <text
                  x={metrics.labelX}
                  y={metrics.labelY + 4}
                  textAnchor="middle"
                  className="fill-slate-700"
                  style={{ fontSize: 10, fontWeight: 700 }}
                >
                  {`Rs. ${settlement.amount.toFixed(2)}`}
                </text>
              </g>
            );
          })}

          {nodes.map((node) => {
            const point = positions[node.id];
            const balance = balances[node.id] ?? 0;

            return (
              <g key={node.id}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="28"
                  fill={node.active ? "#0f172a" : "#ffffff"}
                  stroke={node.active ? "#1d4ed8" : "#cbd5e1"}
                  strokeWidth={node.active ? "4" : "2"}
                />
                <text
                  x={point.x}
                  y={point.y + 5}
                  textAnchor="middle"
                  className={node.active ? "fill-white" : "fill-slate-700"}
                  style={{ fontSize: 11, fontWeight: 800 }}
                >
                  {node.initials}
                </text>
                <text
                  x={point.x}
                  y={point.y + 46}
                  textAnchor="middle"
                  className="fill-slate-500"
                  style={{ fontSize: 10, fontWeight: 600 }}
                >
                  {node.active
                    ? "Active User"
                    : `${node.name} • Rs. ${Math.abs(balance).toFixed(2)}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function LedgerScreen({ group, balances }) {
  const activities = group.expenses;
  const activeBalance = balances[group.activeMemberId] ?? 0;
  const netLabel = activeBalance >= 0 ? "You are owed" : "You owe";
  const netAmount = `Rs. ${Math.abs(activeBalance).toFixed(2)}`;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Net position
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              {netAmount}
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              {netLabel} in this group
            </p>
          </div>
          <div
            className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
              activeBalance >= 0
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {activeBalance >= 0 ? "+" : "-"}
            Rs. {Math.abs(activeBalance).toFixed(2)}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="w-full rounded-2xl bg-emerald-500 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 transition active:scale-[0.99]"
      >
        New Expense
      </button>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Recent Activity
            </h3>
            <p className="text-xs text-slate-500">
              Latest transactions in this group
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Live Feed
          </span>
        </div>

        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {activity.title}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {activity.subtitle}
                </p>
              </div>
              <div
                className={`ml-4 shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                  activity.payerId === group.activeMemberId
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-700"
                }`}
              >
                Rs. {activity.amount.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettleScreen({ group, balances, settlements }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Exact Balances
            </h3>
            <p className="text-xs text-slate-500">
              Computed from all group expenses and members
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {group.members.length} members
          </span>
        </div>

        <div className="space-y-2">
          {group.members.map((member) => {
            const amount = balances[member.id] ?? 0;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {member.name}
                  </p>
                  <p className="text-xs text-slate-500">{member.phone}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    amount >= 0
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {amount >= 0 ? "+" : "-"}Rs. {Math.abs(amount).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          Optimized Repayment Paths
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Greedy settlement output based on current balances.
        </p>
        <div className="space-y-2">
          {settlements.length > 0 ? (
            settlements.map((settlement) => {
              const fromMember = group.members.find(
                (member) => member.id === settlement.from,
              );
              const toMember = group.members.find(
                (member) => member.id === settlement.to,
              );

              return (
                <div
                  key={`${settlement.from}-${settlement.to}-${settlement.amount}`}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">
                      {fromMember?.name ?? settlement.from}
                    </span>{" "}
                    pays{" "}
                    <span className="font-semibold text-slate-900">
                      {toMember?.name ?? settlement.to}
                    </span>
                  </p>
                  <span className="text-xs font-bold text-slate-600">
                    Rs. {settlement.amount.toFixed(2)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              No outstanding settlements.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">
          Settlement Tools
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Receipt verification and asset-offset actions can be added here.
        </p>
      </div>
    </div>
  );
}

function AuthScreen({ onAuthenticated }) {
  const AUTH_MODES = {
    login: "login",
    register: "register",
  };
  const [mode, setMode] = useState(AUTH_MODES.login);
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone) {
      setStatus("Enter a phone number.");
      return;
    }
    if (mode === AUTH_MODES.register && username.trim().length < 2) {
      setStatus("Username must be at least 2 characters.");
      return;
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      const endpoint =
        mode === AUTH_MODES.login ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === AUTH_MODES.login
          ? { phone: normalizedPhone }
          : { phone: normalizedPhone, username: username.trim() };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus(data.detail ?? "Authentication failed.");
        return;
      }

      const user = data.user;
      onAuthenticated(user);
      localStorage.setItem("settle_kar_auth_user", JSON.stringify(user));
      setStatus("");
    } catch {
      setStatus("Could not connect to server. Make sure backend is running.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="w-full font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settle Kar</h1>
        <p className="text-sm text-slate-500">
          Log in with your phone or register a new account.
        </p>
      </header>

      <div className="mb-5 flex rounded-xl bg-slate-200 p-1">
        {[AUTH_MODES.login, AUTH_MODES.register].map((authMode) => {
          const isActive = mode === authMode;
          return (
            <button
              key={authMode}
              type="button"
              onClick={() => {
                setMode(authMode);
                setStatus("");
              }}
              className={
                isActive
                  ? "flex-1 rounded-lg bg-white py-2 text-sm font-semibold text-slate-900 shadow-sm"
                  : "flex-1 py-2 text-sm font-medium text-slate-500"
              }
            >
              {authMode === AUTH_MODES.login ? "Login" : "Register"}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
      >
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Phone Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="e.g. +1 555 0100"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
        </div>

        {mode === AUTH_MODES.register && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter your username"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
        )}

        {status && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
            {status}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting
            ? "Please wait..."
            : mode === AUTH_MODES.login
              ? "Log In"
              : "Create Account"}
        </button>
      </form>
    </section>
  );
}

function GroupsScreen({ onSelectGroup }) {
  return (
    <section className="w-full font-sans">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Settle Kar</h1>
        <p className="text-sm text-slate-500">
          Manage balances across your shared groups.
        </p>
      </header>

      <div className="overflow-y-auto">
        {GROUPS_MOCK.map((group) => {
          const balances = calculateBalancesFromExpenses(
            group.members,
            group.expenses,
          );
          const balance = balances[group.activeMemberId] ?? 0;

          return (
            <article
              key={group.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectGroup(group)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectGroup(group);
                }
              }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">
                  {group.name}
                </h2>
                <NetBalanceBadge amount={balance} />
              </div>

              <div className="flex items-center">
                {group.members.map((member, index) => (
                  <div
                    key={`${group.id}-${member.id}-${index}`}
                    className={`w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold ring-2 ring-white ${
                      index === 0 ? "" : "-ml-2"
                    }`}
                  >
                    {member.initials}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <button
        type="button"
        className="w-full bg-slate-900 text-white font-semibold py-3.5 rounded-xl mt-6 shadow-md active:scale-95 transition-transform"
      >
        Create New Group
      </button>
    </section>
  );
}

function GroupDetailScreen({ group, onBack }) {
  const INNER_TABS = {
    ledger: "Ledger",
    settle: "Settle",
    graph: "Graph",
  };
  const [innerTab, setInnerTab] = useState(INNER_TABS.ledger);
  const [groupData, setGroupData] = useState(group);
  const [memberPhone, setMemberPhone] = useState("");
  const [memberStatus, setMemberStatus] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);

  const balances = useMemo(
    () => calculateBalancesFromExpenses(groupData.members, groupData.expenses),
    [groupData.members, groupData.expenses],
  );
  const settlements = useMemo(
    () => optimizeSettlementsFromBalances(balances),
    [balances],
  );

  async function handleAddMember() {
    const phone = memberPhone.trim();
    if (!phone) {
      setMemberStatus("Please enter a phone number.");
      return;
    }

    const normalizedDigits = normalizePhoneNumber(phone);
    if (!normalizedDigits) {
      setMemberStatus("Please enter a phone number.");
      return;
    }

    const normalizedId = `phone-${normalizedDigits || phone.toLowerCase().replace(/\s+/g, "-")}`;

    if (
      groupData.members.some(
        (member) =>
          normalizePhoneNumber(member.phone) === normalizedDigits ||
          member.id === normalizedId,
      )
    ) {
      setMemberPhone("");
      setMemberStatus("This user is already in the group.");
      return;
    }

    setIsAddingMember(true);
    setMemberStatus("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/lookup?phone=${encodeURIComponent(normalizedDigits)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        setMemberStatus(
          data.detail ?? "This phone number is not registered yet.",
        );
        return;
      }

      const resolvedName =
        data?.user?.username?.trim() ||
        `Member ${groupData.members.length + 1}`;

      const initials = (
        resolvedName
          .split(/\s+/)
          .filter(Boolean)
          .map((part) => part[0])
          .join("")
          .slice(0, 2) ||
        normalizedDigits.slice(-2) ||
        "NA"
      ).toUpperCase();

      const newMember = {
        id: normalizedId,
        initials,
        name: resolvedName,
        phone: normalizedDigits,
      };

      setGroupData((current) => ({
        ...current,
        members: [...current.members, newMember],
      }));
      setMemberPhone("");
      setMemberStatus("Member added successfully.");
    } catch {
      setMemberStatus("Could not verify number. Make sure backend is running.");
    } finally {
      setIsAddingMember(false);
    }
  }

  return (
    <section className="w-full font-sans">
      <header className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">&lt;-</span>
          <span>Back</span>
        </button>
        <h1 className="text-lg font-bold text-slate-900">{group.name}</h1>
        <div className="w-12" aria-hidden="true" />
      </header>

      <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Add Member</h2>
            <p className="text-xs text-slate-500">
              Add only registered users by phone number.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Verified Lookup
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="tel"
            value={memberPhone}
            onChange={(event) => setMemberPhone(event.target.value)}
            placeholder="Enter phone number"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
          <button
            type="button"
            onClick={handleAddMember}
            disabled={isAddingMember}
            className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isAddingMember ? "Checking..." : "Add"}
          </button>
        </div>

        {memberStatus && (
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
            {memberStatus}
          </p>
        )}
      </div>

      <div className="flex bg-slate-200 p-1 rounded-xl mb-6">
        {Object.values(INNER_TABS).map((tab) => {
          const isActive = innerTab === tab;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setInnerTab(tab)}
              className={
                isActive
                  ? "flex-1 py-2 text-center text-sm font-semibold bg-white text-slate-900 shadow-sm rounded-lg"
                  : "flex-1 py-2 text-center text-sm font-medium text-slate-500"
              }
            >
              {tab}
            </button>
          );
        })}
      </div>

      {innerTab === INNER_TABS.ledger && (
        <LedgerScreen group={groupData} balances={balances} />
      )}
      {innerTab === INNER_TABS.settle && (
        <SettleScreen
          group={groupData}
          balances={balances}
          settlements={settlements}
        />
      )}
      {innerTab === INNER_TABS.graph && (
        <DebtGraph
          group={groupData}
          balances={balances}
          settlements={settlements}
        />
      )}
    </section>
  );
}

function TrustScreen() {
  return (
    <section className="w-full font-sans">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Settle Kar</h1>
        <p className="text-sm text-slate-500">
          Trust metrics and profile insights are coming soon.
        </p>
      </header>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4 flex flex-col gap-3">
        <p className="text-sm text-slate-500">Trust screen placeholder</p>
      </div>
    </section>
  );
}

function ProfileScreen({ authUser, onLogout }) {
  return (
    <section className="w-full font-sans">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Settle Kar</h1>
        <p className="text-sm text-slate-500">
          Personal account and preference controls.
        </p>
      </header>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-slate-900">
          {authUser.username}
        </p>
        <p className="text-sm text-slate-500">Phone: {authUser.phone}</p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-2 w-fit rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
        >
          Log Out
        </button>
      </div>
    </section>
  );
}

function BottomNavigation({ activeTab, onChange }) {
  const items = [
    { key: ROOT_TABS.groups, label: "Groups", Icon: HomeIcon },
    { key: ROOT_TABS.trust, label: "Trust", Icon: ShieldIcon },
    { key: ROOT_TABS.profile, label: "Profile", Icon: UserIcon },
  ];

  return (
    <nav
      className="fixed bottom-0 w-full bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center pb-safe"
      aria-label="Primary"
    >
      {items.map(({ key, label, Icon }) => {
        const isActive = activeTab === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex flex-col items-center gap-1 text-xs font-semibold ${
              isActive ? "text-blue-600" : "text-slate-400"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(ROOT_TABS.groups);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [authUser, setAuthUser] = useState(() => {
    try {
      const persisted = localStorage.getItem("settle_kar_auth_user");
      return persisted ? JSON.parse(persisted) : null;
    } catch {
      return null;
    }
  });

  function handleLogout() {
    localStorage.removeItem("settle_kar_auth_user");
    setAuthUser(null);
    setSelectedGroup(null);
    setActiveTab(ROOT_TABS.groups);
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <main className="mx-auto w-full max-w-md px-5 pt-8 pb-10">
          <AuthScreen onAuthenticated={setAuthUser} />
        </main>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen bg-slate-50 font-sans text-slate-900 ${
        selectedGroup ? "" : "pb-24"
      }`}
    >
      <main
        className={`mx-auto w-full max-w-md px-5 pt-8 ${
          selectedGroup ? "pb-6" : "pb-28"
        }`}
      >
        {selectedGroup && (
          <GroupDetailScreen
            group={selectedGroup}
            onBack={() => setSelectedGroup(null)}
          />
        )}
        {!selectedGroup && activeTab === ROOT_TABS.groups && (
          <GroupsScreen onSelectGroup={setSelectedGroup} />
        )}
        {activeTab === ROOT_TABS.trust && <TrustScreen />}
        {activeTab === ROOT_TABS.profile && (
          <ProfileScreen authUser={authUser} onLogout={handleLogout} />
        )}
      </main>

      {!selectedGroup && (
        <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
      )}
    </div>
  );
}
