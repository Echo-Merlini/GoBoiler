import { db } from "@/db/client";
import { skill } from "@/db/schema";
import type { TrustScope } from "@/db/schema";
import { eq } from "drizzle-orm";

export type A2ACallContext = {
  callerId: string;
  depth: number;
  capabilities: string[];
};

export function parseA2AContext(headers: Headers): A2ACallContext | null {
  const callerId = headers.get("x-agent-caller-id");
  if (!callerId) return null;

  const depth = parseInt(headers.get("x-agent-depth") ?? "0", 10);
  const caps  = (headers.get("x-agent-capabilities") ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  return { callerId, depth, capabilities: caps };
}

const DEFAULT_TRUST_SCOPE: TrustScope = {
  transitive: false,
  maxDepth: 0,
  capabilities: [],
};

export async function validateA2ATrust(
  targetSkillId: string,
  ctx: A2ACallContext
): Promise<void> {
  const [sk] = await db
    .select({ trustScope: skill.trustScope })
    .from(skill)
    .where(eq(skill.id, targetSkillId));

  if (!sk) throw Object.assign(new Error("Skill not found"), { status: 404 });

  const scope: TrustScope = sk.trustScope
    ? JSON.parse(sk.trustScope)
    : DEFAULT_TRUST_SCOPE;

  if (ctx.depth >= scope.maxDepth) {
    throw Object.assign(
      new Error(`A2A depth ${ctx.depth} exceeds maxDepth ${scope.maxDepth}`),
      { status: 403 }
    );
  }

  if (!scope.transitive && ctx.depth > 0) {
    throw Object.assign(
      new Error("Calling agent is not allowed to relay trust (transitive: false)"),
      { status: 403 }
    );
  }

  for (const cap of ctx.capabilities) {
    if (!scope.capabilities.includes(cap)) {
      throw Object.assign(
        new Error(`Capability "${cap}" not in target skill trustScope`),
        { status: 403 }
      );
    }
  }
}
