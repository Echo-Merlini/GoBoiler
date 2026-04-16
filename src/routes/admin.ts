import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { requireAdmin } from "@/auth/middleware";
import { db } from "@/db/client";
import { user, session, wallet } from "@/db/schema";
import { eq, count, desc } from "drizzle-orm";

export const adminRoutes = new Hono();

// ─── Static SPA ─────────────────────────────────────────
adminRoutes.use("/assets/*", serveStatic({ root: "./public" }));
adminRoutes.get("/", serveStatic({ path: "./public/admin/index.html" }));
adminRoutes.get("/*", serveStatic({ path: "./public/admin/index.html" }));

// ─── API: Stats ──────────────────────────────────────────
adminRoutes.get("/api/stats", requireAdmin, async (c) => {
  const [[{ total: totalUsers }], [{ total: totalSessions }], [{ total: totalWallets }]] =
    await Promise.all([
      db.select({ total: count() }).from(user),
      db.select({ total: count() }).from(session),
      db.select({ total: count() }).from(wallet),
    ]);

  const planCounts = await db
    .select({ plan: user.plan, total: count() })
    .from(user)
    .groupBy(user.plan);

  return c.json({ totalUsers, totalSessions, totalWallets, planCounts });
});

// ─── API: Users ──────────────────────────────────────────
adminRoutes.get("/api/users", requireAdmin, async (c) => {
  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      isAdmin: user.isAdmin,
      walletAddress: user.walletAddress,
      stripeCustomerId: user.stripeCustomerId,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));

  return c.json(users);
});

adminRoutes.patch("/api/users/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ plan?: string; isAdmin?: boolean }>();

  const allowed: Record<string, unknown> = {};
  if (body.plan !== undefined) allowed.plan = body.plan;
  if (body.isAdmin !== undefined) allowed.isAdmin = body.isAdmin;

  if (Object.keys(allowed).length === 0) return c.json({ error: "Nothing to update" }, 400);

  await db.update(user).set(allowed).where(eq(user.id, id));
  return c.json({ ok: true });
});

adminRoutes.delete("/api/users/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const me = c.get("user") as { id: string };
  if (me.id === id) return c.json({ error: "Cannot delete yourself" }, 400);
  await db.delete(user).where(eq(user.id, id));
  return c.json({ ok: true });
});

// ─── API: Sessions ───────────────────────────────────────
adminRoutes.get("/api/sessions", requireAdmin, async (c) => {
  const sessions = await db
    .select({
      id: session.id,
      userId: session.userId,
      userEmail: user.email,
      userName: user.name,
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .orderBy(desc(session.createdAt));

  return c.json(sessions);
});

adminRoutes.delete("/api/sessions/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  await db.delete(session).where(eq(session.id, id));
  return c.json({ ok: true });
});

// ─── API: Wallets ────────────────────────────────────────
adminRoutes.get("/api/wallets", requireAdmin, async (c) => {
  const wallets = await db
    .select({
      id: wallet.id,
      address: wallet.address,
      chainId: wallet.chainId,
      isPrimary: wallet.isPrimary,
      userId: wallet.userId,
      userEmail: user.email,
      userName: user.name,
      createdAt: wallet.createdAt,
    })
    .from(wallet)
    .innerJoin(user, eq(wallet.userId, user.id))
    .orderBy(desc(wallet.createdAt));

  return c.json(wallets);
});
