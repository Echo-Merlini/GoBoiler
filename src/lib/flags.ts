import { db } from "@/db/client";
import { featureFlag } from "@/db/schema";
import type { Context, Next } from "hono";

type FlagRules = { plans?: string[]; userIds?: string[] };
type CachedFlag = { enabled: boolean; rules: FlagRules | null };

let cache = new Map<string, CachedFlag>();
let cacheExpiry = 0;

async function loadFlags() {
  if (Date.now() < cacheExpiry) return;
  const flags = await db.select().from(featureFlag);
  cache = new Map(flags.map(f => [
    f.key,
    { enabled: f.enabled, rules: f.rules ? JSON.parse(f.rules) : null },
  ]));
  cacheExpiry = Date.now() + 60_000;
}

export async function isEnabled(key: string, user?: { id: string; plan?: string }): Promise<boolean> {
  await loadFlags();
  const flag = cache.get(key);
  if (!flag || !flag.enabled) return false;
  if (!flag.rules) return true; // no rules = all users
  const { plans, userIds } = flag.rules;
  if (userIds?.includes(user?.id ?? "")) return true;
  if (plans?.includes(user?.plan ?? "free")) return true;
  return false;
}

export function invalidateFlagCache() {
  cacheExpiry = 0;
}

// Middleware: 404 if flag is not enabled for this user
export function requireFlag(key: string) {
  return async (c: Context, next: Next) => {
    const u = c.get("user") as { id: string; plan?: string } | undefined;
    if (!(await isEnabled(key, u))) return c.json({ error: "Feature not available" }, 404);
    return next();
  };
}
