import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

// ─── Types ───────────────────────────────────────────────
type Plan = "free" | "pro" | "enterprise";
type User = {
  id: string; name: string; email: string; plan: Plan;
  isAdmin: boolean; walletAddress: string | null;
  stripeCustomerId: string | null; createdAt: string;
};
type Session = {
  id: string; userId: string; userEmail: string; userName: string;
  expiresAt: string; ipAddress: string | null; userAgent: string | null; createdAt: string;
};
type Wallet = {
  id: string; address: string; chainId: number; isPrimary: boolean;
  userId: string; userEmail: string; userName: string; createdAt: string;
};
type Stats = {
  totalUsers: number; totalSessions: number; totalWallets: number;
  planCounts: { plan: string; total: number }[];
};

// ─── API ─────────────────────────────────────────────────
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/admin/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Styles ──────────────────────────────────────────────
const S = {
  layout: { display: "flex", minHeight: "100vh" } as React.CSSProperties,
  sidebar: {
    width: 220, background: "#0f172a", display: "flex", flexDirection: "column" as const,
    padding: "24px 0", flexShrink: 0,
  },
  logo: { padding: "0 20px 24px", borderBottom: "1px solid #1e293b", marginBottom: 8 },
  logoText: { fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: -0.5 },
  logoBadge: { fontSize: 10, color: "#6366f1", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" as const },
  navItem: (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
    color: active ? "#fff" : "#94a3b8", background: active ? "#1e293b" : "transparent",
    cursor: "pointer", fontSize: 14, fontWeight: active ? 600 : 400,
    borderLeft: active ? "3px solid #6366f1" : "3px solid transparent",
    transition: "all .15s",
  }),
  main: { flex: 1, padding: 32, overflowY: "auto" as const },
  pageTitle: { fontSize: 22, fontWeight: 700, marginBottom: 24, color: "#0f172a" },
  card: {
    background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0",
    padding: 24, marginBottom: 24,
  },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 24 },
  statCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20 },
  statValue: { fontSize: 32, fontWeight: 700, color: "#0f172a" },
  statLabel: { fontSize: 12, color: "#94a3b8", marginTop: 4, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: .5 },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th: { textAlign: "left" as const, padding: "10px 12px", borderBottom: "2px solid #e2e8f0", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: .5 },
  td: { padding: "11px 12px", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" as const },
  badge: (plan: string): React.CSSProperties => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
    background: plan === "enterprise" ? "#ede9fe" : plan === "pro" ? "#dbeafe" : "#f1f5f9",
    color: plan === "enterprise" ? "#6d28d9" : plan === "pro" ? "#1d4ed8" : "#64748b",
  }),
  btn: (variant: "primary" | "danger" | "ghost"): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
    background: variant === "primary" ? "#6366f1" : variant === "danger" ? "#fee2e2" : "#f8fafc",
    color: variant === "primary" ? "#fff" : variant === "danger" ? "#dc2626" : "#475569",
    transition: "opacity .15s",
  }),
  select: {
    padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0",
    fontSize: 12, background: "#fff", cursor: "pointer", color: "#0f172a",
  } as React.CSSProperties,
  toast: (type: "ok" | "err"): React.CSSProperties => ({
    position: "fixed", bottom: 24, right: 24, padding: "12px 20px",
    background: type === "ok" ? "#0f172a" : "#dc2626",
    color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 500,
    boxShadow: "0 4px 20px rgba(0,0,0,.2)", zIndex: 9999, animation: "fadein .2s",
  }),
  empty: { textAlign: "center" as const, padding: 48, color: "#94a3b8", fontSize: 14 },
  chip: { display: "inline-block", padding: "1px 7px", borderRadius: 20, fontSize: 11, background: "#f1f5f9", color: "#64748b" },
};

