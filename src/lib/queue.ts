import { db } from "@/db/client";
import { jobQueue } from "@/db/schema";
import { eq, lte, and } from "drizzle-orm";
import { nanoid } from "@/lib/utils";
import { logger } from "@/lib/logger";

type Handler = (payload: Record<string, unknown>) => Promise<void>;

const workers = new Map<string, Handler>();

export function registerWorker(type: string, handler: Handler) {
  workers.set(type, handler);
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  options: { delayMs?: number; maxAttempts?: number } = {}
) {
  const runAt = options.delayMs ? new Date(Date.now() + options.delayMs) : new Date();
  await db.insert(jobQueue).values({
    id: nanoid(),
    type,
    payload: JSON.stringify(payload),
    maxAttempts: options.maxAttempts ?? 3,
    runAt,
  });
}

async function tick() {
  const pending = await db
    .select()
    .from(jobQueue)
    .where(and(eq(jobQueue.status, "pending"), lte(jobQueue.runAt, new Date())))
    .limit(10);

  for (const job of pending) {
    const handler = workers.get(job.type);
    if (!handler) continue;

    await db.update(jobQueue)
      .set({ status: "processing", attempts: job.attempts + 1 })
      .where(eq(jobQueue.id, job.id));

    try {
      await handler(JSON.parse(job.payload));
      await db.update(jobQueue)
        .set({ status: "done", processedAt: new Date() })
        .where(eq(jobQueue.id, job.id));
    } catch (err: any) {
      const attempt = job.attempts + 1;
      if (attempt >= job.maxAttempts) {
        await db.update(jobQueue)
          .set({ status: "failed", error: err.message, processedAt: new Date() })
          .where(eq(jobQueue.id, job.id));
        logger.error(`Job failed after ${attempt} attempts: ${job.type}`, "queue", { id: job.id, error: err.message });
      } else {
        // Exponential backoff: 1 min, 5 min, 25 min
        const delayMs = Math.pow(5, attempt) * 60_000;
        await db.update(jobQueue)
          .set({ status: "pending", runAt: new Date(Date.now() + delayMs), error: err.message })
          .where(eq(jobQueue.id, job.id));
      }
    }
  }
}

export function startQueue() {
  setInterval(() => tick().catch(e => logger.error(e.message, "queue")), 5_000);
  logger.info("Job queue started (5s poll)", "queue");
}
