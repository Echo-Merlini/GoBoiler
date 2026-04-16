import { Hono } from "hono";
import { auth } from "@/auth/auth";

export const authRoutes = new Hono();

// Better Auth handles all its own routes under /auth/*
// (sign-in, sign-up, sign-out, session, OAuth callbacks, magic links, 2FA, org...)
authRoutes.on(["GET", "POST"], "/*", (c) => auth.handler(c.req.raw));
