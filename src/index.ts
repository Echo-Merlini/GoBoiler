import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { routes } from "@/routes/index";
import { auth } from "@/auth/auth";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";

const app = new Hono();

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

// ─── Health Check ───────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

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
  await db.update(user).set({ isAdmin: true }).where(eq(user.email, email));
  console.log(`✓ Admin user created: ${email}`);
}

// ─── Start Server ───────────────────────────────────────
const port = Number(process.env.PORT ?? 3000);

seedAdmin().catch(e => console.warn("seedAdmin:", e.message));

console.log(`🔥 GoBoiler running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
