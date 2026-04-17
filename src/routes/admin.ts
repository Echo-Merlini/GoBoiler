import { Hono } from "hono";
import { requireAdmin } from "@/auth/middleware";
import { db } from "@/db/client";
import { user, session, wallet, settings, cronJob, pushSubscription, appLog, apiKey } from "@/db/schema";
import { eq, count, desc } from "drizzle-orm";
import { scheduleJob, stopJob, isRunning, runJobNow } from "@/lib/cron";
import { createApiKey, revokeApiKey } from "@/lib/apikeys";
import { generateVapidKeys } from "@/lib/push";
import { testConnection, listFiles } from "@/lib/storage";
import { nanoid } from "@/lib/utils";

export const adminRoutes = new Hono();

// ─── Static SPA — must come AFTER all /api/* routes ─────

// ─── API: Stats ──────────────────────────────────────────
adminRoutes.get("/api/stats", requireAdmin, async (c) => {
  const [[{ total: totalUsers }], [{ total: totalSessions }], [{ total: totalWallets }], [{ total: totalPushSubs }]] =
    await Promise.all([
      db.select({ total: count() }).from(user),
      db.select({ total: count() }).from(session),
      db.select({ total: count() }).from(wallet),
      db.select({ total: count() }).from(pushSubscription),
    ]);

  const planCounts = await db
    .select({ plan: user.plan, total: count() })
    .from(user)
    .groupBy(user.plan);

  return c.json({ totalUsers, totalSessions, totalWallets, totalPushSubs, planCounts });
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
  google_client_id:           "GOOGLE_CLIENT_ID",
  google_client_secret:       "GOOGLE_CLIENT_SECRET",
  resend_api_key:             "RESEND_API_KEY",
  email_from:                 "EMAIL_FROM",
  stripe_secret_key:          "STRIPE_SECRET_KEY",
  stripe_webhook_secret:      "STRIPE_WEBHOOK_SECRET",
  stripe_pro_price_id:        "STRIPE_PRO_PRICE_ID",
  stripe_enterprise_price_id: "STRIPE_ENTERPRISE_PRICE_ID",
  eth_rpc_url:                "ETH_RPC_URL",
  base_rpc_url:               "BASE_RPC_URL",
  polygon_rpc_url:            "POLYGON_RPC_URL",
  siwe_domain:                "SIWE_DOMAIN",
  siwe_statement:             "SIWE_STATEMENT",
  database_url:               "DATABASE_URL",
  // Storage
  s3_bucket:                  "S3_BUCKET",
  s3_region:                  "S3_REGION",
  s3_access_key_id:           "S3_ACCESS_KEY_ID",
  s3_secret_access_key:       "S3_SECRET_ACCESS_KEY",
  s3_endpoint:                "S3_ENDPOINT",
  s3_public_url:              "S3_PUBLIC_URL",
  // Push / PWA
  vapid_public_key:           "VAPID_PUBLIC_KEY",
  vapid_private_key:          "VAPID_PRIVATE_KEY",
  vapid_email:                "VAPID_EMAIL",
  push_service_url:           "PUSH_SERVICE_URL",
  push_service_token:         "PUSH_SERVICE_TOKEN",
  // AI Agent
  anthropic_api_key:          "ANTHROPIC_API_KEY",
  openai_api_key:             "OPENAI_API_KEY",
  groq_api_key:               "GROQ_API_KEY",
  mistral_api_key:            "MISTRAL_API_KEY",
  default_ai_model:           "DEFAULT_AI_MODEL",
};

const SENSITIVE = new Set([
  "google_client_secret", "resend_api_key", "stripe_secret_key",
  "stripe_webhook_secret", "database_url",
  "s3_secret_access_key",
  "vapid_private_key", "push_service_token",
  "anthropic_api_key", "openai_api_key", "groq_api_key", "mistral_api_key",
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
    storage: {
      bucket:          field("s3_bucket"),
      region:          field("s3_region"),
      accessKeyId:     field("s3_access_key_id"),
      secretAccessKey: field("s3_secret_access_key"),
      endpoint:        field("s3_endpoint"),
      publicUrl:       field("s3_public_url"),
    },
    push: {
      vapidPublicKey:   field("vapid_public_key"),
      vapidPrivateKey:  field("vapid_private_key"),
      vapidEmail:       field("vapid_email"),
      serviceUrl:       field("push_service_url"),
      serviceToken:     field("push_service_token"),
    },
    agent: {
      anthropicApiKey: field("anthropic_api_key"),
      openaiApiKey:    field("openai_api_key"),
      groqApiKey:      field("groq_api_key"),
      mistralApiKey:   field("mistral_api_key"),
      defaultModel:    field("default_ai_model"),
    },
    mcp: {
      servers: (() => {
        const row = stored["mcp_servers"];
        return { set: !!row, source: row ? "db" : "unset", value: row ?? null };
      })(),
    },
  });
});

