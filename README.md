# GoBoiler

Production-ready TypeScript backend boilerplate for SaaS and Web3 apps. Ships with auth, billing, wallet login, AI integration, push notifications, file storage, cron jobs, SSE live logs, security hardening, and a full-featured admin panel — all wired together and ready to extend.

**Stack:** Bun · Hono · Better Auth · Drizzle ORM · PostgreSQL · Resend · Stripe · viem · SIWE · React (admin SPA)

---

## Feature Matrix

| Area | Details |
|---|---|
| **Auth** | Email/password + verification, Google OAuth, Magic links, 2FA (TOTP), Organisations/teams, Bearer token via plugin |
| **Wallet auth** | SIWE (Sign-In With Ethereum) — wallet-only login issues a signed JWT |
| **Wallet linking** | Link a wallet to an existing email/OAuth account |
| **API Keys** | `gbk_`-prefixed, SHA-256 hashed, scoped, per-key expiry, never stored raw |
| **Billing** | Stripe Checkout, Customer Portal, webhook handler, plan-guard middleware |
| **Email** | Resend + React Email — welcome/verify, reset-password, magic-link, invoice |
| **Push / PWA** | VAPID native Web Push + external service fallback, service worker, manifest |
| **Storage** | S3-compatible (AWS, R2, MinIO) — multipart upload + presigned URL |
| **Crypto** | Multi-chain viem with RPC fallbacks, ERC20/721 token gating, ENS resolution |
| **AI Agent** | Anthropic / OpenAI / Groq / Mistral keys managed via admin panel |
| **AI Skills** | Configurable AI skill definitions (provider, model, system prompt, tools) with chat endpoint and per-session conversation history |
| **MCP Servers** | Model Context Protocol server registry (SSE, HTTP, stdio) in DB |
| **Outgoing Webhooks** | HMAC-SHA256-signed HTTP callbacks to external URLs; per-event filtering, retry via job queue |
| **Feature Flags** | Boolean flags with plan-based and per-user-ID rules; 1-min in-memory cache; middleware helper |
| **In-App Notifications** | Per-user notification inbox (DB-persisted) with live SSE delivery stream |
| **Audit Log** | Fire-and-forget DB log of every admin action with before/after diffs |
| **Job Queue** | In-process DB-backed queue with exponential backoff retry (no Redis required) |
| **Cron Jobs** | node-cron scheduler, HTTP-triggered jobs, start/stop/run-now, persistent in DB |
| **SSE** | Live log streaming + per-user notification stream via Server-Sent Events |
| **Security** | Rate limiting per-route, CSP/HSTS/X-Frame security headers, scope middleware |
| **Logging** | Structured logger → DB + SSE broadcast; log viewer with live filter |
| **Admin Panel** | React SPA at `/admin` — collapsible sidebar: General, Services, AI, Security, System sections |
| **Middleware** | `requireAuth`, `requireAdmin`, `requireWallet`, `requirePlan`, `requireScope`, `requireToken`, `requireFlag` |

---

## Architecture

