import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { auth } from "@/auth/auth";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyApiKey } from "@/lib/apikeys";

// ─── Require any authenticated session ──────────────────
// Accepts: Better Auth cookie/bearer session, wallet JWT, or API key (gbk_...)
export async function requireAuth(c: Context, next: Next) {
  // 1. Try Better Auth session (cookie or bearer via bearer plugin)
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    c.set("session", session.session);
    c.set("user", session.user);
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // 2. API key (prefixed gbk_)
    if (token.startsWith("gbk_")) {
      const key = await verifyApiKey(token);
      if (!key) return c.json({ error: "Invalid or expired API key" }, 401);
      const [u] = await db.select().from(user).where(eq(user.id, key.userId));
      if (!u) return c.json({ error: "Unauthorized" }, 401);
      c.set("user", u);
      c.set("apiKey", key);
      return next();
    }

    // 3. Wallet JWT
    try {
      const payload = await verify(token, process.env.BETTER_AUTH_SECRET!) as { sub: string };
      const [u] = await db.select().from(user).where(eq(user.id, payload.sub));
      if (!u) return c.json({ error: "Unauthorized" }, 401);
      c.set("user", u);
      return next();
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  }

  return c.json({ error: "Unauthorized" }, 401);
}

// ─── Require a specific API key scope ───────────────────
export function requireScope(scope: string) {
  return async (c: Context, next: Next) => {
    const key = c.get("apiKey") as { scopes: string } | undefined;
    if (!key) return next(); // session auth — skip scope check
    const scopes = key.scopes.split(",").map(s => s.trim());
    if (!scopes.includes("*") && !scopes.includes(scope)) {
      return c.json({ error: `Missing scope: ${scope}` }, 403);
    }
    return next();
  };
}

// ─── Require a linked wallet on the session user ─────────
export async function requireWallet(c: Context, next: Next) {
  const u = c.get("user");
  if (!u) return c.json({ error: "Unauthorized" }, 401);
  if (!u.walletAddress) return c.json({ error: "No wallet linked" }, 403);
  await next();
}

// ─── Require a minimum plan ──────────────────────────────
export function requirePlan(minPlan: "free" | "pro" | "enterprise") {
  const PLAN_RANK: Record<string, number> = { free: 0, pro: 1, enterprise: 2 };
  return async (c: Context, next: Next) => {
    const u = c.get("user");
    if (!u) return c.json({ error: "Unauthorized" }, 401);
    const userPlan = (u as { plan?: string }).plan ?? "free";
    if ((PLAN_RANK[userPlan] ?? 0) < PLAN_RANK[minPlan]) {
      return c.json({ error: "Upgrade required", requiredPlan: minPlan }, 403);
    }
    await next();
  };
}

// ─── Require admin — isAdmin flag OR ADMIN_EMAIL env match ──────────────
export async function requireAdmin(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  const u = session.user as { email: string; isAdmin?: boolean };
  const isAdmin = u.isAdmin || u.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return c.json({ error: "Forbidden" }, 403);
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
}

// ─── Require ERC20/721 token ownership (set by token-gate middleware) ────
export async function requireToken(c: Context, next: Next) {
  const hasToken = c.get("hasToken");
  if (!hasToken) return c.json({ error: "Token ownership required" }, 403);
  await next();
}