adminRoutes.patch("/api/services", requireAdmin, async (c) => {
  const body = await c.req.json<Record<string, string>>();

  for (const [key, value] of Object.entries(body)) {
    if (!SERVICE_KEYS[key] && key !== "mcp_servers") continue;
    if (!value) {
      await db.delete(settings).where(eq(settings.key, key));
    } else {
      await db.insert(settings)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    }
    if (value && SERVICE_KEYS[key]) process.env[SERVICE_KEYS[key]] = value;
  }

  return c.json({ ok: true });
});

// ─── Generate VAPID keys ─────────────────────────────────
adminRoutes.post("/api/push/generate-vapid", requireAdmin, async (c) => {
  const keys = generateVapidKeys();
  return c.json(keys);
});

// ─── Push subscriptions list ─────────────────────────────
adminRoutes.get("/api/push/subscriptions", requireAdmin, async (c) => {
  const subs = await db
    .select({ id: pushSubscription.id, userId: pushSubscription.userId, userAgent: pushSubscription.userAgent, createdAt: pushSubscription.createdAt, userEmail: user.email })
    .from(pushSubscription)
    .innerJoin(user, eq(pushSubscription.userId, user.id))
    .orderBy(desc(pushSubscription.createdAt));
  return c.json(subs);
});

// ─── MCP servers CRUD ────────────────────────────────────
adminRoutes.get("/api/mcp/servers", requireAdmin, async (c) => {
  const [row] = await db.select().from(settings).where(eq(settings.key, "mcp_servers"));
  const servers = row ? JSON.parse(row.value) : [];
  return c.json(servers);
});

