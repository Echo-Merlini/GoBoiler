import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "@/auth/middleware";
import { db } from "@/db/client";
import { user, wallet } from "@/db/schema";
import { eq } from "drizzle-orm";

export const meRoutes = new Hono();

// GET /me — current user profile
meRoutes.get("/", requireAuth, async (c) => {
  const u = c.get("user") as { id: string };
  const [profile] = await db.select().from(user).where(eq(user.id, u.id));
  if (!profile) return c.json({ error: "User not found" }, 404);

  const wallets = await db.select().from(wallet).where(eq(wallet.userId, u.id));

  return c.json({ user: profile, wallets });
});

// PATCH /me — update display name or avatar
meRoutes.patch(
  "/",
  requireAuth,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      image: z.string().url().optional(),
    })
  ),
  async (c) => {
    const u = c.get("user") as { id: string };
    const updates = c.req.valid("json");
    if (!updates.name && !updates.image) {
      return c.json({ error: "Nothing to update" }, 400);
    }

    const [updated] = await db
      .update(user)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(user.id, u.id))
      .returning();

    return c.json({ user: updated });
  }
);

// DELETE /me/wallet/:address — unlink a wallet
meRoutes.delete("/wallet/:address", requireAuth, async (c) => {
  const u = c.get("user") as { id: string };
  const address = c.req.param("address").toLowerCase();

  const [w] = await db
    .select()
    .from(wallet)
    .where(eq(wallet.address, address));

  if (!w || w.userId !== u.id) {
    return c.json({ error: "Wallet not found" }, 404);
  }

  await db.delete(wallet).where(eq(wallet.id, w.id));

  // Clear primary wallet on user if it was this one
  const [profile] = await db.select().from(user).where(eq(user.id, u.id));
  if (profile.walletAddress === address) {
    // Promote next wallet as primary, or clear
    const [next] = await db.select().from(wallet).where(eq(wallet.userId, u.id));
    await db
      .update(user)
      .set({ walletAddress: next?.address ?? null })
      .where(eq(user.id, u.id));
    if (next) {
      await db.update(wallet).set({ isPrimary: true }).where(eq(wallet.id, next.id));
    }
  }

  return c.json({ unlinked: true });
});