```mermaid
graph TB
    subgraph Client["Client (Browser / Mobile / CLI)"]
        FE["Frontend App"]
        Admin["Admin SPA /admin"]
        SW["Service Worker (PWA)"]
    end

    subgraph Hono["Hono Server (Bun)"]
        direction TB
        MW["Middleware Stack\n(security headers · CORS · rate limiter · logger)"]

        subgraph Routes
            AUTH["/auth/*\nBetter Auth"]
            SIWE["/auth/siwe/*\nWallet Login"]
            ME["/me\nProfile"]
            BILL["/billing/*\nStripe"]
            PUSH["/push/*\nWeb Push"]
            UPLOAD["/upload/*\nS3 / R2"]
            AGENT["/agent/*\nAI Skills"]
            NOTIF["/notifications/*\nIn-App Notifications"]
            ADMIN["/admin/*\nAdmin API"]
        end

        subgraph AuthMW["Auth Middleware"]
            RA["requireAuth\n(cookie · Bearer · gbk_ API key · wallet JWT)"]
            RS["requireScope"]
            RP["requirePlan"]
            RADM["requireAdmin"]
        end
    end

    subgraph Data["Data Layer"]
        DB[("PostgreSQL\nDrizzle ORM")]
        S3[("S3 / R2 / MinIO\nFile Storage")]
    end

    subgraph External["External Services"]
        BA["Better Auth\n(session store)"]
        RESEND["Resend\n(email)"]
        STRIPE["Stripe\n(billing)"]
        VAPID["Web Push\n(VAPID)"]
        RPC["EVM RPCs\n(Alchemy / public fallback)"]
        AI["AI Providers\n(Anthropic · OpenAI · Groq · Mistral)"]
        MCP["MCP Servers\n(SSE / HTTP / stdio)"]
    end

    subgraph Scheduler["In-Process Scheduler"]
        CRON["node-cron\nHTTP-triggered jobs"]
        QUEUE["Job Queue\n(5s polling, exponential backoff)"]
    end

    subgraph Realtime["Realtime (SSE)"]
        SSE["Log stream\n/admin/api/logs/stream"]
        NSSE["Notification stream\n/notifications/stream"]
        LOGGER["Structured Logger\n(DB + SSE broadcast)"]
    end

    FE -->|REST / JSON| MW
    Admin -->|REST / JSON| MW
    SW -->|Push events| VAPID

    MW --> Routes
    Routes --> AuthMW
    Routes --> DB
    Routes --> S3
    Routes --> BA
    Routes --> RESEND
    Routes --> STRIPE
    Routes --> VAPID
    Routes --> RPC
    CRON -->|HTTP calls| Routes
    QUEUE -->|workers| Routes
    LOGGER --> DB
    LOGGER --> SSE
    SSE -->|EventSource| Admin
    NSSE -->|EventSource| FE
    AI -->|API calls| AGENT
    MCP -->|configured| ADMIN
```

---

## Request Auth Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant M as requireAuth Middleware
    participant BA as Better Auth
    participant DB as Database

    C->>M: Request (cookie / Bearer token / gbk_ key)

    alt Has session cookie or Bearer session token
        M->>BA: getSession(headers)
        BA-->>M: session + user
        M->>C: continue (user in context)
    else Bearer starts with gbk_
        M->>DB: SELECT apiKey WHERE keyHash = sha256(token)
        DB-->>M: key row
        M->>DB: SELECT user WHERE id = key.userId
        DB-->>M: user
        M->>DB: UPDATE lastUsedAt (async, non-blocking)
        M->>C: continue (user + apiKey in context)
    else Bearer is a wallet JWT
        M->>M: verify(token, BETTER_AUTH_SECRET)
        M->>DB: SELECT user WHERE id = payload.sub
        DB-->>M: user
        M->>C: continue (user in context)
    else None
        M->>C: 401 Unauthorized
    end
```

---

## SIWE Wallet Login Flow

```mermaid
sequenceDiagram
    participant W as Wallet (browser)
    participant API as GoBoiler API
    participant DB as Database

    W->>API: GET /auth/siwe/nonce
    API->>DB: INSERT siwe_nonce (TTL 5 min)
    API-->>W: { nonce }

    W->>W: Build SiweMessage (domain, address, nonce, chainId)
    W->>W: eth_sign / personal_sign → signature

    W->>API: POST /auth/siwe/verify { message, signature }
    API->>API: Parse + verify signature
    API->>DB: DELETE nonce (single-use)
    API->>DB: Upsert user + wallet record
    API-->>W: { token (JWT), user }

    Note over W,API: Subsequent requests use Authorization: Bearer token
```

---

## Sign-Up + Email Verification Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as GoBoiler API
    participant Resend
    participant DB as Database

    U->>API: POST /auth/sign-up/email { email, password, name }
    API->>DB: INSERT user (emailVerified: false)
    API->>Resend: sendVerificationEmail (link with token)
    API-->>U: { token, user }

    U->>API: GET /auth/verify-email?token=...
    API->>DB: UPDATE user SET emailVerified = true
    API-->>U: 302 redirect to callbackURL

    U->>API: POST /auth/sign-in/email { email, password }
    API-->>U: { token, user }
```

