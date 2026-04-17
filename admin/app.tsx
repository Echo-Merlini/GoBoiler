import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

// ─── Types ───────────────────────────────────────────────
type Plan = "free" | "pro" | "enterprise";
type User = { id: string; name: string; email: string; plan: Plan; isAdmin: boolean; walletAddress: string | null; stripeCustomerId: string | null; createdAt: string };
type Session = { id: string; userId: string; userEmail: string; userName: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; createdAt: string };
type Wallet = { id: string; address: string; chainId: number; isPrimary: boolean; userId: string; userEmail: string; userName: string; createdAt: string };
type Stats = { totalUsers: number; totalSessions: number; totalWallets: number; totalPushSubs: number; planCounts: { plan: string; total: number }[] };
type PushSub = { id: string; userId: string; userEmail: string; userAgent: string | null; createdAt: string };
type CronJob = { id: string; name: string; schedule: string; url: string; method: string; body: string | null; headers: string | null; enabled: boolean; running: boolean; lastRunAt: string | null; lastRunStatus: string | null; lastRunMessage: string | null; createdAt: string };
type SF = { set: boolean; source: "db" | "env" | "unset"; value: string | null };
type McpServer = { id: string; name: string; type: "sse" | "http" | "stdio"; url: string; token?: string; enabled: boolean };
type ApiKey = { id: string; name: string; prefix: string; scopes: string; lastUsedAt: string | null; expiresAt: string | null; createdAt: string };
type Services = {
  auth:     { googleClientId: SF; googleClientSecret: SF };
  email:    { resendApiKey: SF; emailFrom: SF };
  stripe:   { secretKey: SF; webhookSecret: SF; proPriceId: SF; enterprisePriceId: SF };
  crypto:   { ethRpcUrl: SF; baseRpcUrl: SF; polygonRpcUrl: SF; siweDomain: SF; siweStatement: SF };
  database: { url: SF };
  storage:  { bucket: SF; region: SF; accessKeyId: SF; secretAccessKey: SF; endpoint: SF; publicUrl: SF };
  push:     { vapidPublicKey: SF; vapidPrivateKey: SF; vapidEmail: SF; serviceUrl: SF; serviceToken: SF };
  agent:    { anthropicApiKey: SF; openaiApiKey: SF; groqApiKey: SF; mistralApiKey: SF; defaultModel: SF };
  mcp:      { servers: SF };
};

// ─── API ─────────────────────────────────────────────────
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/admin/api${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) { const t = await res.text(); throw Object.assign(new Error(t || `HTTP ${res.status}`), { status: res.status }); }
  return res.json();
}

