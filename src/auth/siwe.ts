import { SiweMessage } from "siwe";
import { verifyMessage } from "viem";
import { db } from "@/db/client";
import { siweNonce, user, wallet } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "@/lib/utils";

// ─── Generate a one-time nonce ───────────────────────────
export async function generateNonce(): Promise<string> {
  const nonce = nanoid(16);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

  await db.insert(siweNonce).values({
    id: nanoid(),
    nonce,
    expiresAt,
  });

  return nonce;
}

// ─── Verify a signed SIWE message ────────────────────────
export async function verifySiwe(message: string, signature: string) {
  const siwe = new SiweMessage(message);

  // 1. Validate nonce exists and is not expired
  const [record] = await db
    .select()
    .from(siweNonce)
    .where(eq(siweNonce.nonce, siwe.nonce));

  if (!record) throw new Error("Invalid or unknown nonce");
  if (record.expiresAt < new Date()) throw new Error("Nonce expired");

  // 2. Verify the signature on-chain style (viem, no RPC needed for ECDSA)
  const valid = await verifyMessage({
    address: siwe.address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });

  if (!valid) throw new Error("Invalid signature");

  // 3. Consume the nonce (one-time use)
  await db.delete(siweNonce).where(eq(siweNonce.nonce, siwe.nonce));

  return { address: siwe.address.toLowerCase(), chainId: siwe.chainId ?? 1 };
}

// ─── Find or create user from wallet address ─────────────
export async function findOrCreateWalletUser(
  address: string,
  chainId: number
) {
  const addr = address.toLowerCase();

  // Check if wallet is already linked
  const [existingWallet] = await db
    .select()
    .from(wallet)
    .where(eq(wallet.address, addr));

  if (existingWallet) {
    const [existingUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, existingWallet.userId));
    return existingUser;
  }

  // Create a new user for this wallet
  const userId = nanoid();
  const [newUser] = await db
    .insert(user)
    .values({
      id: userId,
      name: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
      email: `${addr}@wallet.local`, // placeholder, no email auth
      emailVerified: false,
      walletAddress: addr,
    })
    .returning();

  await db.insert(wallet).values({
    id: nanoid(),
    userId,
    address: addr,
    chainId,
    isPrimary: true,
  });

  return newUser;
}

// ─── Link a wallet to an existing authenticated user ─────
export async function linkWalletToUser({
  userId,
  address,
  chainId,
}: {
  userId: string;
  address: string;
  chainId: number;
}) {
  const addr = address.toLowerCase();

  const [existing] = await db.select().from(wallet).where(eq(wallet.address, addr));
  if (existing) {
    if (existing.userId !== userId) throw new Error("Wallet already linked to another account");
    return; // already linked to this user
  }

  // Set previous primary wallets to non-primary
  await db.update(wallet).set({ isPrimary: false }).where(eq(wallet.userId, userId));

  await db.insert(wallet).values({
    id: nanoid(),
    userId,
    address: addr,
    chainId,
    isPrimary: true,
  });

  await db.update(user).set({ walletAddress: addr }).where(eq(user.id, userId));
}

// ─── Purge expired nonces (call from a periodic job) ─────
export async function purgeExpiredNonces() {
  await db.delete(siweNonce).where(eq(siweNonce.expiresAt, new Date(0)));
}