adminRoutes.put("/api/mcp/servers", requireAdmin, async (c) => {
  const servers = await c.req.json();
  const value = JSON.stringify(servers);
  await db.insert(settings)
    .values({ key: "mcp_servers", value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
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
    const url = await getSetting("eth_rpc_url") ?? process.env.ETH_RPC_URL;
    if (!url || url.includes("YOUR_KEY")) return c.json({ ok: false, message: "ETH RPC URL not configured" }, 400);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }) });
      if (!res.ok) return c.json({ ok: false, message: `RPC returned HTTP ${res.status} — check your API key` }, 400);
      const data: any = await res.json();
      if (data.error) return c.json({ ok: false, message: data.error.message ?? "RPC error" }, 400);
      const block = parseInt(data.result, 16);
      return c.json({ ok: true, message: `Connected — latest block: ${block.toLocaleString()}` });
    } catch (e: any) {
      return c.json({ ok: false, message: e.message }, 500);
    }
  }

  if (service === "storage") {
    const bucket = await getSetting("s3_bucket") ?? process.env.S3_BUCKET;
    if (!bucket) return c.json({ ok: false, message: "S3 bucket not configured" }, 400);
    try {
      await testConnection();
      const files = await listFiles(undefined, 5);
      return c.json({ ok: true, message: `Connected — ${files.length} object(s) listed` });
    } catch (e: any) {
      return c.json({ ok: false, message: e.message });
    }
  }

  if (service === "agent") {
    const anthropicKey = await getSetting("anthropic_api_key");
    const openaiKey    = await getSetting("openai_api_key");
    const results: string[] = [];

    if (anthropicKey && !anthropicKey.includes("●")) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        });
        results.push(res.ok ? "✓ Anthropic" : `✗ Anthropic HTTP ${res.status}`);
      } catch { results.push("✗ Anthropic (unreachable)"); }
    }

    if (openaiKey && !openaiKey.includes("●")) {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${openaiKey}` },
        });
        results.push(res.ok ? "✓ OpenAI" : `✗ OpenAI HTTP ${res.status}`);
      } catch { results.push("✗ OpenAI (unreachable)"); }
    }

    if (!results.length) return c.json({ ok: false, message: "No API keys configured to test" }, 400);
    const allOk = results.every(r => r.startsWith("✓"));
    return c.json({ ok: allOk, message: results.join("  |  ") });
  }

  if (service === "mcp") {
    const body = await c.req.json<{ url: string }>().catch(() => null);
    if (!body?.url) return c.json({ ok: false, message: "No URL provided" }, 400);
    try {
      const res = await fetch(body.url, { method: "GET", signal: AbortSignal.timeout(5000) });
      return c.json({ ok: res.ok, message: res.ok ? `Connected (HTTP ${res.status})` : `HTTP ${res.status}` });
    } catch (e: any) {
      return c.json({ ok: false, message: e.message });
    }
  }

  return c.json({ ok: false, message: "Unknown service" }, 400);
});

// ─── API: Cron Jobs ─────────────────────────────────────
adminRoutes.get("/api/cron", requireAdmin, async (c) => {
  const jobs = await db.select().from(cronJob).orderBy(desc(cronJob.createdAt));
  return c.json(jobs.map(j => ({ ...j, running: isRunning(j.id) })));
});

adminRoutes.post("/api/cron", requireAdmin, async (c) => {
  const body = await c.req.json<{ name: string; schedule: string; url: string; method?: string; body?: string; headers?: string }>();
  const id = nanoid();
  const [job] = await db.insert(cronJob).values({
    id,
    name: body.name,
    schedule: body.schedule,
    url: body.url,
    method: body.method ?? "GET",
    body: body.body ?? null,
    headers: body.headers ?? null,
    enabled: false,
  }).returning();
  return c.json(job);
});

adminRoutes.patch("/api/cron/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<Partial<{ name: string; schedule: string; url: string; method: string; body: string; headers: string; enabled: boolean }>>();
  const [updated] = await db.update(cronJob).set({ ...body, updatedAt: new Date() }).where(eq(cronJob.id, id)).returning();
  if (body.enabled !== undefined) {
    body.enabled ? scheduleJob(updated) : stopJob(id);
  }
  return c.json({ ...updated, running: isRunning(id) });
});

adminRoutes.delete("/api/cron/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  stopJob(id);
  await db.delete(cronJob).where(eq(cronJob.id, id));
  return c.json({ ok: true });
});

adminRoutes.post("/api/cron/:id/run", requireAdmin, async (c) => {
  const id = c.req.param("id");
  await runJobNow(id);
  const [job] = await db.select().from(cronJob).where(eq(cronJob.id, id));
  return c.json({ ...job, running: isRunning(id) });
});

adminRoutes.post("/api/cron/:id/stop", requireAdmin, async (c) => {
  const id = c.req.param("id");
  stopJob(id);
  await db.update(cronJob).set({ enabled: false, updatedAt: new Date() }).where(eq(cronJob.id, id));
  return c.json({ ok: true });
});

adminRoutes.post("/api/cron/:id/start", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const [job] = await db.select().from(cronJob).where(eq(cronJob.id, id));
  if (!job) return c.json({ error: "Not found" }, 404);
  await db.update(cronJob).set({ enabled: true, updatedAt: new Date() }).where(eq(cronJob.id, id));
  scheduleJob({ ...job, enabled: true });
  return c.json({ ...job, enabled: true, running: isRunning(id) });
});

// ─── API: API Keys ───────────────────────────────────────
adminRoutes.get("/api/apikeys", requireAdmin, async (c) => {
  const keys = await db
    .select({ id: apiKey.id, name: apiKey.name, prefix: apiKey.prefix, scopes: apiKey.scopes, lastUsedAt: apiKey.lastUsedAt, expiresAt: apiKey.expiresAt, createdAt: apiKey.createdAt, userEmail: user.email })
    .from(apiKey).innerJoin(user, eq(apiKey.userId, user.id)).orderBy(desc(apiKey.createdAt));
  return c.json(keys);
});

adminRoutes.post("/api/apikeys", requireAdmin, async (c) => {
  const me = c.get("user") as { id: string };
  const body = await c.req.json<{ name: string; scopes?: string; expiresAt?: string }>();
  if (!body.name) return c.json({ error: "name required" }, 400);
  const raw = await createApiKey(me.id, body.name, body.scopes ?? "*", body.expiresAt ? new Date(body.expiresAt) : undefined);
  return c.json({ key: raw }); // shown once
});

adminRoutes.delete("/api/apikeys/:id", requireAdmin, async (c) => {
  await revokeApiKey(c.req.param("id"));
  return c.json({ ok: true });
});

// ─── SSE: Live log stream ────────────────────────────────
const sseClients = new Set<(data: string) => void>();

export function emitLogEvent(entry: Record<string, unknown>) {
  const payload = JSON.stringify(entry);
  sseClients.forEach(send => send(payload));
}

adminRoutes.get("/api/logs/stream", requireAdmin, async (c) => {
  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (data: string) => {
          try { controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`)); }
          catch { sseClients.delete(send); }
        };
        sseClients.add(send);
        controller.enqueue(new TextEncoder().encode(": connected\n\n"));
        c.req.raw.signal.addEventListener("abort", () => {
          sseClients.delete(send);
          controller.close();
        });
      },
    }),
    { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } }
  );
});

// ─── API: Logs ───────────────────────────────────────────
adminRoutes.get("/api/logs", requireAdmin, async (c) => {
  const level  = c.req.query("level");
  const search = c.req.query("search");
  const limit  = Math.min(Number(c.req.query("limit") ?? 200), 500);

  let query = db.select().from(appLog).orderBy(desc(appLog.createdAt)).limit(limit);
  const rows = await query;

  const filtered = rows.filter(r => {
    if (level && r.level !== level) return false;
    if (search && !r.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return c.json(filtered);
});

adminRoutes.delete("/api/logs", requireAdmin, async (c) => {
  await db.delete(appLog);
  return c.json({ ok: true });
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
