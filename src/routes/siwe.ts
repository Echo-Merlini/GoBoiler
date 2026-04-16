import { Hono } from "hono";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateNonce, verifySiwe, findOrCreateWalletUser, linkWalletToUser } from "@/auth/siwe";
import { requireAuth } from "@/auth/middleware";

export const siweRoutes = new Hono();

const JWT_SECRET = process.env.BETTER_AUTH_SECRET!;
const TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// GET /auth/siwe/nonce — get a fresh nonce for the client to sign
siweRoutes.get("/nonce", async (c) => {
  const nonce = await generateNonce();
  return c.json({ nonce });
});

// POST /auth/siwe/verify — verify signature, return a wallet JWT
siweRoutes.post(
  "/verify",
  zValidator(
    "json",
    z.object({
      message: z.string(),
      signature: z.string(),
    })
  ),
  async (c) => {
    try {
      const { message, signature } = c.req.valid("json");
      const { address, chainId } = await verifySiwe(message, signature);
      const walletUser = await findOrCreateWalletUser(address, chainId);

      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        { sub: walletUser.id, wallet: address, iat: now, exp: now + TOKEN_TTL },
        JWT_SECRET
      );

      return c.json({ token, user: walletUser });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  }
);

// POST /auth/siwe/link — link a wallet to an existing Better Auth session
siweRoutes.post(
  "/link",
  requireAuth,
  zValidator(
    "json",
    z.object({
      message: z.string(),
      signature: z.string(),
    })
  ),
  async (c) => {
    try {
      const { message, signature } = c.req.valid("json");
      const u = c.get("user") as { id: string };
      const { address, chainId } = await verifySiwe(message, signature);

      await linkWalletToUser({ userId: u.id, address, chainId });
      return c.json({ linked: true, address });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  }
);
