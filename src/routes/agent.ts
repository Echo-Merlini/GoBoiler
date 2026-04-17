import { Hono } from "hono";
import { requireAuth } from "@/auth/middleware";
import { listEnabledSkills, runSkill, getConversation } from "@/lib/skills";
import { nanoid } from "@/lib/utils";

export const agentRoutes = new Hono();

// List all enabled skills (public — clients need to know which skills exist)
agentRoutes.get("/skills", requireAuth, async (c) => {
  const skills = await listEnabledSkills();
  return c.json(skills);
});

// Chat with a skill
agentRoutes.post("/chat", requireAuth, async (c) => {
  const body = await c.req.json<{ skillId: string; message: string; sessionId?: string }>();
  if (!body.skillId || !body.message?.trim()) {
    return c.json({ error: "skillId and message are required" }, 400);
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

// Get conversation history
agentRoutes.get("/history/:sessionId", requireAuth, async (c) => {
  const conv = await getConversation(c.req.param("sessionId"));
  if (!conv) return c.json({ error: "Not found" }, 404);
  return c.json(conv);
});
