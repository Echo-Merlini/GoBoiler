import { Hono } from "hono";
import { requireAuth } from "@/auth/middleware";
import { listEnabledSkills, runSkill, getConversation } from "@/lib/skills";
import { parseA2AContext, validateA2ATrust } from "@/lib/a2a-trust";
import { db } from "@/db/client";
import { skill, apiKey, agentExecutionLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "@/lib/utils";

export const agentRoutes = new Hono();

// ─── Public: list enabled skills ────────────────────────
agentRoutes.get("/skills", requireAuth, async (c) => {
  const skills = await listEnabledSkills();
  return c.json(skills);
});

// ─── Public: ERC-8004 manifest for a skill ───────────────
agentRoutes.get("/:skillId/manifest", async (c) => {
  const [sk] = await db.select().from(skill).where(eq(skill.id, c.req.param("skillId")));
  if (!sk || !sk.enabled) return c.json({ error: "Not found" }, 404);

  const tools = sk.tools ? JSON.parse(sk.tools) : [];
  const manifest = {
    "@context": "https://erc8004.org/context/v1",
    type: "Agent",
    id: sk.id,
    name: sk.name,
    description: sk.description ?? undefined,
    inputSources: sk.inputSources ? JSON.parse(sk.inputSources) : null,
    trustScope: sk.trustScope
      ? JSON.parse(sk.trustScope)
      : { transitive: false, maxDepth: 0, capabilities: [] },
    capabilities: tools.map((t: any) => t.name ?? t.function?.name).filter(Boolean),
  };

  return c.json(manifest);
});

// ─── Attestations for a skill ────────────────────────────
agentRoutes.get("/:skillId/attestations", requireAuth, async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const skillId = c.req.param("skillId");
  const rows = await db
    .select()
    .from(agentExecutionLog)
    .where(eq(agentExecutionLog.skillId, skillId))
    .orderBy(desc(agentExecutionLog.createdAt))
    .limit(limit);
  return c.json(rows);
});

// ─── Chat with a skill ───────────────────────────────────
agentRoutes.post("/chat", requireAuth, async (c) => {
  const body = await c.req.json<{ skillId: string; message: string; sessionId?: string }>();
  if (!body.skillId || !body.message?.trim()) {
    return c.json({ error: "skillId and message are required" }, 400);
  }

  // A2A trust check: only fires when caller presents an agent API key
  const authHeader = c.req.header("authorization") ?? "";
  if (authHeader.startsWith("Bearer gbk_")) {
    const rawKey = authHeader.slice(7);
    const { createHash } = await import("crypto");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const [keyRecord] = await db.select({ keyType: apiKey.keyType }).from(apiKey).where(eq(apiKey.keyHash, keyHash));

    if (keyRecord?.keyType === "agent") {
      const a2aCtx = parseA2AContext(c.req.raw.headers);
      if (a2aCtx) {
        try {
          await validateA2ATrust(body.skillId, a2aCtx);
        } catch (e: any) {
          return c.json({ error: e.message }, e.status ?? 403);
        }
      }
    }
  }

  const u = c.get("user") as { id: string };
  const sessionId = body.sessionId ?? nanoid();
  try {
    const result = await runSkill(body.skillId, body.message.trim(), sessionId, u.id);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ─── Conversation history ────────────────────────────────
agentRoutes.get("/history/:sessionId", requireAuth, async (c) => {
  const conv = await getConversation(c.req.param("sessionId")!);
  if (!conv) return c.json({ error: "Not found" }, 404);
  return c.json(conv);
});
