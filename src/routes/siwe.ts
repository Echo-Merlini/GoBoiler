import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { generateNonce, verifySiwe, findOrCreateWalletUser } from "@/auth/siwe";
import { auth } from "@/auth/auth";

export const siweRoutes = new Hono();

// GET /auth/siwe/nonce — get a fresh nonce for the client to sign
siweRoutes.get("/nonce", async (c) => {
  const nonce = await generateNonce();
  return c.json({ nonce });
});

// POST /auth/siwe/verify — verify signature and return a session
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
    const { message, signature } = c.req.valid("json");

    const { address, chainId } = await verifySiwe(message, signature);
    const existingUser = await findOrCreateWalletUser(address, chainId);

    // Create a Better Auth session for this user
    const session = await auth.api.signInWithCredentials({
      body: {
        email: existingUser.email,
        password: existingUser.id, // internal — wallet users have no real password
      },
    });

    return c.json({ session, user: existingUser });
  }
);
