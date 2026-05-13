import { Hono } from "hono";
import { authRoutes } from "@/routes/auth";
import { siweRoutes } from "@/routes/siwe";
import { billingRoutes } from "@/routes/billing";
import { pushRoutes } from "@/routes/push";
import { meRoutes } from "@/routes/me";
import { uploadRoutes } from "@/routes/upload";
import { agentRoutes } from "@/routes/agent";
import { notificationRoutes } from "@/routes/notifications";
import { adminRoutes } from "@/routes/admin";
import { db } from "@/db/client";
import { skill } from "@/db/schema";
import { eq } from "drizzle-orm";

export const routes = new Hono();

// ─── ERC-8004 agent discovery endpoint ──────────────────
routes.get("/.well-known/agent.json", async (c) => {
  const skills = await db
    .select({ id: skill.id, name: skill.name, description: skill.description, inputSources: skill.inputSources, trustScope: skill.trustScope, tools: skill.tools })
    .from(skill)
    .where(eq(skill.enabled, true));

  const base = new URL(c.req.url).origin;
  return c.json({
    "@context": "https://erc8004.org/context/v1",
    type: "AgentIndex",
    agents: skills.map(sk => ({
      id: sk.id,
      name: sk.name,
      description: sk.description ?? undefined,
      manifest: `${base}/agent/${sk.id}/manifest`,
    })),
  });
});

routes.route("/auth/siwe", siweRoutes);
routes.route("/auth", authRoutes);
routes.route("/billing", billingRoutes);
routes.route("/push", pushRoutes);
routes.route("/me", meRoutes);
routes.route("/upload", uploadRoutes);
routes.route("/agent", agentRoutes);
routes.route("/notifications", notificationRoutes);
routes.route("/admin", adminRoutes);
