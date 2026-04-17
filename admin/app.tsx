import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

// ─── Types ───────────────────────────────────────────────
type Plan = "free" | "pro" | "enterprise";
type User = { id: string; name: string; email: string; plan: Plan; isAdmin: boolean; walletAddress: string | null; stripeCustomerId: string | null; createdAt: string };
type Session = { id: string; userId: string; userEmail: string; userName: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; createdAt: string };
type Wallet = { id: string; address: string; chainId: number; isPrimary: boolean; userId: string; userEmail: string; userName: string; createdAt: string };
type Stats = { totalUsers: number; totalSessions: number; totalWallets: number; planCounts: { plan: string; total: number }[] };
type SF = { set: boolean; source: "db" | "env" | "unset"; value: string | null };
type Services = {
  auth:     { googleClientId: SF; googleClientSecret: SF };
  email:    { resendApiKey: SF; emailFrom: SF };
  stripe:   { secretKey: SF; webhookSecret: SF; proPriceId: SF; enterprisePriceId: SF };
  crypto:   { ethRpcUrl: SF; baseRpcUrl: SF; polygonRpcUrl: SF; siweDomain: SF; siweStatement: SF };
  database: { url: SF };
};

// ─── API ─────────────────────────────────────────────────
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/admin/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const t = await res.text(); throw Object.assign(new Error(t || `HTTP ${res.status}`), { status: res.status }); }
  return res.json();
}

// ─── Theme ───────────────────────────────────────────────
const C = {
  bg: "#0f172a", surface: "#1e293b", surface2: "#0f172a",
  border: "#334155", borderLight: "#1e293b",
  text: "#f1f5f9", muted: "#64748b", faint: "#94a3b8",
  accent: "#818cf8", accentDark: "#6366f1",
  success: "#4ade80", danger: "#f87171", warning: "#fbbf24",
  inputBg: "#0f172a",
};

