import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth, requirePlan } from "@/auth/middleware";
import { sendPush, getVapidPublicKey } from "@/lib/push";
import { db } from "@/db/client";
import { pushSubscription } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "@/lib/utils";

export const pushRoutes = new Hono();

// GET /push/vapid-public-key — used by service worker to subscribe
pushRoutes.get("/vapid-public-key", (c) => {
  const key = getVapidPublicKey();
  if (!key) return c.json({ error: "VAPID not configured" }, 404);
  return c.json({ key });
});

// POST /push/subscribe — browser registers its push subscription
pushRoutes.post(
  "/subscribe",
  requireAuth,
  zValidator("json", z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  })),
  async (c) => {
    const u = c.get("user") as { id: string };
    const { endpoint, keys } = c.req.valid("json");

    await db.insert(pushSubscription)
      .values({ id: nanoid(), userId: u.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: c.req.header("user-agent") ?? null })
      .onConflictDoUpdate({ target: pushSubscription.endpoint, set: { p256dh: keys.p256dh, auth: keys.auth } });

    return c.json({ subscribed: true });
  }
);

// DELETE /push/subscribe — browser unsubscribes
pushRoutes.delete(
  "/subscribe",
  requireAuth,
  zValidator("json", z.object({ endpoint: z.string() })),
  async (c) => {
    const { endpoint } = c.req.valid("json");
    await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
    return c.json({ unsubscribed: true });
  }
);

// POST /push/send — send push to a user (pro+ only)
pushRoutes.post(
  "/send",
  requireAuth,
  requirePlan("pro"),
  zValidator("json", z.object({
    userId: z.string(),
    title: z.string().max(100),
    body: z.string().max(300),
    url: z.string().url().optional(),
    icon: z.string().url().optional(),
  })),
  async (c) => {
    const payload = c.req.valid("json");
    const ok = await sendPush(payload);
    if (!ok) return c.json({ error: "Push delivery failed" }, 502);
    return c.json({ sent: true });
  }
);