// ─── Theme ───────────────────────────────────────────────
const C = {
  bg: "#000000", surface: "#111111", surface2: "#000000",
  border: "#1f1f1f", borderLight: "#141414",
  text: "#f1f5f9", muted: "#555555", faint: "#888888",
  accent: "#818cf8", accentDark: "#6366f1",
  success: "#4ade80", danger: "#f87171", warning: "#fbbf24",
  inputBg: "#0a0a0a",
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
    { label: "Total Users",     value: stats?.totalUsers ?? "—" },
    { label: "Active Sessions", value: stats?.totalSessions ?? "—" },
    { label: "Linked Wallets",  value: stats?.totalWallets ?? "—" },
    { label: "Push Subscribers",value: stats?.totalPushSubs ?? "—" },
    { label: "Free",            value: pm.free ?? 0 },
    { label: "Pro",             value: pm.pro ?? 0 },
    { label: "Enterprise",      value: pm.enterprise ?? 0 },
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
  storage: {
    title: "Storage — S3 / R2 / MinIO",
    desc: "S3-compatible object storage for file uploads. Works with AWS S3, Cloudflare R2, MinIO, Backblaze B2. Set S3_ENDPOINT for non-AWS providers.",
    link: "https://s3.console.aws.amazon.com", linkLabel: "Open AWS S3 Console",
    testLabel: "Test connection", testKey: "storage",
    fields: [
      { key: "bucket",          label: "Bucket Name",       dbKey: "s3_bucket" },
      { key: "region",          label: "Region",            dbKey: "s3_region" },
      { key: "accessKeyId",     label: "Access Key ID",     dbKey: "s3_access_key_id" },
      { key: "secretAccessKey", label: "Secret Access Key", dbKey: "s3_secret_access_key", sensitive: true },
      { key: "endpoint",        label: "Endpoint URL",      dbKey: "s3_endpoint" },
      { key: "publicUrl",       label: "Public / CDN URL",  dbKey: "s3_public_url" },
    ],
  },
  agent: {
    title: "AI Agent — API Keys",
    desc: "API keys for AI providers. Keys stored encrypted in DB and never exposed to the frontend. Used by your /agent/* routes.",
    testLabel: "Test configured keys", testKey: "agent",
    fields: [
      { key: "anthropicApiKey", label: "Anthropic API Key",  dbKey: "anthropic_api_key", sensitive: true },
      { key: "openaiApiKey",    label: "OpenAI API Key",     dbKey: "openai_api_key",    sensitive: true },
      { key: "groqApiKey",      label: "Groq API Key",       dbKey: "groq_api_key",      sensitive: true },
      { key: "mistralApiKey",   label: "Mistral API Key",    dbKey: "mistral_api_key",   sensitive: true },
      { key: "defaultModel",    label: "Default Model",      dbKey: "default_ai_model" },
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
    try { const r = await api<{ ok: boolean; message: string }>(`/services/test/${meta.testKey}`, { method: "POST" }); setTestResult(r); }
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

// ─── Cron helpers ────────────────────────────────────────
const CRON_PRESETS = [
  { label: "Every minute",   value: "* * * * *" },
  { label: "Every 5 min",    value: "*/5 * * * *" },
  { label: "Every 15 min",   value: "*/15 * * * *" },
  { label: "Every hour",     value: "0 * * * *" },
  { label: "Every day 9am",  value: "0 9 * * *" },
  { label: "Every Monday",   value: "0 9 * * 1" },
  { label: "Custom…",        value: "" },
];

function cronLabel(s: string) {
  return CRON_PRESETS.find(p => p.value === s)?.label ?? s;
}

// ─── Cron Page ───────────────────────────────────────────
function CronPage({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const blank = { name: "", schedule: "*/5 * * * *", customSchedule: "", url: "", method: "GET", body: "", headers: "" };
  const [form, setForm] = useState(blank);

  const load = () => api<CronJob[]>("/cron").then(j => { setJobs(j); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const addJob = async () => {
    if (!form.name || !form.url) return;
    const schedule = form.schedule || form.customSchedule;
    try {
      const job = await api<CronJob>("/cron", { method: "POST", body: JSON.stringify({ name: form.name, schedule, url: form.url, method: form.method, body: form.body || undefined, headers: form.headers || undefined }) });
      setJobs(p => [job, ...p]);
      setAdding(false); setForm(blank);
      toast("Job created — click Start to activate it");
    } catch (e: any) { toast(e.message, "err"); }
  };

  const start = async (id: string) => {
    try { const j = await api<CronJob>(`/cron/${id}/start`, { method: "POST" }); setJobs(p => p.map(x => x.id === id ? j : x)); toast("Started"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  const stop = async (id: string) => {
    try { await api(`/cron/${id}/stop`, { method: "POST" }); setJobs(p => p.map(x => x.id === id ? { ...x, enabled: false, running: false } : x)); toast("Stopped"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  const runNow = async (id: string) => {
    setRunning(id);
    try { const j = await api<CronJob>(`/cron/${id}/run`, { method: "POST" }); setJobs(p => p.map(x => x.id === id ? j : x)); toast("Ran"); }
    catch (e: any) { toast(e.message, "err"); }
    setRunning(null);
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try { await api(`/cron/${id}`, { method: "DELETE" }); setJobs(p => p.filter(x => x.id !== id)); toast("Deleted"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  const statusColor = (s: string | null) => s === "ok" ? C.success : s === "error" ? C.danger : C.muted;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={T.title as React.CSSProperties}>Cron Jobs</div>
        <Btn label="+ New job" onClick={() => setAdding(true)} />
      </div>

      <div style={{ fontSize: 13, color: C.faint, marginBottom: 24, lineHeight: 1.6 }}>
        Scheduled tasks that call an HTTP endpoint on a cron schedule. Jobs persist across restarts and can be started or stopped individually.
      </div>

      {adding && (
        <div style={{ ...T.card, marginBottom: 20, border: `1px solid ${C.accent}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>New Cron Job</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={T.label}>Name</label>
              <input style={T.input} placeholder="e.g. Daily cleanup" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={T.label}>Schedule</label>
              <select style={{ ...T.input, cursor: "pointer" }} value={form.schedule} onChange={e => setForm(p => ({ ...p, schedule: e.target.value }))}>
                {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {form.schedule === "" && (
                <input style={{ ...T.input, marginTop: 8 }} placeholder="cron expression e.g. 0 9 * * 1" value={form.customSchedule} onChange={e => setForm(p => ({ ...p, customSchedule: e.target.value }))} />
              )}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={T.label}>Method</label>
              <select style={{ ...T.input, cursor: "pointer" }} value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}>
                {["GET","POST","PUT","PATCH"].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={T.label}>URL</label>
              <input style={T.input} placeholder="http://localhost:3000/jobs/cleanup" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} />
            </div>
          </div>
          {form.method !== "GET" && (
            <div style={{ marginBottom: 12 }}>
              <label style={T.label}>Body <span style={{ color: C.muted }}>(JSON, optional)</span></label>
              <input style={T.input} placeholder='{"key":"value"}' value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn label="Create" onClick={addJob} />
            <Btn label="Cancel" variant="ghost" onClick={() => { setAdding(false); setForm(blank); }} />
          </div>
        </div>
      )}

      {loading ? <div style={T.empty}>Loading…</div> : !jobs.length && !adding ? (
        <div style={{ ...T.card, textAlign: "center" as const, padding: 48 }}>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>No cron jobs yet</div>
          <Btn label="Create first job" onClick={() => setAdding(true)} />
        </div>
      ) : (
        <div style={T.card}>
          <table style={T.table}>
            <thead>
              <tr>{["Name","Schedule","URL","Last run","Status",""].map(h => <th key={h} style={T.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id}>
                  <td style={T.td}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{j.name}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <span style={{ ...T.chip, fontSize: 10, background: j.enabled ? "#0d2a0d" : C.surface, color: j.enabled ? C.success : C.muted, border: `1px solid ${j.enabled ? "#166534" : C.border}` }}>
                        {j.enabled ? "● active" : "○ stopped"}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...T.td, color: C.faint, fontFamily: "monospace", fontSize: 12 }}>
                    <div>{j.schedule}</div>
                    <div style={{ color: C.muted, fontFamily: "inherit", fontSize: 11, marginTop: 2 }}>{cronLabel(j.schedule)}</div>
                  </td>
                  <td style={{ ...T.td, maxWidth: 200 }}>
                    <div style={{ fontSize: 12, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      <span style={{ ...T.chip, fontSize: 10, marginRight: 6 }}>{j.method}</span>{j.url}
                    </div>
                  </td>
                  <td style={{ ...T.td, color: C.muted, fontSize: 12 }}>
                    {j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "—"}
                  </td>
                  <td style={T.td}>
                    {j.lastRunStatus ? (
                      <span style={{ color: statusColor(j.lastRunStatus), fontSize: 12, fontWeight: 600 }}>
                        {j.lastRunStatus === "ok" ? "✓ ok" : `✗ error`}
                      </span>
                    ) : <span style={{ color: C.muted }}>—</span>}
                    {j.lastRunMessage && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{j.lastRunMessage}</div>}
                  </td>
                  <td style={{ ...T.td, whiteSpace: "nowrap" as const }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn label={running === j.id ? "…" : "Run"} variant="ghost" onClick={() => runNow(j.id)} disabled={running === j.id} />
                      {j.enabled
                        ? <Btn label="Stop" variant="ghost" onClick={() => stop(j.id)} />
                        : <Btn label="Start" onClick={() => start(j.id)} />
                      }
                      <Btn label="Delete" variant="danger" onClick={() => del(j.id, j.name)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Push / PWA Page ─────────────────────────────────────
function PushPage({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [svcData, setSvcData] = useState<Services["push"] | null>(null);
  const [subs, setSubs] = useState<PushSub[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api<Services>("/services").then(s => setSvcData(s.push)).catch(() => {});
    api<PushSub[]>("/push/subscriptions").then(setSubs).catch(() => {});
  }, []);

  const fields: { key: keyof Services["push"]; label: string; dbKey: string; sensitive?: boolean; readOnly?: boolean }[] = [
    { key: "vapidPublicKey",  label: "VAPID Public Key",  dbKey: "vapid_public_key" },
    { key: "vapidPrivateKey", label: "VAPID Private Key", dbKey: "vapid_private_key", sensitive: true },
    { key: "vapidEmail",      label: "VAPID Contact Email", dbKey: "vapid_email" },
    { key: "serviceUrl",      label: "Push Service URL (fallback)", dbKey: "push_service_url" },
    { key: "serviceToken",    label: "Push Service Token",  dbKey: "push_service_token", sensitive: true },
  ];

  const generateKeys = async () => {
    setGenerating(true);
    try {
      const keys = await api<{ publicKey: string; privateKey: string }>("/push/generate-vapid", { method: "POST" });
      setEdits(p => ({ ...p, vapidPublicKey: keys.publicKey, vapidPrivateKey: keys.privateKey }));
      toast("Keys generated — save to apply");
    } catch (e: any) { toast(e.message, "err"); }
    setGenerating(false);
  };

  const save = async () => {
    const payload: Record<string, string> = {};
    for (const f of fields) {
      const v = edits[f.key];
      if (v !== undefined && v !== "") payload[f.dbKey] = v;
    }
    if (!Object.keys(payload).length) return;
    setSaving(true);
    try {
      await api("/services", { method: "PATCH", body: JSON.stringify(payload) });
      const fresh = await api<Services>("/services");
      setSvcData(fresh.push); setEdits({});
      toast("Saved — restart server to apply VAPID keys");
    } catch (e: any) { toast(e.message, "err"); }
    setSaving(false);
  };

  const hasEdits = fields.some(f => edits[f.key] !== undefined && edits[f.key] !== "");

  return (
    <>
      <div style={T.title}>Push Notifications / PWA</div>

      <div style={T.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>VAPID Configuration</div>
            <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
              VAPID keys enable native Web Push without an external service. The public key is exposed to browsers; the private key signs notifications server-side.
            </div>
          </div>
          <Btn label={generating ? "Generating…" : "Generate keys"} variant="ghost" onClick={generateKeys} disabled={generating} />
        </div>

        {fields.map(f => {
          const field = svcData?.[f.key] as SF | undefined;
          const val = edits[f.key] !== undefined ? edits[f.key] : (field?.value ?? "");
          return (
            <div key={f.key} style={{ marginBottom: 14 }}>
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

        <div style={{ marginTop: 8, padding: "10px 14px", background: C.inputBg, borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, color: C.faint, lineHeight: 1.7 }}>
          Add to your frontend HTML: <code style={{ color: C.accent }}>&lt;link rel="manifest" href="/manifest.json"&gt;</code>
          <br />
          Register service worker: <code style={{ color: C.accent }}>navigator.serviceWorker.register('/sw.js')</code>
          <br />
          Subscribe endpoint: <code style={{ color: C.accent }}>POST /push/subscribe</code> · Public key endpoint: <code style={{ color: C.accent }}>GET /push/vapid-public-key</code>
        </div>

        {hasEdits && (
          <div style={T.footer}>
            <Btn label={saving ? "Saving…" : "Save changes"} onClick={save} disabled={saving} />
          </div>
        )}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "24px 0 12px" }}>
        Active Subscriptions <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>({subs.length})</span>
      </div>
      <div style={T.card}>
        {!subs.length ? <div style={T.empty}>No active push subscriptions</div> : (
          <table style={T.table}>
            <thead><tr>{["User", "Browser", "Subscribed"].map(h => <th key={h} style={T.th}>{h}</th>)}</tr></thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.id}>
                  <td style={{ ...T.td, color: C.faint }}>{s.userEmail}</td>
                  <td style={{ ...T.td, color: C.muted, fontSize: 12 }}>{s.userAgent ? s.userAgent.slice(0, 60) + (s.userAgent.length > 60 ? "…" : "") : "—"}</td>
                  <td style={{ ...T.td, color: C.muted }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── MCP Page ────────────────────────────────────────────
function McpPage({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Omit<McpServer, "id" | "enabled">>({ name: "", type: "sse", url: "", token: "" });

  useEffect(() => {
    api<McpServer[]>("/mcp/servers").then(s => { setServers(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const save = async (updated: McpServer[]) => {
    await api("/services", { method: "PATCH", body: JSON.stringify({ mcp_servers: JSON.stringify(updated) }) });
    setServers(updated);
  };

  const addServer = async () => {
    if (!form.name || !form.url) return;
    const newServer: McpServer = { ...form, id: crypto.randomUUID(), enabled: true };
    try { await save([...servers, newServer]); setAdding(false); setForm({ name: "", type: "sse", url: "", token: "" }); toast("Server added"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  const remove = async (id: string) => {
    try { await save(servers.filter(s => s.id !== id)); toast("Removed"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  const toggle = async (id: string) => {
    const updated = servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    try { await save(updated); }
    catch (e: any) { toast(e.message, "err"); }
  };

  const testServer = async (s: McpServer) => {
    if (s.type === "stdio") { setTestResults(p => ({ ...p, [s.id]: { ok: false, message: "stdio servers can't be pinged remotely" } })); return; }
    setTesting(s.id);
    try {
      const r = await api<{ ok: boolean; message: string }>("/services/test/mcp", { method: "POST", body: JSON.stringify({ url: s.url }) });
      setTestResults(p => ({ ...p, [s.id]: r }));
    } catch (e: any) { setTestResults(p => ({ ...p, [s.id]: { ok: false, message: e.message } })); }
    setTesting(null);
  };

  const inputStyle = { ...T.input, marginBottom: 0 };
  const selectStyle = { ...inputStyle, cursor: "pointer" };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={T.title as React.CSSProperties}>MCP Servers</div>
        <Btn label="+ Add server" onClick={() => setAdding(true)} />
      </div>

      <div style={{ fontSize: 13, color: C.faint, marginBottom: 24, lineHeight: 1.6 }}>
        Model Context Protocol servers expose tools and resources to AI agents (Claude Code, Cursor, Copilot, etc.).
        SSE and HTTP servers can be pinged from here. Configs are stored in the database.
      </div>

      {adding && (
        <div style={{ ...T.card, marginBottom: 20, border: `1px solid ${C.accent}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>New MCP Server</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={T.label}>Name</label>
              <input style={inputStyle} placeholder="e.g. My Tools Server" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={T.label}>Type</label>
              <select style={selectStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as McpServer["type"] }))}>
                <option value="sse">SSE (Server-Sent Events)</option>
                <option value="http">HTTP (Streamable)</option>
                <option value="stdio">stdio (local process)</option>
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={T.label}>{form.type === "stdio" ? "Command" : "URL"}</label>
              <input style={inputStyle} placeholder={form.type === "stdio" ? "npx my-mcp-server" : "https://mcp.example.com/sse"} value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} />
            </div>
            <div>
              <label style={T.label}>Auth Token <span style={{ color: C.muted }}>(optional)</span></label>
              <input style={inputStyle} type="password" placeholder="Bearer token if required" value={form.token} onChange={e => setForm(p => ({ ...p, token: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn label="Add" onClick={addServer} />
            <Btn label="Cancel" variant="ghost" onClick={() => setAdding(false)} />
          </div>
        </div>
      )}

      {loading ? <div style={T.empty}>Loading…</div> : !servers.length && !adding ? (
        <div style={{ ...T.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>No MCP servers configured</div>
          <Btn label="Add your first server" onClick={() => setAdding(true)} />
        </div>
      ) : (
        servers.map(s => (
          <div key={s.id} style={{ ...T.card, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: s.enabled ? C.text : C.muted }}>{s.name}</span>
                  <span style={{ ...T.chip, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>{s.type}</span>
                  {!s.enabled && <span style={{ fontSize: 10, color: C.muted }}>disabled</span>}
                </div>
                <div style={{ fontSize: 12, color: C.faint, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.url}</div>
                {testResults[s.id] && (
                  <div style={{ ...T.testBox(testResults[s.id].ok), marginTop: 10, padding: "8px 12px", fontSize: 12 }}>
                    {testResults[s.id].ok ? "✓" : "✗"} {testResults[s.id].message}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {s.type !== "stdio" && (
                  <Btn label={testing === s.id ? "…" : "Ping"} variant="ghost" onClick={() => testServer(s)} disabled={testing === s.id} />
                )}
                <Btn label={s.enabled ? "Disable" : "Enable"} variant="ghost" onClick={() => toggle(s.id)} />
                <Btn label="Remove" variant="danger" onClick={() => remove(s.id)} />
              </div>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ─── API Keys ────────────────────────────────────────────
function ApiKeysPage({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const blank = { name: "", scopes: "*", expiresAt: "" };
  const [form, setForm] = useState(blank);

  const load = () => api<ApiKey[]>("/apikeys").then(k => { setKeys(k); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) return;
    try {
      const body: any = { name: form.name, scopes: form.scopes };
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const r = await api<{ key: string; id: string; name: string; prefix: string; scopes: string; createdAt: string }>("/apikeys", { method: "POST", body: JSON.stringify(body) });
      setNewKey(r.key);
      setAdding(false); setForm(blank);
      load();
    } catch (e: any) { toast(e.message, "err"); }
  };

  const revoke = async (id: string, name: string) => {
    if (!confirm(`Revoke key "${name}"?`)) return;
    try { await api(`/apikeys/${id}`, { method: "DELETE" }); setKeys(p => p.filter(k => k.id !== id)); toast("Revoked"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={T.title as React.CSSProperties}>API Keys</div>
        <Btn label="+ Create key" onClick={() => { setAdding(true); setNewKey(null); }} />
      </div>

      <div style={{ fontSize: 13, color: C.faint, marginBottom: 24, lineHeight: 1.6 }}>
        API keys grant programmatic access without a session. Prefix: <code style={{ color: C.accent }}>gbk_</code>. The raw key is shown <strong style={{ color: C.warning }}>once</strong> on creation — store it immediately.
      </div>

      {newKey && (
        <div style={{ ...T.card, border: `1px solid ${C.success}`, background: "#052e16", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.success, marginBottom: 10 }}>Key created — copy it now, it won't be shown again</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <code style={{ flex: 1, background: "#000", border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 14px", fontSize: 12, color: C.text, wordBreak: "break-all" as const, fontFamily: "monospace" }}>{newKey}</code>
            <Btn label="Copy" variant="ghost" onClick={() => { navigator.clipboard.writeText(newKey); toast("Copied"); }} />
          </div>
          <Btn label="Dismiss" variant="ghost" onClick={() => setNewKey(null)} />
        </div>
      )}

      {adding && (
        <div style={{ ...T.card, marginBottom: 20, border: `1px solid ${C.accent}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 16 }}>New API Key</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={T.label}>Name</label>
              <input style={T.input} placeholder="e.g. My App" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label style={T.label}>Scopes <span style={{ color: C.muted }}>(comma-separated or *)</span></label>
              <input style={T.input} placeholder="* or read,write" value={form.scopes} onChange={e => setForm(p => ({ ...p, scopes: e.target.value }))} />
            </div>
            <div>
              <label style={T.label}>Expires <span style={{ color: C.muted }}>(optional)</span></label>
              <input style={T.input} type="date" value={form.expiresAt} onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn label="Create" onClick={create} />
            <Btn label="Cancel" variant="ghost" onClick={() => setAdding(false)} />
          </div>
        </div>
      )}

      <div style={T.card}>
        {loading ? <div style={T.empty}>Loading…</div> : !keys.length ? <div style={T.empty}>No API keys yet</div> : (
          <table style={T.table}>
            <thead><tr>{["Name","Prefix","Scopes","Last used","Expires",""].map(h => <th key={h} style={T.th}>{h}</th>)}</tr></thead>
            <tbody>
              {keys.map(k => {
                const expired = k.expiresAt && new Date(k.expiresAt) < new Date();
                return (
                  <tr key={k.id}>
                    <td style={T.td}><span style={{ fontWeight: 600 }}>{k.name}</span></td>
                    <td style={T.td}><code style={{ fontSize: 12, color: C.faint, fontFamily: "monospace" }}>{k.prefix}…</code></td>
                    <td style={T.td}><span style={T.chip}>{k.scopes}</span></td>
                    <td style={{ ...T.td, color: C.muted }}>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</td>
                    <td style={T.td}>{k.expiresAt ? <span style={{ color: expired ? C.danger : C.faint }}>{new Date(k.expiresAt).toLocaleDateString()}</span> : <span style={{ color: C.border }}>Never</span>}</td>
                    <td style={T.td}><Btn label="Revoke" variant="danger" onClick={() => revoke(k.id, k.name)} /></td>
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

// ─── Log Viewer ──────────────────────────────────────────
type AppLog = { id: string; level: string; message: string; source: string | null; meta: string | null; createdAt: string };

function LogViewer({ toast }: { toast: (m: string, t?: "ok" | "err") => void }) {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(false);

  const load = () => {
    const params = new URLSearchParams({ limit: "200", ...(level ? { level } : {}), ...(search ? { search } : {}) });
    api<AppLog[]>(`/logs?${params}`).then(setLogs).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [level, search]);

  // SSE live stream
  useEffect(() => {
    if (!live) return;
    const es = new EventSource("/admin/api/logs/stream", { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const entry: AppLog = JSON.parse(e.data);
        setLogs(prev => {
          if (level && entry.level !== level) return prev;
          if (search && !entry.message.toLowerCase().includes(search.toLowerCase())) return prev;
          return [entry, ...prev].slice(0, 200);
        });
      } catch {}
    };
    return () => es.close();
  }, [live, level, search]);

  const clear = async () => {
    if (!confirm("Clear all logs?")) return;
    try { await api("/logs", { method: "DELETE" }); setLogs([]); toast("Logs cleared"); }
    catch (e: any) { toast(e.message, "err"); }
  };

  const levelColor = (l: string) => l === "error" ? C.danger : l === "warn" ? C.warning : C.faint;
  const levelBg    = (l: string) => l === "error" ? "#2d0a0a" : l === "warn" ? "#2d1f00" : C.surface;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={T.title as React.CSSProperties}>Logs</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} style={{ accentColor: C.accent }} />
            Live (SSE)
          </label>
          <Btn label="Refresh" variant="ghost" onClick={load} />
          <Btn label="Clear all" variant="danger" onClick={clear} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <select value={level} onChange={e => setLevel(e.target.value)} style={{ ...T.input, width: 140, cursor: "pointer" }}>
          <option value="">All levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <input style={{ ...T.input, flex: 1 }} placeholder="Search messages…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div style={T.empty}>Loading…</div> : !logs.length ? (
        <div style={{ ...T.card, ...T.empty }}>No logs yet</div>
      ) : (
        <div style={{ ...T.card, padding: 0, overflow: "hidden" }}>
          {logs.map((log, i) => (
            <div key={log.id} style={{ display: "flex", gap: 12, padding: "10px 16px", background: i % 2 === 0 ? C.surface : C.bg, borderBottom: `1px solid ${C.borderLight}`, alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: levelColor(log.level), background: levelBg(log.level), padding: "2px 7px", borderRadius: 20, flexShrink: 0, marginTop: 1, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
                {log.level}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text }}>{log.message}</div>
                {log.meta && (
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {log.meta}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                {log.source && <span style={{ ...T.chip, fontSize: 10 }}>{log.source}</span>}
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap" as const }}>
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── FAQ ─────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    title: "New user sign-up flow",
    body: `End-to-end flow for email/password sign-up:

1. POST /auth/sign-up/email  { email, password, name }
   → User created (emailVerified: false, token: null)
   → Better Auth calls sendVerificationEmail → Resend sends welcome + verify link

2. User clicks verification link in email
   → GET /auth/verify-email?token=...&callbackURL=/
   → Better Auth marks emailVerified: true, redirects to callbackURL

3. POST /auth/sign-in/email  { email, password }
   → Returns { token, user }
   → Use token as Bearer or rely on the session cookie set automatically

4. All protected routes accept:
   - Cookie: set automatically by Better Auth on sign-in
   - Header: Authorization: Bearer <token>  (bearer plugin is already included)

requireEmailVerification is ON by default. Sign-in returns EMAIL_NOT_VERIFIED until step 2 is done.`,
  },
  {
    title: "Password reset flow",
    body: `1. POST /auth/request-password-reset  { email, redirectTo: "https://yourdomain.com/reset-password" }
   → Sends reset email via Resend (always returns 200 even if email not found)

2. User clicks link → lands on your frontend /reset-password page with ?token=... in URL

3. POST /auth/reset-password  { token, newPassword }
   → Password updated, existing sessions invalidated

Your frontend must handle the /reset-password route and read the token query param.`,
  },
  {
    title: "Magic link (passwordless) flow",
    body: `1. POST /auth/sign-in/magic-link  { email, callbackURL: "https://yourdomain.com/dashboard" }
   → Sends magic link email via Resend
   → Returns { status: true }

2. User clicks link in email
   → GET /auth/magic-link/verify?token=...
   → Better Auth creates session, redirects to callbackURL

Works for existing and new users. New users are created automatically (emailVerified: true).`,
  },
  {
    title: "Auth — Google OAuth",
    body: `1. console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add Authorised redirect URI:
   https://yourdomain.com/auth/callback/google
4. Copy Client ID + Secret → Services → Auth (or .env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)

Frontend: redirect user to GET /auth/sign-in/social?provider=google&callbackURL=/dashboard
Better Auth handles the OAuth callback automatically. Google users are auto-verified.`,
  },
  {
    title: "Crypto — RPC & SIWE wallet login",
    body: `RPC keys (Alchemy recommended):
1. alchemy.com → create app per network → copy HTTPS URL
2. Add to Services → Crypto (or .env ETH_RPC_URL, BASE_RPC_URL, POLYGON_RPC_URL, OPTIMISM_RPC_URL, ARBITRUM_RPC_URL)
   Chains without a key fall back to public RPCs automatically (⚠ warning logged on startup).

SIWE config:
• SIWE_DOMAIN: domain without protocol (e.g. app.yourdomain.com)
• SIWE_STATEMENT: message shown in wallet popup

Frontend flow:
  1. GET  /auth/siwe/nonce               → { nonce }
  2. Build SiweMessage with nonce, have user sign it
  3. POST /auth/siwe/verify  { message, signature }  → { token, user }
  4. Use token as Authorization: Bearer <token>

To link a wallet to an existing email account (user must be signed in):
  POST /auth/siwe/link  { message, signature }`,
  },
  {
    title: "Billing — Stripe setup",
    body: `1. dashboard.stripe.com/apikeys → copy secret key (sk_test_ for dev)
2. Create product with recurring price → copy price_xxx ID into Pro Price ID
3. dashboard.stripe.com/webhooks → add endpoint:
   https://yourdomain.com/billing/webhook
   Events: customer.subscription.created, customer.subscription.updated,
           customer.subscription.deleted, invoice.payment_succeeded
4. Copy webhook signing secret (whsec_xxx) → Services → Stripe

Frontend:
  POST /billing/checkout  (session required) → { url } → redirect to Stripe Checkout
  POST /billing/portal    (session required) → { url } → redirect to billing portal

Test cards: 4242 4242 4242 4242 (success), 4000 0000 0000 0002 (decline)`,
  },
  {
    title: "Database — PostgreSQL connection",
    body: `Supports any Postgres-compatible provider:

Supabase (pooler): postgresql://postgres.[ref]:[pass]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
Neon:              postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
Railway:           postgresql://postgres:pass@roundhouse.proxy.rlwy.net:PORT/railway
Local:             postgresql://postgres:password@localhost:5432/mydb

After changing DATABASE_URL restart the server. Run migrations: bun run db:migrate`,
  },
  {
    title: "Storage — S3 / R2 / MinIO file uploads",
    body: `Works with any S3-compatible provider:

AWS S3:
  S3_BUCKET=my-bucket  S3_REGION=eu-west-1
  S3_ACCESS_KEY_ID=...  S3_SECRET_ACCESS_KEY=...

Cloudflare R2 (no egress fees):
  S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
  S3_BUCKET=my-bucket  S3_REGION=auto  S3_PUBLIC_URL=https://cdn.yourdomain.com

MinIO (self-hosted):
  S3_ENDPOINT=http://minio:9000  S3_BUCKET=uploads  S3_REGION=us-east-1

Upload from frontend (direct, ≤10 MB):
  POST /upload  (multipart/form-data, field name: "file")  → { key, url }

Upload from frontend (client-side, any size):
  POST /upload/presign  { filename, contentType }  → { url, publicUrl }
  PUT <url>  (direct to S3 with the file body)

Upload from backend:
  import { uploadFile } from '@/lib/storage';
  const url = await uploadFile('avatars/user-123.jpg', buffer, 'image/jpeg');`,
  },
  {
    title: "Push notifications & PWA setup",
    body: `1. Admin → System → Push / PWA → click "Generate keys"
   → Populates VAPID Public Key + Private Key. Save to apply.

2. Add to your frontend HTML <head>:
   <link rel="manifest" href="/manifest.json">
   <meta name="theme-color" content="#000000">

3. Register the service worker (runs on page load):
   if ('serviceWorker' in navigator) {
     await navigator.serviceWorker.register('/sw.js');
   }

4. Subscribe a user to push (after they grant permission):
   const reg = await navigator.serviceWorker.ready;
   const { key } = await fetch('/push/vapid-public-key').then(r => r.json());
   const sub = await reg.pushManager.subscribe({
     userVisibleOnly: true,
     applicationServerKey: key,
   });
   await fetch('/push/subscribe', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(sub),
     credentials: 'include',
   });

5. Send a push from your backend:
   import { sendPush } from '@/lib/push';
   await sendPush({ userId, title: 'Hello', body: 'World', url: '/dashboard' });

If VAPID keys are set → uses native Web Push via stored subscriptions.
If not → falls back to PUSH_SERVICE_URL external service.
Expired subscriptions (HTTP 410) are auto-deleted on next send.

PWA manifest is at /manifest.json — edit public/manifest.json to set app name, icons, and theme colour.
Icons: add public/icons/icon-192.png and public/icons/icon-512.png.`,
  },
  {
    title: "Security — API Keys & Rate Limiting",
    body: `API Keys (gbk_ prefix):
  Programmatic access without a session. Stored as SHA-256 hash — raw key shown once on creation.

  Create a key:
    Admin → Security → API Keys → Create key
    Set name, scopes (comma-separated or * for all), and optional expiry.

  Use in requests:
    Authorization: Bearer gbk_<raw_key>

  Scopes:
    The requireScope("read") middleware checks the key's scopes list.
    Session auth always bypasses scope checks — scopes only apply to API keys.

  Revoke via Admin panel or:
    DELETE /admin/api/apikeys/:id  (admin session required)

Rate Limiting (hono-rate-limiter, keyed by x-forwarded-for):
  Auth endpoints:
    POST /auth/sign-in/*     — 20 req / 15 min per IP
    POST /auth/sign-up/*     — 10 req / 15 min per IP
    POST /auth/request-password-reset — 5 req / hour per IP
    POST /auth/sign-in/magic-link     — 5 req / hour per IP
  General API:
    all other routes         — 300 req / min per IP

  To adjust limits: edit src/index.ts (rateLimiter calls near the top).
  Behind a proxy: ensure x-forwarded-for is set correctly by your reverse proxy.

Security Headers (auto-applied):
  Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff,
  Referrer-Policy: strict-origin-when-cross-origin, HSTS: 2 years.`,
  },
  {
    title: "Deployment checklist",
    body: `Before going live:
□ Services tabs show no "unset" badges for required fields
□ BETTER_AUTH_SECRET: random 32+ char string  →  openssl rand -base64 32
□ APP_URL + BETTER_AUTH_URL: production domain with https://
□ Email domain verified in Resend dashboard
□ Stripe webhook registered for production endpoint
□ Database migrated: bun run db:migrate
□ ADMIN_EMAIL + ADMIN_PASSWORD set before first boot
□ Push: VAPID keys generated and saved (System → Push / PWA)
□ PWA: icons added to public/icons/ and manifest.json updated
□ Check server logs on startup — ⚠ warnings mean chains still on public RPC fallback`,
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div style={T.title}>FAQ & Setup Guide</div>
      <div style={{ fontSize: 13, color: C.faint, marginBottom: 24, lineHeight: 1.6 }}>
        Instructions for connecting each service in this boilerplate.
      </div>
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
          <div
            onClick={() => setOpen(open === i ? null : i)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", cursor: "pointer", userSelect: "none" as const }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.title}</span>
            <span style={{ color: C.muted, fontSize: 16, lineHeight: 1 }}>{open === i ? "−" : "+"}</span>
          </div>
          {open === i && (
            <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${C.border}` }}>
              <pre style={{ margin: "16px 0 0", fontSize: 12.5, color: C.faint, lineHeight: 1.75, whiteSpace: "pre-wrap" as const, fontFamily: "inherit" }}>{item.body}</pre>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// ─── Sidebar ─────────────────────────────────────────────
type Page = "dashboard" | "users" | "sessions" | "wallets" | "svc:auth" | "svc:email" | "svc:stripe" | "svc:crypto" | "svc:database" | "svc:storage" | "svc:agent" | "mcp" | "cron" | "push" | "logs" | "apikeys" | "faq";

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
    { id: "svc:storage",  label: "Storage" },
  ]},
  { section: "AI", items: [
    { id: "svc:agent", label: "Agent Keys" },
    { id: "mcp",       label: "MCP Servers" },
  ]},
  { section: "Security", items: [
    { id: "apikeys", label: "API Keys" },
  ]},
  { section: "System", items: [
    { id: "cron", label: "Cron Jobs" },
    { id: "push", label: "Push / PWA" },
    { id: "logs", label: "Logs" },
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

        <div style={{ padding: "8px 8px 4px", borderTop: `1px solid ${C.border}` }}>
          <NavItem id="faq" label="FAQ & Setup" active={page === "faq"} onClick={() => setPage("faq")} />
        </div>
        <div style={{ padding: "8px 16px 16px" }}>
          <a href="/auth/sign-out" style={{ fontSize: 12, color: C.muted, textDecoration: "none" }}>← Sign out</a>
        </div>
      </nav>

      <main style={T.main}>
        {page === "dashboard" && <Dashboard />}
        {page === "users"     && <Users toast={showToast} />}
        {page === "sessions"  && <Sessions toast={showToast} />}
        {page === "wallets"   && <Wallets />}
        {page === "mcp"       && <McpPage toast={showToast} />}
        {page === "cron"      && <CronPage toast={showToast} />}
        {page === "push"      && <PushPage toast={showToast} />}
        {page === "logs"      && <LogViewer toast={showToast} />}
        {page === "apikeys"   && <ApiKeysPage toast={showToast} />}
        {page === "faq"       && <FAQ />}
        {svcId && <ServicePage svcId={svcId} toast={showToast} />}
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