---

## Stripe Billing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant API as GoBoiler API
    participant Stripe

    U->>API: POST /billing/checkout (session required)
    API->>Stripe: createCheckoutSession(customerId, priceId)
    Stripe-->>API: { url }
    API-->>U: { url }
    U->>Stripe: redirect and complete payment

    Stripe->>API: POST /billing/webhook (invoice.payment_succeeded)
    API->>API: verifyWebhookSignature
    API->>DB: UPDATE user SET plan = 'pro'
```

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- PostgreSQL (Supabase, Neon, Railway, or local)

### Install

```bash
git clone https://github.com/Echo-Merlini/GoBoiler.git
cd GoBoiler
bun install
```

### Environment

```bash
cp .env.example .env
```

Minimum required variables:

```env
# App
PORT=3000
APP_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=                  # openssl rand -base64 32

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=changeme

# Email (Resend)
RESEND_API_KEY=re_xxx
RESEND_FROM=hello@yourdomain.com
```

All other variables (Google OAuth, Stripe, S3, VAPID, AI keys) can be configured later via the admin panel at `/admin`.

### Migrate & start

```bash
bun run db:migrate   # apply migrations
bun run dev          # start with --watch
```

Admin panel at `http://localhost:3000/admin` — sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## API Reference

### Health

```
GET /health  →  { status: "ok", ts: 1234567890 }
```

### Auth — Better Auth routes

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/sign-up/email` | Register `{ email, password, name }` |
| `POST` | `/auth/sign-in/email` | Login `{ email, password }` |
| `GET` | `/auth/sign-in/social?provider=google&callbackURL=/` | Google OAuth redirect |
| `POST` | `/auth/sign-out` | Invalidate session |
| `POST` | `/auth/request-password-reset` | Send reset email `{ email, redirectTo }` |
| `POST` | `/auth/reset-password` | Set new password `{ token, newPassword }` |
| `POST` | `/auth/sign-in/magic-link` | Send magic link `{ email, callbackURL }` |
| `GET` | `/auth/verify-email?token=...` | Verify email address |

### Auth — SIWE (Wallet)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/siwe/nonce` | — | Fresh nonce (5 min TTL) |
| `POST` | `/auth/siwe/verify` | — | `{ message, signature }` → `{ token, user }` |
| `POST` | `/auth/siwe/link` | Session | Link wallet to current account |

### Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/me` | Required | Current user + linked wallets |
| `PATCH` | `/me` | Required | Update `{ name?, image? }` |
| `DELETE` | `/me/wallet/:address` | Required | Unlink a wallet |

### Billing

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/billing/checkout` | Required | Create checkout → `{ url }` |
| `POST` | `/billing/portal` | Required | Customer portal → `{ url }` |
| `POST` | `/billing/webhook` | — | Stripe webhook (updates user plan) |

### Push Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/push/vapid-public-key` | — | VAPID public key for client subscription |
| `POST` | `/push/subscribe` | Required | Register push subscription |
| `DELETE` | `/push/subscribe` | Required | Remove push subscription |
| `POST` | `/push/send` | Required | Send push `{ userId?, title, body, url? }` |

