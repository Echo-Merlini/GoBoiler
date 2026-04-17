import { db } from "@/db/client";
import { notification } from "@/db/schema";
import { nanoid } from "@/lib/utils";

// Per-user SSE client registry (in-process)
const clients = new Map<string, Set<(data: string) => void>>();

export function subscribeNotifications(userId: string, send: (data: string) => void): () => void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(send);
  return () => {
    clients.get(userId)?.delete(send);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  };
}

export async function sendNotification(opts: {
  userId: string;
  title: string;
  body?: string;
  url?: string;
}) {
  const id = nanoid();
  const createdAt = new Date();

  await db.insert(notification).values({ id, ...opts, createdAt });

  const entry = { id, ...opts, read: false, createdAt: createdAt.toISOString() };
  const payload = JSON.stringify(entry);
  clients.get(opts.userId)?.forEach(send => send(payload));
}

export async function broadcastNotification(opts: { title: string; body?: string; url?: string }) {
  // Broadcast to all currently connected users
  for (const [userId] of clients) {
    await sendNotification({ userId, ...opts });
  }
}
