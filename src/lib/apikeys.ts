import { createHash, randomBytes } from "crypto";
import { db } from "@/db/client";
import { apiKey } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "@/lib/utils";

const PREFIX_LEN = 8;

function hash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateKey(): { raw: string; prefix: string; keyHash: string } {
  const raw    = `gbk_${randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, PREFIX_LEN);
  return { raw, prefix, keyHash: hash(raw) };
}

export async function createApiKey(userId: string, name: string, scopes = "*", expiresAt?: Date) {
  const { raw, prefix, keyHash } = generateKey();
  await db.insert(apiKey).values({ id: nanoid(), userId, name, keyHash, prefix, scopes, expiresAt: expiresAt ?? null });
  return raw; // returned once — never stored
}

export async function verifyApiKey(raw: string) {
  const keyHash = hash(raw);
  const [key] = await db.select().from(apiKey).where(eq(apiKey.keyHash, keyHash));
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Update lastUsedAt async
  db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, key.id)).catch(() => {});
  return key;
}

export async function revokeApiKey(id: string) {
  await db.delete(apiKey).where(eq(apiKey.id, id));
}
