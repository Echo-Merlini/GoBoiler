import { db } from "@/db/client";
import { appLog } from "@/db/schema";
import { nanoid } from "@/lib/utils";

type Level = "info" | "warn" | "error";

// Lazy import to avoid circular deps — admin routes import logger, logger imports admin
let _emit: ((e: Record<string, unknown>) => void) | null = null;
export function setLogEmitter(fn: (e: Record<string, unknown>) => void) { _emit = fn; }

function write(level: Level, message: string, source?: string, meta?: Record<string, unknown>) {
  const prefix = level === "error" ? "✗" : level === "warn" ? "⚠" : "•";
  console[level === "info" ? "log" : level](`[${source ?? "app"}] ${prefix} ${message}`, meta ?? "");

  const entry = { id: nanoid(), level, message, source: source ?? null, meta: meta ? JSON.stringify(meta) : null, createdAt: new Date().toISOString() };

  // Persist to DB
  db.insert(appLog).values({ ...entry, createdAt: new Date() }).catch(() => {});

  // Broadcast to SSE clients
  _emit?.(entry);
}

export const logger = {
  info:  (msg: string, source?: string, meta?: Record<string, unknown>) => write("info",  msg, source, meta),
  warn:  (msg: string, source?: string, meta?: Record<string, unknown>) => write("warn",  msg, source, meta),
  error: (msg: string, source?: string, meta?: Record<string, unknown>) => write("error", msg, source, meta),
};
