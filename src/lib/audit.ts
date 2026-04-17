import { db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { nanoid } from "@/lib/utils";
import type { Context } from "hono";

export async function audit(
  c: Context,
  action: string,
  resource: string,
  resourceId?: string,
  before?: Record<string, unknown>,
  after?: Record<string, unknown>
) {
  const u = c.get("user") as { id: string } | undefined;
  db.insert(auditLog).values({
    id: nanoid(),
    userId: u?.id ?? null,
    action,
    resource,
    resourceId: resourceId ?? null,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
    ip: c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  }).catch(() => {}); // fire-and-forget — never block the request path
}
