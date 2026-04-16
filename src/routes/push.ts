import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth, requirePlan } from "@/auth/middleware";
import { sendPush } from "@/lib/push";

export const pushRoutes = new Hono();

// POST /push/send — send a push notification to a user (pro+ only)
pushRoutes.post(
  "/send",
  requireAuth,
  requirePlan("pro"),
  zValidator(
    "json",
    z.object({
      userId: z.string(),
      title: z.string().max(100),
      body: z.string().max(300),
      url: z.string().url().optional(),
      icon: z.string().url().optional(),
    })
  ),
  async (c) => {
    const payload = c.req.valid("json");
    const ok = await sendPush(payload);
    if (!ok) return c.json({ error: "Push delivery failed" }, 502);
    return c.json({ sent: true });
  }
);
