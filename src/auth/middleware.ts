import type { Context, Next } from "hono";
import { verify } from "hono/jwt";
import { auth } from "@/auth/auth";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── Require any authenticated session ──────────────────
// Accepts: Better Auth cookie session OR wallet JWT Bearer token
export async function requireAuth(c: Context, next: Next) {
  // 1. Try Better Auth cookie session
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) {
    c.set("session", session.session);
    c.set("user", session.user);
    return next();
  }

  // 2. Fall back to wallet JWT Bearer token
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
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

// ─── Require ERC20/721 token ownership (set by token-gate middleware) ────
export async function requireToken(c: Context, next: Next) {
  const hasToken = c.get("hasToken");
  if (!hasToken) return c.json({ error: "Token ownership required" }, 403);
  await next();
}
