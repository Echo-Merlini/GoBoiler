# GoBoiler

TypeScript backend boilerplate. Production-ready starting point for SaaS and Web3 apps.

**Stack:** Bun · Hono · Better Auth · Drizzle ORM · Supabase Postgres · Resend · Stripe · viem · SIWE

---

## Features

| Area | What's included |
|---|---|
| **Auth** | Email/password + email verification, Google OAuth, Magic links, 2FA (TOTP), Organizations/teams |
| **Wallet auth** | SIWE (Sign-In With Ethereum) — wallet-only login issues a JWT Bearer token |
| **Wallet linking** | Link a wallet to an existing email/OAuth account (`POST /auth/siwe/link`) |
| **Billing** | Stripe checkout, customer portal, webhook handler, plan guard middleware |
| **Email** | Resend + React Email — welcome/verify, reset-password, magic-link, invoice templates |
| **Crypto utils** | Multi-chain viem client, ERC20/ERC721 token gating, ENS resolution |
| **Push** | Push notification service wrapper |
| **Middleware** | `requireAuth` (cookie + Bearer), `requireWallet`, `requirePlan`, `requireToken` |
| **Profile** | `GET/PATCH /me`, `DELETE /me/wallet/:address` |

---

## Quick Start

### 1. Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- Supabase project (or any Postgres DB)

### 2. Clone & install

```bash
git clone https://github.com/Echo-Merlini/GoBoiler.git
cd GoBoiler
bun install
```

### 3. Environment variables

Copy and fill in:

```bash
cp .env.example .env
```

```env
# App
PORT=3000
APP_URL=http://localhost:3000

# Database (Supabase Postgres or any Postgres)
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# Better Auth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=your-secret-32-chars-min

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Resend (email)
RESEND_API_KEY=re_xxx
RESEND_FROM=hello@yourdomain.com

# Stripe (billing)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRO_PRICE_ID=price_xxx
STRIPE_ENTERPRISE_PRICE_ID=price_xxx
```

### 4. Run migrations

```bash
bun run db:generate   # generate SQL from schema
bun run db:migrate    # apply to database
```

### 5. Start dev server

```bash
bun run dev
```

Server starts at `http://localhost:3000`.

---

## API Reference

### Health

```
GET /health
```

### Auth (Better Auth)

Better Auth handles all standard auth routes automatically under `/auth/*`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/sign-up/email` | Register with email + password |
| `POST` | `/auth/sign-in/email` | Login with email + password |
| `POST` | `/auth/sign-out` | Sign out |
| `POST` | `/auth/forget-password` | Send reset-password email |
| `POST` | `/auth/reset-password` | Reset password with token |
| `POST` | `/auth/magic-link/send` | Send magic link email |
| `GET` | `/auth/callback/google` | Google OAuth callback |

### SIWE — Wallet Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/siwe/nonce` | — | Get a fresh nonce to sign |
| `POST` | `/auth/siwe/verify` | — | Verify signature → returns `{ token, user }` |
| `POST` | `/auth/siwe/link` | Required | Link wallet to current session |

**SIWE flow:**
1. `GET /auth/siwe/nonce` → get `nonce`
2. Build a [SIWE message](https://eips.ethereum.org/EIPS/eip-4361) with the nonce, sign with wallet
3. `POST /auth/siwe/verify` with `{ message, signature }` → receive a JWT Bearer token
4. Use `Authorization: Bearer <token>` on protected routes

### Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/me` | Required | Get current user + linked wallets |
| `PATCH` | `/me` | Required | Update name / image |
| `DELETE` | `/me/wallet/:address` | Required | Unlink a wallet |

### Billing (Stripe)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/billing/checkout` | Required | Create Stripe checkout session |
| `POST` | `/billing/portal` | Required | Open Stripe customer portal |
| `POST` | `/billing/webhook` | — | Stripe webhook handler |

### Push Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/push/subscribe` | Required | Register a push subscription |
| `POST` | `/push/send` | Required | Send a push notification |

---

## Auth Middleware

Import and apply to any route:

```typescript
import { requireAuth, requireWallet, requirePlan, requireToken } from "@/auth/middleware";

// Any authenticated user (cookie session OR wallet JWT)
app.get("/protected", requireAuth, handler);

// Must have a linked wallet
app.get("/wallet-only", requireAuth, requireWallet, handler);

// Must be on 'pro' plan or higher
app.get("/pro-feature", requireAuth, requirePlan("pro"), handler);

// Must hold the required token (set upstream by token-gate middleware)
app.get("/token-gated", requireAuth, requireToken, handler);
```

---

## Crypto Utilities

```typescript
import { getViemClient } from "@/crypto/viem";
import { resolveENS } from "@/crypto/ens";
import { checkERC20Balance, checkERC721Ownership } from "@/crypto/token-gate";

// Multi-chain viem client
const client = getViemClient(1); // mainnet

// ENS resolution
const address = await resolveENS("vitalik.eth");

// Token gating
const balance = await checkERC20Balance({ address, tokenAddress, chainId: 1 });
const owns = await checkERC721Ownership({ address, tokenAddress, tokenId, chainId: 1 });
```

---

## Plans & Billing Flow

Users have a `plan` field: `free` | `pro` | `enterprise`.

1. Frontend calls `POST /billing/checkout` → redirects to Stripe
2. Stripe calls `POST /billing/webhook` on payment → updates `user.plan` in DB
3. `requirePlan("pro")` blocks users below the required tier

---

## Database

Schema is in `src/db/schema.ts`. Tables:

- `user` — core user + wallet address + Stripe customer ID + plan
- `session`, `account`, `verification` — Better Auth internals
- `siwe_nonce` — SIWE nonce store (auto-expired)
- `wallet` — linked wallets (one user → many wallets, one primary)
- `organization`, `member`, `invitation` — Better Auth organizations plugin
- `two_factor` — Better Auth 2FA plugin

```bash
bun run db:studio   # open Drizzle Studio to inspect data
```

---

## Project Structure

```
src/
├── auth/
│   ├── auth.ts          # Better Auth config (plugins, email hooks)
│   ├── middleware.ts    # requireAuth / requireWallet / requirePlan / requireToken
│   └── siwe.ts          # nonce generation, signature verification, wallet CRUD
├── crypto/
│   ├── viem.ts          # multi-chain viem clients
│   ├── ens.ts           # ENS resolution
│   └── token-gate.ts    # ERC20/ERC721 balance checks
├── db/
│   ├── client.ts        # Drizzle + Postgres connection
│   ├── migrate.ts       # migration runner
│   └── schema.ts        # all table definitions
├── emails/
│   ├── resend.ts        # send helpers
│   └── templates/       # React Email components (welcome, reset, magic-link, invoice)
├── lib/
│   ├── stripe.ts        # Stripe client + helpers
│   ├── push.ts          # push notification wrapper
│   └── utils.ts         # shared utils
├── routes/
│   ├── auth.ts          # Better Auth handler mount
│   ├── siwe.ts          # SIWE routes
│   ├── billing.ts       # Stripe routes
│   ├── me.ts            # profile routes
│   ├── push.ts          # push routes
│   └── index.ts         # route registry
└── index.ts             # app entry point
```

---

## License

MIT