### File Upload

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/upload` | Required | Multipart upload ≤ 10 MB → `{ key, url }` |
| `POST` | `/upload/presign` | Required | `{ filename, contentType }` → `{ url, publicUrl }` |

### Admin API (admin session required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/api/stats` | Dashboard counts |
| `GET` | `/admin/api/users` | All users |
| `PATCH` | `/admin/api/users/:id` | Update plan / isAdmin |
| `DELETE` | `/admin/api/users/:id` | Delete user |
| `GET` | `/admin/api/sessions` | Active sessions |
| `DELETE` | `/admin/api/sessions/:id` | Revoke session |
| `GET` | `/admin/api/wallets` | All linked wallets |
| `GET` | `/admin/api/services` | Service config (env + DB merged) |
| `PATCH` | `/admin/api/services` | Write config key/value to DB |
| `POST` | `/admin/api/services/test/:key` | Test a service connection |
| `GET` | `/admin/api/apikeys` | List API keys (no raw values) |
| `POST` | `/admin/api/apikeys` | Create key `{ name, scopes?, expiresAt? }` → `{ key }` shown once |
| `DELETE` | `/admin/api/apikeys/:id` | Revoke key |
| `GET` | `/admin/api/logs` | Query logs `?level=&search=&limit=` |
| `DELETE` | `/admin/api/logs` | Clear all logs |
| `GET` | `/admin/api/logs/stream` | SSE live log stream (EventSource) |
| `GET` | `/admin/api/cron` | List cron jobs |
| `POST` | `/admin/api/cron` | Create job |
| `PATCH` | `/admin/api/cron/:id` | Update job |
| `DELETE` | `/admin/api/cron/:id` | Delete job |
| `POST` | `/admin/api/cron/:id/start` | Activate job |
| `POST` | `/admin/api/cron/:id/stop` | Deactivate job |
| `POST` | `/admin/api/cron/:id/run` | Run job immediately |
| `GET` | `/admin/api/mcp/servers` | List MCP servers |
| `PUT` | `/admin/api/mcp/servers` | Save MCP server list |
| `GET` | `/admin/api/push/generate-vapid` | Generate VAPID key pair |
| `GET` | `/admin/api/push/subscriptions` | List push subscriptions |
| `GET` | `/admin/api/skills` | List AI skills |
| `POST` | `/admin/api/skills` | Create skill `{ name, systemPrompt, provider, model, ... }` |
| `PATCH` | `/admin/api/skills/:id` | Update skill |
| `DELETE` | `/admin/api/skills/:id` | Delete skill |
| `GET` | `/admin/api/webhooks` | List webhook endpoints |
| `POST` | `/admin/api/webhooks` | Create endpoint `{ name, url, events, enabled }` → `{ secret }` shown once |
| `PATCH` | `/admin/api/webhooks/:id` | Update endpoint |
| `DELETE` | `/admin/api/webhooks/:id` | Delete endpoint |
| `GET` | `/admin/api/webhooks/:id/deliveries` | Delivery log for an endpoint |
| `GET` | `/admin/api/flags` | List feature flags |
| `POST` | `/admin/api/flags` | Create flag `{ key, description, enabled, planRules?, userIds? }` |
| `PATCH` | `/admin/api/flags/:id` | Update flag (invalidates cache) |
| `DELETE` | `/admin/api/flags/:id` | Delete flag |
| `GET` | `/admin/api/notifications` | List all notifications (admin view) |
| `POST` | `/admin/api/notifications/send` | Send notification to a user or broadcast |
| `DELETE` | `/admin/api/notifications/:id` | Delete a notification |
| `GET` | `/admin/api/audit` | Query audit log `?action=&resource=&limit=` |
| `GET` | `/admin/api/jobs` | List jobs `?status=&type=&limit=` |
| `POST` | `/admin/api/jobs/:id/retry` | Re-enqueue a failed job |
| `DELETE` | `/admin/api/jobs/:id` | Delete job record |

---

## Middleware

Import from `@/auth/middleware`:

```typescript
import {
  requireAuth,
  requireAdmin,
  requireWallet,
  requirePlan,
  requireScope,
  requireToken,
} from "@/auth/middleware";
import { requireFlag } from "@/lib/flags";

// Any authenticated user (cookie session · Bearer session · gbk_ API key · wallet JWT)
app.get("/protected", requireAuth, handler);

// Admin only (isAdmin flag or ADMIN_EMAIL match)
app.get("/ops", requireAdmin, handler);

// Must have a linked wallet address
app.get("/wallet-only", requireAuth, requireWallet, handler);

// Must be on 'pro' plan or higher (free < pro < enterprise)
app.get("/pro-feature", requireAuth, requirePlan("pro"), handler);

// API key must have the 'reports' scope (session auth bypasses scope check)
app.get("/reports", requireAuth, requireScope("reports"), handler);

// Must hold required ERC20/721 token (set upstream by token-gate middleware)
app.get("/token-gated", requireAuth, requireToken, handler);

// Feature flag must be enabled for this user (plan-based or per-user-ID rules)
app.get("/beta-feature", requireAuth, requireFlag("beta_feature"), handler);
```