const T: Record<string, React.CSSProperties> = {
  layout:    { display: "flex", minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  sidebar:   { width: 240, background: C.surface2, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 },
  logoWrap:  { padding: "24px 20px 20px", borderBottom: `1px solid ${C.border}` },
  logoText:  { fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: -0.3 },
  logoBadge: { fontSize: 9, color: C.accent, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" as const, marginTop: 2 },
  navSection:{ padding: "16px 12px 4px", fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase" as const },
  main:      { flex: 1, padding: "32px 36px", overflowY: "auto" as const },
  title:     { fontSize: 20, fontWeight: 700, marginBottom: 28, color: C.text },
  card:      { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, marginBottom: 20 },
  grid:      { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 24 },
  statCard:  { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20 },
  statVal:   { fontSize: 30, fontWeight: 700, color: C.text },
  statLbl:   { fontSize: 11, color: C.muted, marginTop: 4, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: .5 },
  table:     { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 },
  th:        { textAlign: "left" as const, padding: "10px 14px", borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: .5 },
  td:        { padding: "11px 14px", borderBottom: `1px solid ${C.borderLight}`, verticalAlign: "middle" as const, color: C.text },
  empty:     { textAlign: "center" as const, padding: 48, color: C.muted, fontSize: 14 },
  chip:      { display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, background: "#1e293b", color: C.faint, border: `1px solid ${C.border}` },
  // Forms
  label:     { fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 6, display: "block" as const },
  input:     { width: "100%", padding: "9px 12px", background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: 7, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" as const },
  footer:    { display: "flex", gap: 10, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` },
  svcGroup:  { marginBottom: 28 },
  svcGTitle: { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase" as const, letterSpacing: .8, marginBottom: 14 },
  svcGrid:   { display: "grid", gridTemplateColumns: "200px 1fr", gap: "10px 16px", alignItems: "center" },
  svcRowLbl: { fontSize: 13, color: C.faint },
  srcBadge:  (s: string): React.CSSProperties => ({
    display: "inline-block", padding: "1px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700,
    background: s === "db" ? "#312e81" : s === "env" ? "#1e3a5f" : "#1e293b",
    color: s === "db" ? "#a5b4fc" : s === "env" ? "#7dd3fc" : C.muted,
  }),
  testBox: (ok: boolean): React.CSSProperties => ({
    marginTop: 14, padding: "10px 14px", borderRadius: 7, fontSize: 13,
    background: ok ? "#052e16" : "#2d0a0a",
    color: ok ? C.success : C.danger,
    border: `1px solid ${ok ? "#166534" : "#7f1d1d"}`,
  }),
};

// ─── Shared helpers ───────────────────────────────────────
function Btn({ label, variant = "primary", onClick, disabled }: { label: string; variant?: "primary" | "danger" | "ghost"; onClick?: () => void; disabled?: boolean }) {
  const bg = variant === "primary" ? C.accentDark : variant === "danger" ? "#7f1d1d" : C.surface;
  const col = variant === "danger" ? C.danger : C.text;
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "8px 16px", background: bg, color: col, border: `1px solid ${variant === "ghost" ? C.border : "transparent"}`, borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .6 : 1 }}>
      {label}
    </button>
  );
}

function planBadge(plan: string) {
  const bg = plan === "enterprise" ? "#312e81" : plan === "pro" ? "#1e3a5f" : "#1e293b";
  const col = plan === "enterprise" ? "#a5b4fc" : plan === "pro" ? "#7dd3fc" : C.muted;
  return <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color: col }}>{plan}</span>;
}

function Toast({ msg, type, onDone }: { msg: string; type: "ok" | "err"; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, []);
  return <div style={{ position: "fixed", bottom: 24, right: 24, padding: "12px 20px", background: type === "ok" ? "#1e293b" : "#7f1d1d", color: type === "ok" ? C.text : C.danger, border: `1px solid ${type === "ok" ? C.border : "#991b1b"}`, borderRadius: 8, fontSize: 13, fontWeight: 500, boxShadow: "0 8px 30px rgba(0,0,0,.4)", zIndex: 9999 }}>{msg}</div>;
}

// ─── Login ───────────────────────────────────────────────
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      const res = await fetch("/auth/sign-in/email", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pass }) });
      if (!res.ok) { const d: any = await res.json(); throw new Error(d.message || "Invalid credentials"); }
      onSuccess();
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>GoBoiler</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Admin Panel</div>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "32px 36px" }}>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 18 }}>
              <label style={T.label}>Email</label>
              <input style={T.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" autoFocus required />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={T.label}>Password</label>
              <input style={T.input} type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required />
            </div>
            {err && <div style={{ color: C.danger, fontSize: 13, marginBottom: 16, padding: "10px 12px", background: "#2d0a0a", borderRadius: 6, border: "1px solid #7f1d1d" }}>{err}</div>}
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "11px", background: C.accentDark, color: "#fff", border: "none", borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1, transition: "opacity .15s" }}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: C.muted }}>
          Use your <code style={{ color: C.faint }}>ADMIN_EMAIL</code> + <code style={{ color: C.faint }}>ADMIN_PASSWORD</code>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { api<Stats>("/stats").then(setStats).catch(() => {}); }, []);
  const pm = Object.fromEntries((stats?.planCounts ?? []).map(p => [p.plan, p.total]));
  const cards = [
    { label: "Total Users", value: stats?.totalUsers ?? "—" },
    { label: "Active Sessions", value: stats?.totalSessions ?? "—" },
    { label: "Linked Wallets", value: stats?.totalWallets ?? "—" },
    { label: "Free", value: pm.free ?? 0 },
    { label: "Pro", value: pm.pro ?? 0 },
    { label: "Enterprise", value: pm.enterprise ?? 0 },
  ];
  return (
    <>
      <div style={T.title}>Dashboard</div>
      <div style={T.grid}>
        {cards.map(c => <div key={c.label} style={T.statCard}><div style={T.statVal}>{c.value}</div><div style={T.statLbl}>{c.label}</div></div>)}
      </div>
    </>
  );
}

// ─── Users ───────────────────────────────────────────────
function Users({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<User[]>("/users").then(u => { setUsers(u); setLoading(false); }).catch(() => setLoading(false)); }, []);

  const patch = async (id: string, data: Partial<User>) => {
    try { await api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }); setUsers(p => p.map(u => u.id === id ? { ...u, ...data } : u)); toast("Saved"); }
    catch (e: any) { toast(e.message, "err"); }
  };
  const del = async (id: string, email: string) => {
    if (!confirm(`Delete ${email}?`)) return;
    try { await api(`/users/${id}`, { method: "DELETE" }); setUsers(p => p.filter(u => u.id !== id)); toast("Deleted"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <>
      <div style={T.title}>Users <span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}>({users.length})</span></div>
      <div style={T.card}>
        {loading ? <div style={T.empty}>Loading…</div> : !users.length ? <div style={T.empty}>No users yet</div> : (
          <table style={T.table}>
            <thead><tr>{["Name","Email","Plan","Admin","Wallet","Joined",""].map(h => <th key={h} style={T.th}>{h}</th>)}</tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={T.td}>{u.name}</td>
                  <td style={T.td}><span style={{ color: C.faint }}>{u.email}</span></td>
                  <td style={T.td}>
                    <select value={u.plan} onChange={e => patch(u.id, { plan: e.target.value as Plan })} style={{ background: C.inputBg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer" }}>
                      <option value="free">Free</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td style={T.td}><input type="checkbox" checked={u.isAdmin} onChange={e => patch(u.id, { isAdmin: e.target.checked })} style={{ cursor: "pointer", accentColor: C.accent }} /></td>
                  <td style={T.td}>{u.walletAddress ? <span style={T.chip}>{u.walletAddress.slice(0,6)}…{u.walletAddress.slice(-4)}</span> : <span style={{ color: C.border }}>—</span>}</td>
                  <td style={{ ...T.td, color: C.muted }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td style={T.td}><Btn label="Delete" variant="danger" onClick={() => del(u.id, u.email)} /></td>
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
  useEffect(() => { api<Session[]>("/sessions").then(s => { setSessions(s); setLoading(false); }).catch(() => setLoading(false)); }, []);
  const revoke = async (id: string) => {
    try { await api(`/sessions/${id}`, { method: "DELETE" }); setSessions(p => p.filter(s => s.id !== id)); toast("Revoked"); }
    catch (e: any) { toast(e.message, "err"); }
  };
  return (
    <>
      <div style={T.title}>Sessions <span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}>({sessions.length})</span></div>
      <div style={T.card}>
        {loading ? <div style={T.empty}>Loading…</div> : !sessions.length ? <div style={T.empty}>No active sessions</div> : (
          <table style={T.table}>
            <thead><tr>{["User","Email","IP","User Agent","Expires",""].map(h => <th key={h} style={T.th}>{h}</th>)}</tr></thead>
            <tbody>
              {sessions.map(s => {
                const expired = new Date(s.expiresAt) < new Date();
                return (
                  <tr key={s.id}>
                    <td style={T.td}>{s.userName}</td>
                    <td style={{ ...T.td, color: C.faint }}>{s.userEmail}</td>
                    <td style={{ ...T.td, color: C.muted }}>{s.ipAddress ?? "—"}</td>
                    <td style={{ ...T.td, color: C.muted }}>{s.userAgent ? s.userAgent.slice(0,40) + (s.userAgent.length > 40 ? "…" : "") : "—"}</td>
                    <td style={T.td}><span style={{ color: expired ? C.danger : C.success, fontWeight: 500 }}>{expired ? "Expired" : new Date(s.expiresAt).toLocaleDateString()}</span></td>
                    <td style={T.td}><Btn label="Revoke" variant="danger" onClick={() => revoke(s.id)} /></td>
                  </tr>
                );
              })}
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
  useEffect(() => { api<Wallet[]>("/wallets").then(w => { setWallets(w); setLoading(false); }).catch(() => setLoading(false)); }, []);
  return (
    <>
      <div style={T.title}>Wallets <span style={{ fontSize: 14, fontWeight: 400, color: C.muted }}>({wallets.length})</span></div>
      <div style={T.card}>
        {loading ? <div style={T.empty}>Loading…</div> : !wallets.length ? <div style={T.empty}>No linked wallets</div> : (
          <table style={T.table}>
            <thead><tr>{["Address","Chain","Primary","User","Email","Linked"].map(h => <th key={h} style={T.th}>{h}</th>)}</tr></thead>
            <tbody>
              {wallets.map(w => (
                <tr key={w.id}>
                  <td style={T.td}><span style={{ fontFamily: "monospace", fontSize: 12, color: C.faint }}>{w.address.slice(0,8)}…{w.address.slice(-6)}</span></td>
                  <td style={T.td}><span style={T.chip}>Chain {w.chainId}</span></td>
                  <td style={T.td}>{w.isPrimary ? <span style={{ color: C.success }}>✓</span> : <span style={{ color: C.border }}>—</span>}</td>
                  <td style={T.td}>{w.userName}</td>
                  <td style={{ ...T.td, color: C.faint }}>{w.userEmail}</td>
                  <td style={{ ...T.td, color: C.muted }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── Service page ─────────────────────────────────────────
const SVC_META: Record<string, { title: string; desc: string; link?: string; linkLabel?: string; testLabel?: string; testKey?: string; fields: { key: string; label: string; dbKey: string; sensitive?: boolean }[] }> = {
  auth: {
    title: "Authentication — Google OAuth",
    desc: "Enable Google sign-in. Create OAuth credentials in Google Cloud Console and add your redirect URI.",
    link: "https://console.cloud.google.com/apis/credentials", linkLabel: "Open Google Cloud Console",
    fields: [
      { key: "googleClientId",     label: "Client ID",     dbKey: "google_client_id" },
      { key: "googleClientSecret", label: "Client Secret", dbKey: "google_client_secret", sensitive: true },
    ],
  },
  email: {
    title: "Email — Resend",
    desc: "Transactional emails for verification, password reset, magic links, and invoices. Domain must be verified.",
    link: "https://resend.com/api-keys", linkLabel: "Resend Dashboard",
    testLabel: "Send test email", testKey: "email",
    fields: [
      { key: "resendApiKey", label: "API Key",    dbKey: "resend_api_key", sensitive: true },
      { key: "emailFrom",   label: "From Email", dbKey: "email_from" },
    ],
  },
  stripe: {
    title: "Billing — Stripe",
    desc: "Subscription billing, checkout sessions, and customer portal. Use test keys for development.",
    link: "https://dashboard.stripe.com/apikeys", linkLabel: "Stripe Dashboard",
    testLabel: "Test connection", testKey: "stripe",
    fields: [
      { key: "secretKey",           label: "Secret Key",          dbKey: "stripe_secret_key",          sensitive: true },
      { key: "webhookSecret",       label: "Webhook Secret",      dbKey: "stripe_webhook_secret",      sensitive: true },
      { key: "proPriceId",          label: "Pro Price ID",        dbKey: "stripe_pro_price_id" },
      { key: "enterprisePriceId",   label: "Enterprise Price ID", dbKey: "stripe_enterprise_price_id" },
    ],
  },
  crypto: {
    title: "Crypto — RPC & SIWE",
    desc: "JSON-RPC endpoints for on-chain reads, token gating, and ENS resolution. SIWE config for wallet login.",
    link: "https://www.alchemy.com", linkLabel: "Get RPC keys at Alchemy",
    testLabel: "Test ETH RPC", testKey: "crypto",
    fields: [
      { key: "ethRpcUrl",     label: "Ethereum RPC",  dbKey: "eth_rpc_url" },
      { key: "baseRpcUrl",    label: "Base RPC",      dbKey: "base_rpc_url" },
      { key: "polygonRpcUrl", label: "Polygon RPC",   dbKey: "polygon_rpc_url" },
      { key: "siweDomain",    label: "SIWE Domain",   dbKey: "siwe_domain" },
      { key: "siweStatement", label: "SIWE Statement",dbKey: "siwe_statement" },
    ],
  },
  database: {
    title: "Database — PostgreSQL",
    desc: "Postgres-compatible connection string. Supports Supabase, Neon, Railway, and direct Postgres. Restart required for URL changes.",
    testLabel: "Ping database", testKey: "database",
    fields: [
      { key: "url", label: "Connection URL", dbKey: "database_url", sensitive: true },
    ],
  },
};

function ServicePage({ svcId, toast }: { svcId: string; toast: (m: string, t?: "ok" | "err") => void }) {
  const meta = SVC_META[svcId];
  const [svcData, setSvcData] = useState<any>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setEdits({}); setTestResult(null);
    api<Services>("/services").then(s => setSvcData((s as any)[svcId])).catch(() => {});
  }, [svcId]);

  const save = async () => {
    const payload: Record<string, string> = {};
    for (const f of meta.fields) {
      const v = edits[f.key];
      if (v !== undefined && v !== "") payload[f.dbKey] = v;
    }
    if (!Object.keys(payload).length) return;
    setSaving(true);
    try {
      await api("/services", { method: "PATCH", body: JSON.stringify(payload) });
      const fresh = await api<Services>("/services");
      setSvcData((fresh as any)[svcId]);
      setEdits({});
      toast("Saved");
    } catch (e: any) { toast(e.message, "err"); }
    setSaving(false);
  };

  const test = async () => {
    if (!meta.testKey) return;
    setTesting(true); setTestResult(null);
    try { const r = await api<{ ok: boolean; message: string }>(`/services/test/${meta.testKey}`); setTestResult(r); }
    catch (e: any) { setTestResult({ ok: false, message: e.message }); }
    setTesting(false);
  };

  if (!svcData) return <div style={T.empty}>Loading…</div>;

  const hasEdits = meta.fields.some(f => edits[f.key] !== undefined && edits[f.key] !== "");

  return (
    <>
      <div style={T.title}>{meta.title}</div>
      <div style={T.card}>
        <p style={{ fontSize: 13, color: C.faint, marginBottom: 24, lineHeight: 1.6 }}>{meta.desc}</p>

        <div style={T.svcGroup}>
          {meta.fields.map(f => {
            const field: SF = svcData[f.key];
            const val = edits[f.key] !== undefined ? edits[f.key] : (field?.value ?? "");
            return (
              <div key={f.key} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{ ...T.label, marginBottom: 0 }}>{f.label}</label>
                  <span style={T.srcBadge(field?.source ?? "unset")}>{field?.source ?? "unset"}</span>
                </div>
                <input
                  style={T.input}
                  type="text"
                  placeholder={field?.set ? (f.sensitive ? "●●●●●●●● (leave blank to keep)" : field.value ?? "") : "Not configured"}
                  value={val}
                  onChange={e => setEdits(p => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>

        {testResult && <div style={T.testBox(testResult.ok)}>{testResult.ok ? "✓" : "✗"} {testResult.message}</div>}

        <div style={T.footer}>
          {hasEdits && <Btn label={saving ? "Saving…" : "Save changes"} onClick={save} disabled={saving} />}
          {meta.testLabel && <Btn label={testing ? "Testing…" : meta.testLabel} variant="ghost" onClick={test} disabled={testing} />}
          {meta.link && <a href={meta.link} target="_blank" style={{ fontSize: 13, color: C.accent, textDecoration: "none", alignSelf: "center", marginLeft: "auto" }}>↗ {meta.linkLabel}</a>}
        </div>
      </div>
    </>
  );
}

// ─── Sidebar ─────────────────────────────────────────────
type Page = "dashboard" | "users" | "sessions" | "wallets" | "svc:auth" | "svc:email" | "svc:stripe" | "svc:crypto" | "svc:database";

const NAV = [
  { section: "General", items: [
    { id: "dashboard", label: "Dashboard" },
    { id: "users",     label: "Users" },
    { id: "sessions",  label: "Sessions" },
    { id: "wallets",   label: "Wallets" },
  ]},
  { section: "Services", items: [
    { id: "svc:auth",     label: "Auth" },
    { id: "svc:email",    label: "Email" },
    { id: "svc:stripe",   label: "Stripe" },
    { id: "svc:crypto",   label: "Crypto" },
    { id: "svc:database", label: "Database" },
  ]},
];

function NavItem({ id, label, active, onClick }: { id: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer", borderRadius: 7, margin: "1px 8px", background: active ? C.surface : "transparent", color: active ? C.text : C.muted, fontWeight: active ? 600 : 400, fontSize: 13, borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent", transition: "all .12s" }}>
      {label}
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────
type AppState = "loading" | "login" | "app";

function App() {
  const [state, setState] = useState<AppState>("loading");
  const [page, setPage] = useState<Page>("dashboard");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const check = useCallback(() => {
    api<Stats>("/stats")
      .then(() => setState("app"))
      .catch((e: any) => setState(e.status === 401 || e.status === 403 ? "login" : "app"));
  }, []);

  useEffect(() => { check(); }, []);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => setToast({ msg, type });

  if (state === "loading") return <div style={{ ...T.layout, alignItems: "center", justifyContent: "center" }}><span style={{ color: C.muted }}>Loading…</span></div>;
  if (state === "login")   return <Login onSuccess={() => setState("app")} />;

  const svcId = page.startsWith("svc:") ? page.slice(4) : null;

  return (
    <div style={T.layout}>

      <nav style={T.sidebar}>
        <div style={T.logoWrap}>
          <div style={T.logoText}>GoBoiler</div>
          <div style={T.logoBadge}>Admin Panel</div>
        </div>

        <div style={{ flex: 1, paddingTop: 8 }}>
          {NAV.map(group => (
            <div key={group.section}>
              <div style={T.navSection}>{group.section}</div>
              {group.items.map(item => (
                <NavItem key={item.id} id={item.id} label={item.label} active={page === item.id} onClick={() => setPage(item.id as Page)} />
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 16px", borderTop: `1px solid ${C.border}` }}>
          <a href="/auth/sign-out" style={{ fontSize: 12, color: C.muted, textDecoration: "none" }}>← Sign out</a>
        </div>
      </nav>

      <main style={T.main}>
        {page === "dashboard" && <Dashboard />}
        {page === "users"     && <Users toast={showToast} />}
        {page === "sessions"  && <Sessions toast={showToast} />}
        {page === "wallets"   && <Wallets />}
        {svcId && <ServicePage svcId={svcId} toast={showToast} />}
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
