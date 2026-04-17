import { Hono } from "hono";
import { requireAuth } from "@/auth/middleware";
import { db } from "@/db/client";
import { notification } from "@/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { subscribeNotifications } from "@/lib/notify";

export const notificationRoutes = new Hono();

// List notifications for current user (most recent 50)
notificationRoutes.get("/", requireAuth, async (c) => {
  const u = c.get("user") as { id: string };
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, u.id))
    .orderBy(desc(notification.createdAt))
    .limit(50);
  return c.json(rows);
});

// Unread count
notificationRoutes.get("/unread-count", requireAuth, async (c) => {
  const u = c.get("user") as { id: string };
  const [{ total }] = await db
    .select({ total: count() })
    .from(notification)
    .where(and(eq(notification.userId, u.id), eq(notification.read, false)));
  return c.json({ count: total });
});

// Mark one as read
notificationRoutes.post("/:id/read", requireAuth, async (c) => {
  const u = c.get("user") as { id: string };
  await db.update(notification)
    .set({ read: true })
    .where(and(eq(notification.id, c.req.param("id")), eq(notification.userId, u.id)));
  return c.json({ ok: true });
});

// Mark all as read
notificationRoutes.post("/read-all", requireAuth, async (c) => {
  const u = c.get("user") as { id: string };
  await db.update(notification).set({ read: true }).where(eq(notification.userId, u.id));
  return c.json({ ok: true });
});

// SSE stream — pushes new notifications to connected client
notificationRoutes.get("/stream", requireAuth, async (c) => {
  const u = c.get("user") as { id: string };
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        const send = (data: string) => {
          try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)); }
          catch { unsub(); }
        };
        const unsub = subscribeNotifications(u.id, send);
        controller.enqueue(encoder.encode(": connected\n\n"));
        c.req.raw.signal.addEventListener("abort", () => { unsub(); controller.close(); });
      },
    }),
    { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } }
  );
});
