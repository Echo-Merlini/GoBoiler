import { createHash } from "crypto";
import { db } from "@/db/client";
import { agentExecutionLog } from "@/db/schema";
import { nanoid } from "@/lib/utils";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildManifestHash(sk: {
  id: string;
  model: string;
  provider: string;
  inputSources: string | null;
  trustScope: string | null;
}): string {
  return hashContent(JSON.stringify({
    id: sk.id,
    model: sk.model,
    provider: sk.provider,
    inputSources: sk.inputSources,
    trustScope: sk.trustScope,
  }));
}

export type ExecutionEntry = {
  skillId: string;
  sessionId: string;
  userId?: string | null;
  actionType: "chat" | "tool_call" | "a2a_call";
  inputHash?: string;
  outputHash?: string | null;
  manifestHash?: string;
  sourceContext?: string | null;
  callerDepth?: number;
  errorMessage?: string | null;
  durationMs?: number;
};

// Fire-and-forget — never throws, never blocks the response path
export function logExecution(entry: ExecutionEntry): void {
  db.insert(agentExecutionLog).values({
    id: nanoid(),
    skillId: entry.skillId,
    sessionId: entry.sessionId,
    userId: entry.userId ?? null,
    actionType: entry.actionType,
    inputHash: entry.inputHash ?? null,
    outputHash: entry.outputHash ?? null,
    manifestHash: entry.manifestHash ?? null,
    sourceContext: entry.sourceContext ?? null,
    callerDepth: entry.callerDepth ?? 0,
    errorMessage: entry.errorMessage ?? null,
    durationMs: entry.durationMs ?? null,
  }).catch(() => {});
}
