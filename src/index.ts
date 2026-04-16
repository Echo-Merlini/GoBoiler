import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { routes } from "@/routes/index";

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

// ─── Start Server ───────────────────────────────────────
const port = Number(process.env.PORT ?? 3000);
console.log(`🔥 GoBoiler running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;
