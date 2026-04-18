import { useState } from "react";

const ROOT_TABS = {
  groups: "groups",
  trust: "trust",
  profile: "profile",
};

const GROUPS_MOCK = [
  {
    id: "hackathon-trip",
    name: "Hackathon Trip",
    members: ["AK", "ZM", "FR"],
    netBalance: 300,
  },
  {
    id: "weekend-foods",
    name: "Weekend Foods",
    members: ["AK", "ZH", "RA"],
    netBalance: -180,
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

const DEBT_GRAPH_NODES = [
  {
    id: "user-a",
    label: "User A",
    x: 160,
    y: 64,
    active: true,
  },
  {
    id: "user-b",
    label: "User B",
    x: 72,
    y: 168,
    active: false,
  },
  {
    id: "user-c",
    label: "User C",
    x: 248,
    y: 168,
    active: false,
  },
];

const DEBT_GRAPH_EDGES = [
  {
    from: "user-b",
    to: "user-a",
    amount: 300,
    labelX: 104,
    labelY: 112,
  },
  {
    from: "user-c",
    to: "user-a",
    amount: 100,
    labelX: 216,
    labelY: 112,
  },
];

function DebtGraph() {
  const nodeLookup = Object.fromEntries(
    DEBT_GRAPH_NODES.map((node) => [node.id, node]),
  );

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Debt Flow</h3>
          <p className="text-xs text-slate-500">Who owes whom in this group.</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Mock Data
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100">
        <svg
          viewBox="0 0 320 240"
          className="h-[280px] w-full"
          role="img"
          aria-label="Debt graph showing user B owes user A 300 rupees and user C owes user A 100 rupees"
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

          <line
            x1={nodeLookup["user-b"].x + 16}
            y1={nodeLookup["user-b"].y - 8}
            x2={nodeLookup["user-a"].x - 8}
            y2={nodeLookup["user-a"].y + 18}
            stroke="#64748b"
            strokeWidth="2.5"
            strokeLinecap="round"
            markerEnd="url(#arrowhead)"
          />
          <line
            x1={nodeLookup["user-c"].x - 16}
            y1={nodeLookup["user-c"].y - 8}
            x2={nodeLookup["user-a"].x + 8}
            y2={nodeLookup["user-a"].y + 18}
            stroke="#64748b"
            strokeWidth="2.5"
            strokeLinecap="round"
            markerEnd="url(#arrowhead)"
          />

          {DEBT_GRAPH_EDGES.map((edge) => (
            <g key={`${edge.from}-${edge.to}-${edge.amount}`}>
              <rect
                x={edge.labelX - 24}
                y={edge.labelY - 11}
                width="48"
                height="22"
                rx="11"
                className="fill-white"
                opacity="0.96"
              />
              <text
                x={edge.labelX}
                y={edge.labelY + 4}
                textAnchor="middle"
                className="fill-slate-700"
                style={{ fontSize: 10, fontWeight: 700 }}
              >
                {`Rs. ${edge.amount}`}
              </text>
            </g>
          ))}

          {DEBT_GRAPH_NODES.map((node) => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r="28"
                fill={node.active ? "#0f172a" : "#ffffff"}
                stroke={node.active ? "#1d4ed8" : "#cbd5e1"}
                strokeWidth={node.active ? "4" : "2"}
              />
              <text
                x={node.x}
                y={node.y + 5}
                textAnchor="middle"
                className={node.active ? "fill-white" : "fill-slate-700"}
                style={{ fontSize: 11, fontWeight: 800 }}
              >
                {node.label.replace("User ", "")}
              </text>
              <text
                x={node.x}
                y={node.y + 46}
                textAnchor="middle"
                className="fill-slate-500"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {node.active ? "Active User" : "Member"}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
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
        {GROUPS_MOCK.map((group) => (
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
              <NetBalanceBadge amount={group.netBalance} />
            </div>

            <div className="flex items-center">
              {group.members.map((initials, index) => (
                <div
                  key={`${group.id}-${initials}-${index}`}
                  className={`w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold ring-2 ring-white ${
                    index === 0 ? "" : "-ml-2"
                  }`}
                >
                  {initials}
                </div>
              ))}
            </div>
          </article>
        ))}
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
        <div className="p-10 text-center text-slate-500">
          Ledger View Placeholder
        </div>
      )}
      {innerTab === INNER_TABS.settle && (
        <div className="p-10 text-center text-slate-500">
          Settle View Placeholder
        </div>
      )}
      {innerTab === INNER_TABS.graph && <DebtGraph />}
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

function ProfileScreen() {
  return (
    <section className="w-full font-sans">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Settle Kar</h1>
        <p className="text-sm text-slate-500">
          Personal account and preference controls.
        </p>
      </header>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4 flex flex-col gap-3">
        <p className="text-sm text-slate-500">Profile screen placeholder</p>
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
        {activeTab === ROOT_TABS.profile && <ProfileScreen />}
      </main>

      {!selectedGroup && (
        <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
      )}
    </div>
  );
}
