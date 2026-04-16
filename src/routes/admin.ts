import { Hono } from "hono";
import { requireAdmin } from "@/auth/middleware";
import { db } from "@/db/client";
import { user, session, wallet, settings } from "@/db/schema";
import { eq, count, desc } from "drizzle-orm";

export const adminRoutes = new Hono();

// ─── Static SPA — must come AFTER all /api/* routes ─────

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

// ─── API: Services ───────────────────────────────────────

// Keys we manage — maps setting key → env var fallback
const SERVICE_KEYS: Record<string, string> = {
  google_client_id:         "GOOGLE_CLIENT_ID",
  google_client_secret:     "GOOGLE_CLIENT_SECRET",
  resend_api_key:           "RESEND_API_KEY",
  email_from:               "EMAIL_FROM",
  stripe_secret_key:        "STRIPE_SECRET_KEY",
  stripe_webhook_secret:    "STRIPE_WEBHOOK_SECRET",
  stripe_pro_price_id:      "STRIPE_PRO_PRICE_ID",
  stripe_enterprise_price_id: "STRIPE_ENTERPRISE_PRICE_ID",
  eth_rpc_url:              "ETH_RPC_URL",
  base_rpc_url:             "BASE_RPC_URL",
  polygon_rpc_url:          "POLYGON_RPC_URL",
  siwe_domain:              "SIWE_DOMAIN",
  siwe_statement:           "SIWE_STATEMENT",
  database_url:             "DATABASE_URL",
};

const SENSITIVE = new Set([
  "google_client_secret", "resend_api_key", "stripe_secret_key",
  "stripe_webhook_secret", "database_url",
]);

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? process.env[SERVICE_KEYS[key]] ?? null;
}

function mask(val: string | null) {
  if (!val) return null;
  if (val.length <= 8) return "●●●●●●●●";
  return val.slice(0, 4) + "●●●●●●●●" + val.slice(-4);
}

adminRoutes.get("/api/services", requireAdmin, async (c) => {
  const dbRows = await db.select().from(settings);
  const stored = Object.fromEntries(dbRows.map(r => [r.key, r.value]));

  const resolve = (key: string) => stored[key] ?? process.env[SERVICE_KEYS[key]] ?? null;

  const field = (key: string) => {
    const val = resolve(key);
    return {
      set: !!val,
      source: stored[key] ? "db" : val ? "env" : "unset",
      value: SENSITIVE.has(key) ? mask(val) : val,
    };
  };

  return c.json({
    auth: {
      googleClientId:     field("google_client_id"),
      googleClientSecret: field("google_client_secret"),
    },
    email: {
      resendApiKey: field("resend_api_key"),
      emailFrom:    field("email_from"),
    },
    stripe: {
      secretKey:           field("stripe_secret_key"),
      webhookSecret:       field("stripe_webhook_secret"),
      proPriceId:          field("stripe_pro_price_id"),
      enterprisePriceId:   field("stripe_enterprise_price_id"),
    },
    crypto: {
      ethRpcUrl:     field("eth_rpc_url"),
      baseRpcUrl:    field("base_rpc_url"),
      polygonRpcUrl: field("polygon_rpc_url"),
      siweDomain:    field("siwe_domain"),
      siweStatement: field("siwe_statement"),
    },
    database: {
      url: field("database_url"),
    },
  });
});

adminRoutes.patch("/api/services", requireAdmin, async (c) => {
  const body = await c.req.json<Record<string, string>>();

  for (const [key, value] of Object.entries(body)) {
    if (!SERVICE_KEYS[key]) continue;
    if (!value) {
      await db.delete(settings).where(eq(settings.key, key));
    } else {
      await db.insert(settings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    }
    // Apply to current process immediately
    if (value) process.env[SERVICE_KEYS[key]] = value;
  }

  return c.json({ ok: true });
});

adminRoutes.post("/api/services/test/:service", requireAdmin, async (c) => {
  const service = c.req.param("service");

  if (service === "database") {
    try {
      await db.select({ total: count() }).from(user);
      return c.json({ ok: true, message: "Database connection successful" });
    } catch (e: any) {
      return c.json({ ok: false, message: e.message }, 500);
    }
  }

  if (service === "email") {
    const apiKey = await getSetting("resend_api_key");
    const from   = await getSetting("email_from");
    if (!apiKey || apiKey.includes("stub")) return c.json({ ok: false, message: "Resend API key not configured" }, 400);
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const me = c.get("user") as { email: string };
      await resend.emails.send({ from: from!, to: me.email, subject: "GoBoiler — test email", text: "Email service is working." });
      return c.json({ ok: true, message: `Test email sent to ${me.email}` });
    } catch (e: any) {
      return c.json({ ok: false, message: e.message }, 500);
    }
  }

  if (service === "stripe") {
    const key = await getSetting("stripe_secret_key");
    if (!key || key.includes("stub")) return c.json({ ok: false, message: "Stripe key not configured" }, 400);
    try {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(key);
      await stripe.balance.retrieve();
      return c.json({ ok: true, message: "Stripe connection successful" });
    } catch (e: any) {
      return c.json({ ok: false, message: e.message }, 500);
    }
  }

  if (service === "crypto") {
    const url = await getSetting("eth_rpc_url");
    if (!url || url.includes("stub")) return c.json({ ok: false, message: "ETH RPC URL not configured" }, 400);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }) });
      const data: any = await res.json();
      const block = parseInt(data.result, 16);
      return c.json({ ok: true, message: `Connected — latest block: ${block.toLocaleString()}` });
    } catch (e: any) {
      return c.json({ ok: false, message: e.message }, 500);
    }
  }

  return c.json({ ok: false, message: "Unknown service" }, 400);
});

// ─── Static SPA (after all API routes) ──────────────────
adminRoutes.get("/app.js", async (c) => {
  const file = Bun.file("./public/admin/app.js");
  return new Response(file, { headers: { "Content-Type": "application/javascript" } });
});

adminRoutes.get("*", async (c) => {
  const file = Bun.file("./public/admin/index.html");
  return new Response(file, { headers: { "Content-Type": "text/html" } });
});
