import { useEffect, useMemo, useState } from "react";

const ROOT_TABS = {
  groups: "groups",
  trust: "trust",
  profile: "profile",
};

const API_BASE_URL = "/_/backend";

function normalizePhoneNumber(phone) {
  const digitsOnly = phone.replace(/\D/g, "");
  if (digitsOnly) {
    return digitsOnly;
  }
  return phone.trim();
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function buildEvenSplitShares(totalAmount, participantIds) {
  if (!participantIds.length) {
    return [];
  }

  const roundedTotal = roundToTwo(Number(totalAmount) || 0);
  const baseShare = roundToTwo(roundedTotal / participantIds.length);
  const shares = participantIds.map(() => baseShare);
  const roundingDelta = roundToTwo(
    roundedTotal - shares.reduce((sum, share) => sum + share, 0),
  );

  shares[shares.length - 1] = roundToTwo(
    shares[shares.length - 1] + roundingDelta,
  );
  return shares;
}

function buildManualShareDraft(members, totalAmount = 0) {
  const participantIds = members.map((member) => member.id);
  const evenShares = buildEvenSplitShares(totalAmount, participantIds);

  return Object.fromEntries(
    participantIds.map((memberId, index) => [
      memberId,
      totalAmount > 0 ? evenShares[index].toFixed(2) : "",
    ]),
  );
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

    const shareAmounts = Array.isArray(expense.splitAmounts)
      ? expense.splitAmounts.map((share) => roundToTwo(Number(share) || 0))
      : buildEvenSplitShares(expense.amount, splitAmong);

    splitAmong.forEach((memberId, index) => {
      const shareAmount = shareAmounts[index] ?? 0;
      balances[memberId] = roundToTwo(balances[memberId] - shareAmount);
    });

    balances[expense.payerId] = roundToTwo(
      (balances[expense.payerId] ?? 0) + roundToTwo(expense.amount),
    );
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

function LedgerScreen({ group, balances, onCreateExpense }) {
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
        onClick={onCreateExpense}
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

function ExpenseSheet({ group, onClose, onSave }) {
  const initialParticipantIds = group.members.map((member) => member.id);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(
    group.activeMemberId ?? group.members[0]?.id ?? "",
  );
  const [splitMode, setSplitMode] = useState("even");
  const [selectedParticipantIds, setSelectedParticipantIds] = useState(
    initialParticipantIds,
  );
  const [manualShares, setManualShares] = useState(() =>
    buildManualShareDraft(group.members),
  );
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const evenPreview = buildEvenSplitShares(
    Number(amount) || 0,
    selectedParticipantIds,
  );

  const selectedMembers = group.members.filter((member) =>
    selectedParticipantIds.includes(member.id),
  );

  const manualTotal = roundToTwo(
    selectedParticipantIds.reduce(
      (sum, memberId) => sum + (Number(manualShares[memberId]) || 0),
      0,
    ),
  );

  function handleModeChange(nextMode) {
    setSplitMode(nextMode);
    setStatus("");

    if (nextMode === "manual") {
      const currentAmount = Number(amount) || 0;
      setManualShares(buildManualShareDraft(group.members, currentAmount));
    }
  }

  function handleToggleParticipant(memberId) {
    setSelectedParticipantIds((current) => {
      const nextSelection = current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId];

      if (nextSelection.length === 0) {
        setStatus("Select at least one participant.");
        return current;
      }

      setStatus("");
      return nextSelection;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setStatus("Enter an expense title.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setStatus("Enter a valid total amount.");
      return;
    }

    if (!selectedParticipantIds.length) {
      setStatus("Select at least one participant.");
      return;
    }

    const normalizedDescription = description.trim();
    const normalizedAmount = roundToTwo(parsedAmount);
    const paidByMember =
      group.members.find((member) => member.id === paidBy) ?? null;
    const selectedBackendParticipants = selectedMembers.map(
      (member) => member.name,
    );

    let splitAmounts = null;
    if (splitMode === "manual") {
      splitAmounts = selectedParticipantIds.map((memberId) => {
        const share = Number(manualShares[memberId]);
        return Number.isFinite(share) ? roundToTwo(share) : Number.NaN;
      });

      if (splitAmounts.some((share) => !Number.isFinite(share) || share <= 0)) {
        setStatus("Enter a valid amount for every selected participant.");
        return;
      }

      const manualSum = roundToTwo(
        splitAmounts.reduce((sum, share) => sum + share, 0),
      );

      if (Math.abs(manualSum - normalizedAmount) > 0.01) {
        setStatus("Manual shares must add up to the total amount.");
        return;
      }
    }

    setIsSubmitting(true);
    setStatus("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paid_by: paidByMember?.name ?? paidBy,
          amount: normalizedAmount,
          split_among: selectedBackendParticipants,
          description: normalizedDescription,
          split_mode: splitMode,
          split_amounts: splitAmounts ?? undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? "Could not create expense.");
      }

      onSave({
        id: data.id ?? `expense-${Date.now()}`,
        title: trimmedTitle,
        subtitle:
          normalizedDescription ||
          (splitMode === "manual"
            ? "Manually loaded variable costs"
            : `Split evenly among ${selectedParticipantIds.length} members`),
        amount: roundToTwo(data.amount ?? normalizedAmount),
        payerId: paidBy,
        splitAmong: selectedParticipantIds,
        splitMode: data.split_mode ?? splitMode,
        splitAmounts:
          data.split_amounts ??
          (splitMode === "manual"
            ? splitAmounts
            : buildEvenSplitShares(normalizedAmount, selectedParticipantIds)),
      });

      onClose();
    } catch (error) {
      setStatus(error.message || "Could not create expense.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-2 backdrop-blur-sm sm:p-4">
      <div className="mx-auto flex max-h-[calc(100vh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-slate-900/25 sm:max-h-[calc(100vh-2rem)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              New expense
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              Add a group bill
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600"
          >
            Close
          </button>
        </div>

        <form
          className="flex-1 space-y-4 overflow-y-auto pr-1"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Expense Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Dinner, cab, groceries"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total Amount
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-sm font-bold text-slate-500">Rs.</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="w-full border-0 bg-transparent p-0 text-lg font-bold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Paid By
            </label>
            <select
              value={paidBy}
              onChange={(event) => setPaidBy(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              {group.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Split Mode
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleModeChange("even")}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  splitMode === "even"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <span className="block text-sm font-semibold">Even split</span>
                <span
                  className={`mt-1 block text-xs ${splitMode === "even" ? "text-slate-300" : "text-slate-500"}`}
                >
                  Divide the total equally across selected people.
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("manual")}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  splitMode === "manual"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <span className="block text-sm font-semibold">
                  Manual split
                </span>
                <span
                  className={`mt-1 block text-xs ${splitMode === "manual" ? "text-slate-300" : "text-slate-500"}`}
                >
                  Enter different amounts for each participant.
                </span>
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Participants
              </label>
              <span className="text-xs font-semibold text-slate-500">
                {selectedParticipantIds.length} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.members.map((member) => {
                const isSelected = selectedParticipantIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => handleToggleParticipant(member.id)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                      isSelected
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {member.initials} {member.name}
                  </button>
                );
              })}
            </div>
          </div>

          {splitMode === "even" ? (
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Even preview
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  Rs.{" "}
                  {Number.isFinite(Number(amount))
                    ? roundToTwo(Number(amount)).toFixed(2)
                    : "0.00"}
                </span>
              </div>
              <div className="space-y-2 text-sm text-slate-700">
                {selectedMembers.map((member, index) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
                  >
                    <span>{member.name}</span>
                    <span className="font-semibold text-slate-900">
                      Rs. {evenPreview[index]?.toFixed(2) ?? "0.00"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Manual shares
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  Total Rs. {manualTotal.toFixed(2)}
                </span>
              </div>
              <div className="space-y-2">
                {selectedMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                  >
                    <span className="text-sm font-medium text-slate-700">
                      {member.name}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualShares[member.id] ?? ""}
                      onChange={(event) =>
                        setManualShares((current) => ({
                          ...current,
                          [member.id]: event.target.value,
                        }))
                      }
                      placeholder="0.00"
                      className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Note
            </label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional context for the expense"
              rows="3"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>

          {status && (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {status}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-2xl bg-emerald-500 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Saving..." : "Save Expense"}
          </button>
        </form>
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

function GroupsScreen({ groups, onSelectGroup, onCreateGroup }) {
  return (
    <section className="w-full font-sans">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Settle Kar</h1>
        <p className="text-sm text-slate-500">
          Manage balances across your shared groups.
        </p>
      </header>

      <div className="overflow-y-auto">
        {groups.map((group) => {
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
        onClick={onCreateGroup}
        className="w-full bg-slate-900 text-white font-semibold py-3.5 rounded-xl mt-6 shadow-md active:scale-95 transition-transform"
      >
        Create New Group
      </button>
    </section>
  );
}

function CreateGroupScreen({ authUser, onCancel, onCreateGroup }) {
  const [groupName, setGroupName] = useState("");
  const [phoneQuery, setPhoneQuery] = useState("");
  const [status, setStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [members, setMembers] = useState(() => {
    const creatorName = authUser.username.trim() || "You";
    const creatorInitials = (
      creatorName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2) || "ME"
    ).toUpperCase();

    return [
      {
        id: `phone-${normalizePhoneNumber(authUser.phone) || "me"}`,
        initials: creatorInitials,
        name: creatorName,
        phone: normalizePhoneNumber(authUser.phone) || authUser.phone,
        isCreator: true,
      },
    ];
  });

  async function handleSearchAndAddMember() {
    const normalizedPhone = normalizePhoneNumber(phoneQuery);
    if (!normalizedPhone) {
      setStatus("Enter a phone number to search.");
      return;
    }

    if (
      members.some(
        (member) => normalizePhoneNumber(member.phone) === normalizedPhone,
      )
    ) {
      setStatus("This member is already added.");
      setPhoneQuery("");
      return;
    }

    setIsSearching(true);
    setStatus("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/lookup?phone=${encodeURIComponent(normalizedPhone)}`,
      );
      const data = await response.json();

      if (!response.ok) {
        setStatus(data.detail ?? "No user found for this phone number.");
        return;
      }

      const resolvedName = data?.user?.username?.trim() || "New Member";
      const initials = (
        resolvedName
          .split(/\s+/)
          .filter(Boolean)
          .map((part) => part[0])
          .join("")
          .slice(0, 2) ||
        normalizedPhone.slice(-2) ||
        "NA"
      ).toUpperCase();

      setMembers((current) => [
        ...current,
        {
          id: `phone-${normalizedPhone}`,
          initials,
          name: resolvedName,
          phone: data?.user?.phone || normalizedPhone,
          isCreator: false,
        },
      ]);
      setPhoneQuery("");
      setStatus(`${resolvedName} added to group draft.`);
    } catch {
      setStatus("Could not search users. Make sure backend is running.");
    } finally {
      setIsSearching(false);
    }
  }

  function handleRemoveMember(memberId) {
    setMembers((current) =>
      current.filter((member) => member.id !== memberId || member.isCreator),
    );
  }

  function handleCreateGroup() {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setStatus("Please enter a group name.");
      return;
    }

    const creator = members.find((member) => member.isCreator) || members[0];
    const newGroup = {
      id: `${trimmedName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name: trimmedName,
      activeMemberId: creator.id,
      members: members.map(({ isCreator, ...member }) => member),
      expenses: [],
    };

    onCreateGroup(newGroup);
  }

  return (
    <section className="w-full font-sans">
      <header className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <span aria-hidden="true">&lt;-</span>
          <span>Back</span>
        </button>
        <h1 className="text-lg font-bold text-slate-900">Create Group</h1>
        <div className="w-12" aria-hidden="true" />
      </header>

      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Group Name
          </label>
          <input
            type="text"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            placeholder="e.g. Office Lunch"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Add Members
              </h2>
              <p className="text-xs text-slate-500">
                Search registered users by phone number.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {members.length} selected
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="tel"
              value={phoneQuery}
              onChange={(event) => setPhoneQuery(event.target.value)}
              placeholder="Type phone and search"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
            />
            <button
              type="button"
              onClick={handleSearchAndAddMember}
              disabled={isSearching}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSearching ? "Searching..." : "Search"}
            </button>
          </div>

          {status && (
            <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
              {status}
            </p>
          )}

          <div className="mt-4 space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                    {member.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {member.name}
                    </p>
                    <p className="text-xs text-slate-500">{member.phone}</p>
                  </div>
                </div>
                {member.isCreator ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    You
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                    className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreateGroup}
          className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-md"
        >
          Create Group
        </button>
      </div>
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
  const [isExpenseSheetOpen, setIsExpenseSheetOpen] = useState(false);

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

  function handleExpenseSaved(expense) {
    setGroupData((current) => ({
      ...current,
      expenses: [expense, ...current.expenses],
    }));
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
        <LedgerScreen
          group={groupData}
          balances={balances}
          onCreateExpense={() => setIsExpenseSheetOpen(true)}
        />
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

      {isExpenseSheetOpen && (
        <ExpenseSheet
          group={groupData}
          onClose={() => setIsExpenseSheetOpen(false)}
          onSave={handleExpenseSaved}
        />
      )}
    </section>
  );
}

function TrustScreen({ authUser }) {
  const [trustProfile, setTrustProfile] = useState(null);
  const [settlementStats, setSettlementStats] = useState({
    settled: 0,
    pendingReceipt: 0,
    pendingOffset: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  function tierStyles(tier) {
    if (tier === "Gold") {
      return "bg-amber-100 text-amber-700";
    }
    if (tier === "Silver") {
      return "bg-slate-200 text-slate-700";
    }
    return "bg-orange-100 text-orange-700";
  }

  async function loadTrustData() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const profileResponse = await fetch(
        `${API_BASE_URL}/api/trust-profile/${encodeURIComponent(authUser.username)}`,
      );
      const profileData = await profileResponse.json();
      if (!profileResponse.ok) {
        throw new Error(profileData.detail ?? "Could not load trust profile.");
      }

      const ledgerResponse = await fetch(`${API_BASE_URL}/api/ledger`);
      const ledgerData = await ledgerResponse.json();
      if (!ledgerResponse.ok) {
        throw new Error(
          ledgerData.detail ?? "Could not load settlement stats.",
        );
      }

      const settlements = Array.isArray(ledgerData?.settlements)
        ? ledgerData.settlements
        : [];
      const stats = settlements.reduce(
        (acc, row) => {
          if (row.is_settled) {
            acc.settled += 1;
          } else if (row.settlement_status === "pending_offset") {
            acc.pendingOffset += 1;
          } else {
            acc.pendingReceipt += 1;
          }
          return acc;
        },
        { settled: 0, pendingReceipt: 0, pendingOffset: 0 },
      );

      setTrustProfile(profileData);
      setSettlementStats(stats);
    } catch (error) {
      setErrorMessage(error.message || "Could not load trust data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTrustData();
  }, [authUser.username]);

  if (isLoading) {
    return (
      <section className="w-full font-sans">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900">Trust</h1>
          <p className="text-sm text-slate-500">Loading trust dashboard...</p>
        </header>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Fetching trust profile data.</p>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="w-full font-sans">
        <header className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900">Trust</h1>
          <p className="text-sm text-slate-500">
            Your repayment reputation snapshot.
          </p>
        </header>
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-rose-700">
              Could not load trust data
            </p>
            <p className="mt-1 text-sm text-rose-600">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={loadTrustData}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full font-sans">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Trust</h1>
        <p className="text-sm text-slate-500">
          Your repayment reputation snapshot.
        </p>
      </header>

      <div className="space-y-4">
        <div className="rounded-3xl bg-slate-900 p-5 text-white shadow-lg shadow-slate-900/15">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                Trust Points
              </p>
              <p className="mt-2 text-4xl font-bold leading-none">
                {trustProfile.trust_points}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${tierStyles(trustProfile.tier)}`}
            >
              {trustProfile.tier}
            </span>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
              <span>Tier progress</span>
              <span>{trustProfile.progress_percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${trustProfile.progress_percent}%` }}
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-300">
            {trustProfile.points_to_next_tier === null
              ? "You are at the highest tier."
              : `${trustProfile.points_to_next_tier} points to next tier (${trustProfile.next_tier_threshold}).`}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Scored
            </p>
            <p className="mt-1 text-xl font-bold text-slate-900">
              {trustProfile.scored_settlements}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Settled
            </p>
            <p className="mt-1 text-xl font-bold text-emerald-700">
              {settlementStats.settled}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Pending
            </p>
            <p className="mt-1 text-xl font-bold text-amber-700">
              {settlementStats.pendingReceipt + settlementStats.pendingOffset}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            Settlement Queue
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-slate-600">
                Awaiting receipt verification
              </span>
              <span className="font-semibold text-slate-900">
                {settlementStats.pendingReceipt}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="text-slate-600">
                Awaiting asset offset decision
              </span>
              <span className="font-semibold text-slate-900">
                {settlementStats.pendingOffset}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            How points are calculated
          </h2>
          <p className="mt-2 text-xs text-slate-500">
            Based on verified settlement speed.
          </p>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p className="rounded-xl bg-emerald-50 px-3 py-2">
              Within 2 hours: +10 points
            </p>
            <p className="rounded-xl bg-sky-50 px-3 py-2">
              Within 24 hours: +5 points
            </p>
            <p className="rounded-xl bg-rose-50 px-3 py-2">
              After 48 hours: -5 points
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadTrustData}
          className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
        >
          Refresh Trust Data
        </button>
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
      className="fixed bottom-3 left-1/2 z-40 grid w-[calc(100%-1rem)] max-w-md -translate-x-1/2 grid-cols-3 items-center rounded-full border border-slate-200 bg-white/90 px-3 py-3 shadow-xl shadow-slate-900/10 backdrop-blur-md"
      aria-label="Primary"
    >
      {items.map(({ key, label, Icon }) => {
        const isActive = activeTab === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex flex-col items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
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
  const [groups, setGroups] = useState(GROUPS_MOCK);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
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

  function handleCreateGroup(newGroup) {
    setGroups((current) => [newGroup, ...current]);
    setIsCreatingGroup(false);
    setSelectedGroup(newGroup);
    setActiveTab(ROOT_TABS.groups);
  }

  if (!authUser) {
    return (
      <div className="dark-blue-theme min-h-screen bg-slate-50 font-sans text-slate-900">
        <main className="mx-auto w-full max-w-md px-5 pt-8 pb-10">
          <AuthScreen onAuthenticated={setAuthUser} />
        </main>
      </div>
    );
  }

  return (
    <div
      className={`dark-blue-theme min-h-screen overflow-x-hidden bg-slate-50 font-sans text-slate-900 ${
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
        {!selectedGroup && isCreatingGroup && (
          <CreateGroupScreen
            authUser={authUser}
            onCancel={() => setIsCreatingGroup(false)}
            onCreateGroup={handleCreateGroup}
          />
        )}
        {!selectedGroup &&
          !isCreatingGroup &&
          activeTab === ROOT_TABS.groups && (
            <GroupsScreen
              groups={groups}
              onSelectGroup={setSelectedGroup}
              onCreateGroup={() => setIsCreatingGroup(true)}
            />
          )}
        {activeTab === ROOT_TABS.trust && <TrustScreen authUser={authUser} />}
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
