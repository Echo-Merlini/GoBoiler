import { db } from "@/db/client";
import { skill, conversation, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "@/lib/utils";

export type Message = { role: "user" | "assistant" | "system"; content: string };

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

async function getApiKey(provider: string): Promise<string | null> {
  const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
  };
  const dbMap: Record<string, string> = {
    anthropic: "anthropic_api_key",
    openai: "openai_api_key",
    groq: "groq_api_key",
    mistral: "mistral_api_key",
  };
  return process.env[envMap[provider]] ?? (await getSetting(dbMap[provider]));
}

export async function listEnabledSkills() {
  return db.select({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    provider: skill.provider,
    model: skill.model,
  }).from(skill).where(eq(skill.enabled, true));
}

export async function runSkill(
  skillId: string,
  userMessage: string,
  sessionId: string,
  userId?: string
): Promise<{ reply: string; sessionId: string; usage?: Record<string, number> }> {
  const [sk] = await db.select().from(skill).where(eq(skill.id, skillId));
  if (!sk || !sk.enabled) throw new Error("Skill not found or disabled");

  const apiKey = await getApiKey(sk.provider);
  if (!apiKey) throw new Error(`No API key configured for provider: ${sk.provider}`);

  // Load conversation history
  const [existing] = await db.select().from(conversation).where(eq(conversation.sessionId, sessionId));
  const history: Message[] = existing ? JSON.parse(existing.messages) : [];
  const newUserMsg: Message = { role: "user", content: userMessage };
  const tools = sk.tools ? JSON.parse(sk.tools) : [];

  let reply = "";
  let usage: Record<string, number> | undefined;

  if (sk.provider === "anthropic") {
    const msgs = [...history, newUserMsg].filter(m => m.role !== "system");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: sk.model,
        max_tokens: sk.maxTokens,
        system: sk.systemPrompt,
        messages: msgs,
        ...(tools.length ? { tools } : {}),
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Anthropic error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const d: any = await res.json();
    reply = d.content?.[0]?.text ?? "";
    usage = { input: d.usage?.input_tokens ?? 0, output: d.usage?.output_tokens ?? 0 };

  } else if (sk.provider === "openai" || sk.provider === "groq") {
    const base = sk.provider === "groq" ? "https://api.groq.com/openai" : "https://api.openai.com";
    const messages: Message[] = [{ role: "system", content: sk.systemPrompt }, ...history, newUserMsg];
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: sk.model,
        max_tokens: sk.maxTokens,
        temperature: parseFloat(sk.temperature),
        messages,
        ...(tools.length ? { tools, tool_choice: "auto" } : {}),
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`${sk.provider} error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const d: any = await res.json();
    reply = d.choices?.[0]?.message?.content ?? "";
    usage = { input: d.usage?.prompt_tokens ?? 0, output: d.usage?.completion_tokens ?? 0 };

  } else if (sk.provider === "mistral") {
    const messages: Message[] = [{ role: "system", content: sk.systemPrompt }, ...history, newUserMsg];
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: sk.model,
        max_tokens: sk.maxTokens,
        temperature: parseFloat(sk.temperature),
        messages,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Mistral error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const d: any = await res.json();
    reply = d.choices?.[0]?.message?.content ?? "";
    usage = { input: d.usage?.prompt_tokens ?? 0, output: d.usage?.completion_tokens ?? 0 };
  } else {
    throw new Error(`Unsupported provider: ${sk.provider}`);
  }

  // Persist conversation
  const updatedMessages: Message[] = [...history, newUserMsg, { role: "assistant", content: reply }];
  if (existing) {
    await db.update(conversation)
      .set({ messages: JSON.stringify(updatedMessages), updatedAt: new Date() })
      .where(eq(conversation.sessionId, sessionId));
  } else {
    await db.insert(conversation).values({
      id: nanoid(),
      skillId,
      userId: userId ?? null,
      sessionId,
      messages: JSON.stringify(updatedMessages),
    });
  }

  return { reply, sessionId, usage };
}

export async function getConversation(sessionId: string) {
  const [row] = await db.select().from(conversation).where(eq(conversation.sessionId, sessionId));
  if (!row) return null;
  return { ...row, messages: JSON.parse(row.messages) as Message[] };
}