// ─── Toast ───────────────────────────────────────────────
function Toast({ msg, type, onDone }: { msg: string; type: "ok" | "err"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div style={S.toast(type)}>{msg}</div>;
}

// ─── Dashboard ───────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>("/stats").then(setStats).catch(() => {}); }, []);

  const planMap = Object.fromEntries((stats?.planCounts ?? []).map(p => [p.plan, p.total]));
  const cards = [
    { label: "Total Users", value: stats?.totalUsers ?? "—" },
    { label: "Active Sessions", value: stats?.totalSessions ?? "—" },
    { label: "Linked Wallets", value: stats?.totalWallets ?? "—" },
    { label: "Free", value: planMap.free ?? 0 },
    { label: "Pro", value: planMap.pro ?? 0 },
    { label: "Enterprise", value: planMap.enterprise ?? 0 },
  ];

  return (
    <>
      <div style={S.pageTitle}>Dashboard</div>
      <div style={S.statsGrid}>
        {cards.map(c => (
          <div key={c.label} style={S.statCard}>
            <div style={S.statValue}>{c.value}</div>
            <div style={S.statLabel}>{c.label}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Users ───────────────────────────────────────────────
function Users({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<User[]>("/users").then(u => { setUsers(u); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, []);

  const patch = async (id: string, data: Partial<User>) => {
    try {
      await api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
      toast("Updated");
    } catch (e: any) { toast(e.message, "err"); }
  };

  const del = async (id: string, email: string) => {
    if (!confirm(`Delete ${email}? This cannot be undone.`)) return;
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      setUsers(prev => prev.filter(u => u.id !== id));
      toast("User deleted");
    } catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <>
      <div style={S.pageTitle}>Users <span style={{ fontSize: 14, fontWeight: 400, color: "#94a3b8" }}>({users.length})</span></div>
      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : users.length === 0 ? <div style={S.empty}>No users</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                {["Name", "Email", "Plan", "Admin", "Wallet", "Stripe", "Joined", ""].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={S.td}>{u.name}</td>
                  <td style={S.td}>{u.email}</td>
                  <td style={S.td}>
                    <select
                      style={S.select}
                      value={u.plan}
                      onChange={e => patch(u.id, { plan: e.target.value as Plan })}
                    >
                      <option value="free">Free</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td style={S.td}>
                    <input
                      type="checkbox"
                      checked={u.isAdmin}
                      onChange={e => patch(u.id, { isAdmin: e.target.checked })}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={S.td}>
                    {u.walletAddress
                      ? <span style={S.chip} title={u.walletAddress}>{u.walletAddress.slice(0, 6)}…{u.walletAddress.slice(-4)}</span>
                      : <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>
                  <td style={S.td}>
                    {u.stripeCustomerId
                      ? <span style={S.chip}>{u.stripeCustomerId.slice(0, 12)}…</span>
                      : <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>
                  <td style={S.td}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={S.td}>
                    <button style={S.btn("danger")} onClick={() => del(u.id, u.email)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── Sessions ────────────────────────────────────────────
function Sessions({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Session[]>("/sessions").then(s => { setSessions(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const revoke = async (id: string) => {
    try {
      await api(`/sessions/${id}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== id));
      toast("Session revoked");
    } catch (e: any) { toast(e.message, "err"); }
  };

  const isExpired = (d: string) => new Date(d) < new Date();

  return (
    <>
      <div style={S.pageTitle}>Sessions <span style={{ fontSize: 14, fontWeight: 400, color: "#94a3b8" }}>({sessions.length})</span></div>
      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : sessions.length === 0 ? <div style={S.empty}>No sessions</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                {["User", "Email", "IP", "User Agent", "Expires", ""].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td style={S.td}>{s.userName}</td>
                  <td style={S.td}>{s.userEmail}</td>
                  <td style={S.td}>{s.ipAddress ?? "—"}</td>
                  <td style={S.td} title={s.userAgent ?? ""}>
                    {s.userAgent ? s.userAgent.slice(0, 40) + (s.userAgent.length > 40 ? "…" : "") : "—"}
                  </td>
                  <td style={S.td}>
                    <span style={{ color: isExpired(s.expiresAt) ? "#dc2626" : "#16a34a", fontWeight: 500 }}>
                      {isExpired(s.expiresAt) ? "Expired" : new Date(s.expiresAt).toLocaleDateString()}
                    </span>
                  </td>
                  <td style={S.td}>
                    <button style={S.btn("danger")} onClick={() => revoke(s.id)}>Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── Wallets ─────────────────────────────────────────────
function Wallets() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Wallet[]>("/wallets").then(w => { setWallets(w); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <>
      <div style={S.pageTitle}>Wallets <span style={{ fontSize: 14, fontWeight: 400, color: "#94a3b8" }}>({wallets.length})</span></div>
      <div style={S.card}>
        {loading ? <div style={S.empty}>Loading…</div> : wallets.length === 0 ? <div style={S.empty}>No linked wallets</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                {["Address", "Chain", "Primary", "User", "Email", "Linked"].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wallets.map(w => (
                <tr key={w.id}>
                  <td style={S.td}>
                    <span style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {w.address.slice(0, 8)}…{w.address.slice(-6)}
                    </span>
                  </td>
                  <td style={S.td}><span style={S.chip}>Chain {w.chainId}</span></td>
                  <td style={S.td}>{w.isPrimary ? "✓" : ""}</td>
                  <td style={S.td}>{w.userName}</td>
                  <td style={S.td}>{w.userEmail}</td>
                  <td style={S.td}>{new Date(w.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── App ─────────────────────────────────────────────────
const PAGES = [
  { id: "dashboard", label: "Dashboard", icon: "⬛" },
  { id: "users",     label: "Users",     icon: "👤" },
  { id: "sessions",  label: "Sessions",  icon: "🔑" },
  { id: "wallets",   label: "Wallets",   icon: "🔗" },
];

function App() {
  const [page, setPage] = useState("dashboard");
  const [toastMsg, setToastMsg] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const toast = (msg: string, type: "ok" | "err" = "ok") => setToastMsg({ msg, type });

  return (
    <div style={S.layout}>
      <style>{`@keyframes fadein { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }`}</style>

      {/* Sidebar */}
      <nav style={S.sidebar}>
        <div style={S.logo}>
          <div style={S.logoText}>GoBoiler</div>
          <div style={S.logoBadge}>Admin</div>
        </div>
        {PAGES.map(p => (
          <div
            key={p.id}
            style={S.navItem(page === p.id)}
            onClick={() => setPage(p.id)}
          >
            <span style={{ fontSize: 15 }}>{p.icon}</span>
            {p.label}
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: "0 20px" }}>
          <a
            href="/auth/sign-out"
            style={{ color: "#475569", fontSize: 13, textDecoration: "none" }}
          >
            ← Sign out
          </a>
        </div>
      </nav>

      {/* Main */}
      <main style={S.main}>
        {page === "dashboard" && <Dashboard />}
        {page === "users"     && <Users toast={toast} />}
        {page === "sessions"  && <Sessions toast={toast} />}
        {page === "wallets"   && <Wallets />}
      </main>

      {toastMsg && (
        <Toast msg={toastMsg.msg} type={toastMsg.type} onDone={() => setToastMsg(null)} />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