### Context values available after `requireAuth`

| Key | Type | Present when |
|---|---|---|
| `user` | `User` | All auth paths |
| `session` | `Session` | Cookie or Bearer session auth |
| `apiKey` | `ApiKey` | `gbk_` API key auth |

---

## Security

### Rate limiting (hono-rate-limiter, keyed by `x-forwarded-for`)

| Route pattern | Window | Limit |
|---|---|---|
| `POST /auth/sign-in/*` | 15 min | 20 req/IP |
| `POST /auth/sign-up/*` | 15 min | 10 req/IP |
| `POST /auth/request-password-reset` | 60 min | 5 req/IP |
| `POST /auth/sign-in/magic-link` | 60 min | 5 req/IP |
| All other routes | 1 min | 300 req/IP |

### Security headers (applied to every response)

| Header | Value |
|---|---|
| `Content-Security-Policy` | default-src 'self'; frame-src 'none'; img-src 'self' data: https: |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |

### API Keys

- Prefix `gbk_` + 64 hex chars — identifiable in logs and leak scanners
- Only the SHA-256 hash is stored; raw key is returned once on creation
- Each key carries a `scopes` string (comma-separated or `*` for all)
- `requireScope("scope")` rejects under-scoped API keys; session auth always passes
- `lastUsedAt` is updated asynchronously — never blocks the request path
- Keys can have an `expiresAt` date; expired keys are rejected at verify time

---

## Crypto & Multi-chain RPC

`getViemClient(chainId)` returns a viem `PublicClient`. If no RPC URL env var is set for a chain, it falls back to a public endpoint and logs a startup warning.

| Env var | Chain | Public fallback |
|---|---|---|
| `ETH_RPC_URL` | Ethereum (1) | `cloudflare-eth.com` |
| `BASE_RPC_URL` | Base (8453) | `mainnet.base.org` |
| `POLYGON_RPC_URL` | Polygon (137) | `polygon-rpc.com` |
| `OPTIMISM_RPC_URL` | Optimism (10) | `mainnet.optimism.io` |
| `ARBITRUM_RPC_URL` | Arbitrum One (42161) | `arb1.arbitrum.io/rpc` |

---

## AI Integration

Provider keys are stored in the admin panel under **AI → Agent Keys** and written to the `service_config` DB table. They are never exposed to the frontend. Read them in your handlers:

```typescript
import { db } from "@/db/client";
import { serviceConfig } from "@/db/schema";
import { eq } from "drizzle-orm";

const [row] = await db.select().from(serviceConfig).where(eq(serviceConfig.key, "anthropic_api_key"));
const apiKey = process.env.ANTHROPIC_API_KEY ?? row?.value;
```

### MCP Servers

Register Model Context Protocol servers under **AI → MCP Servers**. Supported transports: SSE, HTTP (Streamable HTTP), stdio. Configs stored in the `mcp_server` DB table — any AI agent can read the registry via `GET /admin/api/mcp/servers`.

### AI Skills

Skills are reusable AI personas defined in the DB (provider, model, system prompt, temperature, max tokens). Use the skill chat endpoint from your frontend:

```typescript
// List enabled skills
GET /agent/skills

// Chat with a skill (persists conversation history per sessionId)
POST /agent/chat  { skillId, message, sessionId }
→ { reply, sessionId }

// Fetch conversation history
GET /agent/history/:sessionId
```

Providers: `anthropic` (native API), `openai` / `groq` (OpenAI-compatible), `mistral`. Keys are read from the `service_config` DB table or env vars.

---

## Outgoing Webhooks

Dispatch signed HTTP callbacks to external URLs whenever events occur in your app:

```typescript
import { dispatch } from "@/lib/webhooks";

// Fire-and-forget — enqueues a delivery job, retried automatically on failure
await dispatch("user.created", { id: user.id, email: user.email });
```

Payloads are HMAC-SHA256 signed. Verify on the receiver:

```typescript
const sig  = request.headers["x-goboiler-signature"]; // "sha256=<hex>"
const body = await request.text();
const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("Bad signature");
```

