// ─── Push Notification Service Client ───────────────────
// Thin wrapper around the push service running on the NAS.
// Set PUSH_SERVICE_URL and PUSH_SERVICE_TOKEN in .env

const PUSH_URL = process.env.PUSH_SERVICE_URL!;
const PUSH_TOKEN = process.env.PUSH_SERVICE_TOKEN ?? "";

export interface PushPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export async function sendPush(payload: PushPayload): Promise<boolean> {
  const res = await fetch(PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PUSH_TOKEN ? { Authorization: `Bearer ${PUSH_TOKEN}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  return res.ok;
}

// ─── Broadcast to multiple users ────────────────────────
export async function broadcastPush(
  userIds: string[],
  notification: Omit<PushPayload, "userId">
): Promise<void> {
  await Promise.allSettled(
    userIds.map((userId) => sendPush({ userId, ...notification }))
  );
}
