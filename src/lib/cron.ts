import * as nodeCron from "node-cron";
import { db } from "@/db/client";
import { cronJob } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const tasks = new Map<string, nodeCron.ScheduledTask>();

async function runJob(id: string) {
  const [job] = await db.select().from(cronJob).where(eq(cronJob.id, id));
  if (!job) return;

  let ok = false;
  let message = "";
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(job.headers ? JSON.parse(job.headers) : {}) };
    const res = await fetch(job.url, {
      method: job.method,
      headers,
      body: job.method !== "GET" && job.body ? job.body : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    ok = res.ok;
    message = `HTTP ${res.status}`;
  } catch (e: any) {
    message = e.message;
  }

  await db.update(cronJob).set({
    lastRunAt: new Date(),
    lastRunStatus: ok ? "ok" : "error",
    lastRunMessage: message,
    updatedAt: new Date(),
  }).where(eq(cronJob.id, id));

  if (ok) logger.info(`Job "${job.name}" completed: ${message}`, "cron", { jobId: id });
  else    logger.error(`Job "${job.name}" failed: ${message}`, "cron", { jobId: id });
}

export function scheduleJob(job: { id: string; schedule: string; enabled: boolean }) {
  stopJob(job.id);
  if (!job.enabled) return;
  if (!nodeCron.validate(job.schedule)) { console.warn(`[cron] invalid schedule for job ${job.id}: ${job.schedule}`); return; }
  const task = nodeCron.schedule(job.schedule, () => runJob(job.id));
  tasks.set(job.id, task);
}

export function stopJob(id: string) {
  tasks.get(id)?.stop();
  tasks.delete(id);
}

export function isRunning(id: string) {
  return tasks.has(id);
}

export async function runJobNow(id: string) {
  await runJob(id);
}

export async function initCronJobs() {
  const jobs = await db.select().from(cronJob).where(eq(cronJob.enabled, true));
  for (const job of jobs) scheduleJob(job);
  console.log(`[cron] ${jobs.length} job(s) scheduled`);
}
