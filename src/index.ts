import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import { rateLimiter } from "hono-rate-limiter";
import { routes } from "@/routes/index";
import { initCronJobs } from "@/lib/cron";
import { setLogEmitter } from "@/lib/logger";
import { startQueue } from "@/lib/queue";
import { registerWebhookWorker } from "@/lib/webhooks";
import { emitLogEvent } from "@/routes/admin";
import { auth } from "@/auth/auth";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

// ─── Security Headers ───────────────────────────────────
app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc:  ["'self'", "'unsafe-inline'"],   // relax for admin SPA inline scripts
    styleSrc:   ["'self'", "'unsafe-inline'"],
    imgSrc:     ["'self'", "data:", "https:"],
    connectSrc: ["'self'"],
    fontSrc:    ["'self'"],
    frameSrc:   ["'none'"],
  },
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: "max-age=63072000; includeSubDomains",
}));

// ─── Global Middleware ──────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.APP_URL ?? "http://localhost:3000",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ─── Rate Limiting ──────────────────────────────────────
// Strict: auth endpoints — 20 req/15 min per IP
app.use("/auth/sign-in/*", rateLimiter({ windowMs: 15 * 60 * 1000, limit: 20,  keyGenerator: c => c.req.header("x-forwarded-for") ?? "local" }));
app.use("/auth/sign-up/*", rateLimiter({ windowMs: 15 * 60 * 1000, limit: 10,  keyGenerator: c => c.req.header("x-forwarded-for") ?? "local" }));
app.use("/auth/request-password-reset", rateLimiter({ windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: c => c.req.header("x-forwarded-for") ?? "local" }));
app.use("/auth/sign-in/magic-link",     rateLimiter({ windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: c => c.req.header("x-forwarded-for") ?? "local" }));
// Relaxed: general API — 300 req/min per IP
app.use("*", rateLimiter({ windowMs: 60 * 1000, limit: 300, keyGenerator: c => c.req.header("x-forwarded-for") ?? "local" }));

// ─── Health Check ───────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

// ─── PWA static files ───────────────────────────────────
app.get("/sw.js",        (c) => new Response(Bun.file("./public/sw.js"),        { headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/" } }));
app.get("/manifest.json",(c) => new Response(Bun.file("./public/manifest.json"),{ headers: { "Content-Type": "application/manifest+json" } }));

// ─── Routes ─────────────────────────────────────────────
app.route("/", routes);

// ─── Seed admin user ────────────────────────────────────
async function seedAdmin() {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing) {
    await db.update(user).set({ isAdmin: true }).where(eq(user.email, email));
    return;
  }

  await auth.api.signUpEmail({ body: { email, password, name: "Admin" } });
  await db.update(user).set({ isAdmin: true, emailVerified: true }).where(eq(user.email, email));
  console.log(`✓ Admin user created: ${email}`);
}

// ─── Start Server ───────────────────────────────────────
const port = Number(process.env.PORT ?? 3000);

setLogEmitter(emitLogEvent);
seedAdmin().catch(e => console.warn("seedAdmin:", e.message));
initCronJobs().catch(e => console.warn("initCronJobs:", e.message));
registerWebhookWorker();
startQueue();

console.log(`🔥 GoBoiler running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