Endpoints and delivery logs are managed at **Admin → Security → Webhooks**.

---

## Feature Flags

Boolean flags with optional plan or per-user-ID targeting, cached in-memory for 1 minute:

```typescript
import { isEnabled } from "@/lib/flags";

// In a handler — pass the user for per-user/plan evaluation
const enabled = await isEnabled("new_dashboard", user);
if (!enabled) return c.json({ error: "Not available" }, 403);
```

Flags are created and toggled at **Admin → Security → Feature Flags**. Rules:
- **`planRules`** — comma-separated plan names (`free,pro`) that see the flag as enabled
- **`userIds`** — comma-separated user IDs for targeted rollout

---

## In-App Notifications

Send notifications to individual users or broadcast to all. Each notification is persisted in the DB and delivered live via SSE:

```typescript
import { sendNotification, broadcastNotification } from "@/lib/notify";

// Send to one user
await sendNotification({ userId, title: "Your export is ready", body: "Download it here", url: "/exports" });

// Broadcast to all connected users
await broadcastNotification({ title: "Maintenance in 5 min", body: "Save your work" });
```

Frontend subscribes to `GET /notifications/stream` (EventSource). REST endpoints:

```
GET  /notifications            → paginated list (most recent 50)
GET  /notifications/unread-count → { count }
POST /notifications/:id/read   → mark one read
POST /notifications/read-all   → mark all read
```

---

## Audit Log

Every significant admin action is recorded automatically (fire-and-forget — never blocks the request path):

```typescript
import { audit } from "@/lib/audit";

// Inside a route handler:
await audit(c, "user.updated", "user", user.id, before, after);
```

Fields stored: `action`, `resource`, `resourceId`, `before` (JSON), `after` (JSON), `ip`, `userEmail`, `createdAt`. Query at **Admin → System → Audit Log** or via `GET /admin/api/audit`.

---

## Job Queue

In-process DB-backed queue — no Redis or external broker required:

```typescript
import { enqueue, registerWorker } from "@/lib/queue";

// Enqueue a job (runs at next tick, or after runAt delay)
await enqueue("report.generate", { userId, reportId }, { maxAttempts: 5 });

// Register a worker for a job type
registerWorker("report.generate", async (job) => {
  await generateReport(job.payload.reportId);
});
```

Failed jobs are retried with exponential backoff: `5^attempt × 60 s`. The queue polls every 5 seconds. Manage jobs at **Admin → System → Job Queue** (retry / delete individual records).

---

## Push Notifications & PWA

1. Admin → System → Push / PWA → **Generate keys** → VAPID key pair stored in DB
2. Public key exposed at `GET /push/vapid-public-key`
3. Subscribe a user from the browser:

```javascript
const reg = await navigator.serviceWorker.ready;
const { key } = await fetch("/push/vapid-public-key").then(r => r.json());
const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
await fetch("/push/subscribe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(sub),
  credentials: "include",
});
```

4. Send from your backend:

```typescript
import { sendPush } from "@/lib/push";
await sendPush({ userId, title: "Hello", body: "World", url: "/dashboard" });
```

Expired subscriptions (HTTP 410 from push service) are auto-deleted on next send. The service worker at `/sw.js` handles `push` events and `notificationclick`. Edit `public/manifest.json` and add `public/icons/icon-192.png` + `public/icons/icon-512.png` for full PWA support.

---

## Cron Jobs

Cron jobs run in-process via `node-cron` and call HTTP endpoints on a schedule. Jobs are persisted in the `cron_job` table and re-registered on server restart (enabled jobs auto-start).

Create and manage jobs at **Admin → System → Cron Jobs** or via the API. Each job has: name, cron expression, target URL, HTTP method, optional JSON body/headers, and enabled state. **Start / Stop / Run now** controls are available per job. Outcomes are logged to the app log with status and response message.

---

## Storage

```typescript
import { uploadFile, getPresignedUrl } from "@/lib/storage";

// Server-side upload (returns public URL)
const url = await uploadFile("avatars/user-123.jpg", buffer, "image/jpeg");

// Client-side presigned upload
// 1. POST /upload/presign { filename, contentType } → { url, publicUrl }
// 2. Client: PUT <url> with raw file body (direct to S3, no server round-trip)
```

