import webpush from "web-push";
import { db } from "@/db/client";
import { pushSubscription } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface PushPayload {
  userId?: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

function vapidConfigured() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_EMAIL);
}

function initVapid() {
  if (!vapidConfigured()) return;
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

initVapid();

// ─── Native WebPush to all subscriptions for a user ─────
async function sendVapidPush(userId: string, payload: PushPayload): Promise<number> {
  const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
  let sent = 0;
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, icon: payload.icon }),
        );
        sent++;
      } catch (e: any) {
        // Subscription expired — remove it
        if (e.statusCode === 410) {
          await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, sub.endpoint));
        }
      }
    }),
  );
  return sent;
}

// ─── External push service fallback ─────────────────────
async function sendExternalPush(payload: PushPayload): Promise<boolean> {
  const url   = process.env.PUSH_SERVICE_URL;
  const token = process.env.PUSH_SERVICE_TOKEN ?? "";
  if (!url) return false;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// ─── Public API ──────────────────────────────────────────
export async function sendPush(payload: PushPayload): Promise<boolean> {
  if (vapidConfigured() && payload.userId) {
    const sent = await sendVapidPush(payload.userId, payload);
    return sent > 0;
  }
  return sendExternalPush(payload);
}

export async function broadcastPush(userIds: string[], notification: Omit<PushPayload, "userId">): Promise<void> {
  await Promise.allSettled(userIds.map(userId => sendPush({ userId, ...notification })));
}

export function generateVapidKeys() {
  return webpush.generateVAPIDKeys();
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
