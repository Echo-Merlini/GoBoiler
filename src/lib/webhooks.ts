import { createHmac, randomBytes } from "crypto";
import { db } from "@/db/client";
import { webhookEndpoint, webhookDelivery } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { enqueue, registerWorker } from "@/lib/queue";

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

function sign(payload: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

export async function dispatch(event: string, data: Record<string, unknown>) {
  const endpoints = await db.select().from(webhookEndpoint).where(eq(webhookEndpoint.enabled, true));

  for (const ep of endpoints) {
    const events = ep.events.split(",").map(e => e.trim());
    if (!events.includes("*") && !events.includes(event)) continue;

    const deliveryId = nanoid();
    const payload = JSON.stringify({
      id: deliveryId,
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    await db.insert(webhookDelivery).values({
      id: deliveryId,
      endpointId: ep.id,
      event,
      payload,
      status: "pending",
    });

    await enqueue("webhook.deliver", {
      deliveryId,
      url: ep.url,
      secret: ep.secret,
      payload,
    }, { maxAttempts: 3 });
  }
}

// Worker — registered in index.ts after startQueue()
export async function deliverWebhook(job: Record<string, unknown>) {
  const { deliveryId, url, secret, payload } = job as {
    deliveryId: string; url: string; secret: string; payload: string;
  };

  const sig = sign(payload, secret);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GoBoiler-Signature": sig,
      "X-GoBoiler-Delivery": deliveryId,
      "X-GoBoiler-Event": JSON.parse(payload).event ?? "",
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });

  const responseBody = await res.text().catch(() => "");
  const [delivery] = await db.select({ attempts: webhookDelivery.attempts }).from(webhookDelivery).where(eq(webhookDelivery.id, deliveryId));

  await db.update(webhookDelivery).set({
    status: res.ok ? "success" : "failed",
    attempts: (delivery?.attempts ?? 0) + 1,
    responseStatus: res.status,
    responseBody: responseBody.slice(0, 500),
  }).where(eq(webhookDelivery.id, deliveryId));

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  logger.info(`Webhook delivered ${deliveryId} → ${url}`, "webhooks");
}

export function registerWebhookWorker() {
  registerWorker("webhook.deliver", deliverWebhook);
}