Works with AWS S3, Cloudflare R2, MinIO, Backblaze B2 — configure `S3_ENDPOINT` for non-AWS providers.

---

## Database Schema

| Table | Purpose |
|---|---|
| `user` | Core users — plan, isAdmin, walletAddress, stripeCustomerId |
| `session`, `account`, `verification` | Better Auth internals |
| `siwe_nonce` | Single-use nonces for SIWE (5 min TTL) |
| `wallet` | Many wallets per user, one marked primary |
| `organization`, `member`, `invitation` | Better Auth organisations plugin |
| `two_factor` | Better Auth 2FA plugin |
| `service_config` | Key/value store for admin-managed service credentials |
| `api_key` | API key metadata (hash, prefix, scopes, expiry, lastUsedAt) |
| `app_log` | Structured log entries (level, message, source, meta, createdAt) |
| `push_subscription` | Web Push subscription objects per user |
| `cron_job` | Scheduled job definitions |
| `mcp_server` | MCP server registry |
| `skill` | AI skill definitions (provider, model, system prompt, tools, enabled) |
| `conversation` | Per-session AI chat history (role, content, skillId, sessionId, userId) |
| `webhook_endpoint` | Outgoing webhook registrations (url, secret hash, events filter, enabled) |
| `webhook_delivery` | Delivery attempts with status, response, attempts count |
| `feature_flag` | Feature flag definitions with plan rules and per-user-ID targeting |
| `notification` | Per-user in-app notifications (title, body, url, read, createdAt) |
| `audit_log` | Admin action log (action, resource, before/after JSON, ip, userEmail) |
| `job_queue` | Background job records (type, payload, status, attempts, runAt, error) |

```bash
bun run db:generate   # regenerate SQL from schema changes
bun run db:migrate    # apply pending migrations
bun run db:studio     # open Drizzle Studio in browser
```

---

## Project Structure

```
GoBoiler/
├── admin/
│   └── app.tsx              # Admin SPA (React, single file, built to public/admin/app.js)
├── drizzle/                 # Auto-generated migration SQL files
├── emails/
│   ├── resend.ts            # Send helpers
│   └── templates/           # React Email components (welcome, reset, magic-link, invoice)
├── public/
│   ├── admin/               # Built admin SPA (bun run admin:build)
│   ├── icons/               # PWA icons (icon-192.png, icon-512.png)
│   ├── sw.js                # Service worker
│   └── manifest.json        # PWA manifest
├── src/
│   ├── auth/
│   │   ├── auth.ts          # Better Auth config (plugins, email hooks)
│   │   ├── middleware.ts    # requireAuth / requireAdmin / requireWallet / requirePlan / requireScope / requireToken
│   │   └── siwe.ts          # SIWE nonce + verify + wallet CRUD
│   ├── crypto/
│   │   ├── viem.ts          # Multi-chain viem clients with RPC fallbacks + startup warnings
│   │   ├── ens.ts           # ENS resolution
│   │   └── token-gate.ts    # ERC20 / ERC721 balance + ownership checks
│   ├── db/
│   │   ├── client.ts        # Drizzle + Postgres connection
│   │   ├── migrate.ts       # Migration runner
│   │   └── schema.ts        # All table definitions
│   ├── lib/
│   │   ├── apikeys.ts       # generateKey / createApiKey / verifyApiKey / revokeApiKey
│   │   ├── audit.ts         # Fire-and-forget audit log helper
│   │   ├── cron.ts          # node-cron job manager (register, start, stop, run-now)
│   │   ├── flags.ts         # Feature flags with 1-min in-memory cache + requireFlag middleware
│   │   ├── logger.ts        # Structured logger → DB + SSE broadcast
│   │   ├── notify.ts        # In-app notification sender + per-user SSE client registry
│   │   ├── push.ts          # VAPID Web Push + external service fallback
│   │   ├── queue.ts         # In-process job queue (DB-backed, exponential backoff, no Redis)
│   │   ├── skills.ts        # AI skill executor (multi-provider, conversation history)
│   │   ├── storage.ts       # S3-compatible upload + presigned URL helpers
│   │   ├── stripe.ts        # Stripe client + helpers
│   │   ├── utils.ts         # nanoid, shared utilities
│   │   └── webhooks.ts      # Outgoing webhooks (HMAC-signed, queue-backed delivery)
│   ├── routes/
│   │   ├── index.ts         # Route registry (ordering: siwe before auth)
│   │   ├── admin.ts         # Admin API (stats, users, sessions, wallets, services, keys, logs, cron, MCP, push, skills, webhooks, flags, notifications, audit, jobs)
│   │   ├── agent.ts         # /agent/* — skill list, chat, conversation history
│   │   ├── auth.ts          # Better Auth handler mount
│   │   ├── billing.ts       # Stripe checkout / portal / webhook
│   │   ├── me.ts            # Profile routes
│   │   ├── notifications.ts # /notifications/* — list, unread count, mark read, SSE stream
│   │   ├── push.ts          # Push subscribe / send routes
│   │   └── upload.ts        # Multipart + presigned upload routes
│   └── index.ts             # Entry point — middleware stack, rate limits, seed admin, start server
├── .env.example
├── bunfig.toml
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start with `--watch` (auto-restart on change) |
| `bun run start` | Production start |
| `bun run db:generate` | Generate SQL migrations from schema changes |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:studio` | Open Drizzle Studio in browser |
| `bun run admin:build` | Build admin SPA → `public/admin/app.js` |

