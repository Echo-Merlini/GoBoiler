# GoBoiler Changelog

## [Unreleased]

### Added
- Project scaffolding: Bun + TypeScript + Hono
- Drizzle ORM + Supabase Postgres setup
- Better Auth: email/password, Google OAuth, magic links, organizations, 2FA
- SIWE wallet authentication via viem — JWT-based sessions (Bearer token)
- `POST /auth/siwe/link` — link wallet to existing Better Auth session
- Resend + React Email templates (welcome+verify, reset-password, magic-link, invoice)
- Welcome email with verify URL wired into Better Auth `sendVerificationEmail` hook
- Reset password email wired into Better Auth `sendResetPassword` hook
- Stripe billing: checkout, customer portal, webhook handler, plan guard middleware
- Crypto utilities: multi-chain viem client, ERC20/721 token gating, ENS resolution
- Push notification service wrapper
- Auth middleware: `requireAuth` (cookie + Bearer JWT), `requireWallet`, `requirePlan`, `requireToken`
- `GET/PATCH /me` — user profile endpoint
- `DELETE /me/wallet/:address` — unlink a wallet
- `twoFactor` DB schema table added