---

## Admin Panel

The admin panel is a self-contained React SPA served at `/admin`. It requires an active admin session (cookie-based). Build after any changes to `admin/app.tsx` with `bun run admin:build`.

The sidebar groups pages into collapsible sections. Each section auto-expands when it contains the active page.

| Section | Pages |
|---|---|
| General | Dashboard (stats), Users, Sessions, Wallets |
| Services | Auth (Google OAuth), Email (Resend), Stripe, Crypto (RPC + SIWE), Database, Storage (S3) |
| AI | Agent Keys (Anthropic / OpenAI / Groq / Mistral), MCP Servers, Skills (create + test chat) |
| Security | API Keys (create, list, revoke), Webhooks (endpoints + delivery log), Feature Flags |
| System | Cron Jobs, Job Queue (retry / delete), Push / PWA (VAPID + subscriptions), Logs (live SSE), Notifications (send + history), Audit Log |
| — | FAQ & Setup Guide (all services + flows documented inline) |

Service credentials can be set from the panel (written to `service_config` in DB) or via environment variables. Environment variables take precedence; the source badge shows `env`, `db`, or `unset` for each field.

---

## Deployment Checklist

```
□ BETTER_AUTH_SECRET — random 32+ char string (openssl rand -base64 32)
□ APP_URL + BETTER_AUTH_URL — production domain with https://
□ ADMIN_EMAIL + ADMIN_PASSWORD — set before first boot
□ DATABASE_URL — production Postgres connection, run bun run db:migrate
□ Resend — domain verified, RESEND_FROM matches verified sending domain
□ Stripe — production keys, webhook registered at https://yourdomain.com/billing/webhook
□ Google OAuth — production redirect URI: https://yourdomain.com/auth/callback/google
□ VAPID — generate keys via Admin → System → Push / PWA → Save
□ S3 / R2 — bucket created, CORS policy allows PUT from your domain
□ PWA — public/icons/icon-192.png and icon-512.png added, manifest.json updated
□ Reverse proxy — x-forwarded-for header forwarded correctly for rate limiting to work
□ Startup logs — no ⚠ warnings (means chains using public RPC fallback instead of dedicated keys)
□ Admin panel — all service tabs show no "unset" badges for required fields
□ AI Skills — at least one provider key set (Anthropic / OpenAI / Groq / Mistral) if Skills are enabled
□ Webhooks — endpoint URLs are production URLs; secrets noted before leaving creation screen (shown once)
□ Feature flags — review flag states before go-live; default is disabled
```

---

## License

MIT
