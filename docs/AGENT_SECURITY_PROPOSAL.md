# Agent Security Proposal: On-Chain Input Trust Boundaries for ERC-8004

**Author:** Tiago Merlini Ferrão / dinamic.eth  
**Status:** 🟡 Draft — Pre-Implementation  
**Type:** Security Standard / ERC-8004 Companion  
**Created:** 2026-05-13  
**Forum:** Ethereum Magicians — reply to ERC-8004 thread (pending post)  
**Implementation:** GoBoiler (`/src/lib/sanitize.ts`, `/src/lib/a2a-trust.ts`, `/src/lib/attestation.ts`)

---

## Abstract

AI agents built on ERC-8004 read on-chain data (ENS text records, NFT metadata, contract return values) as context for their reasoning loops. Unlike off-chain injection vectors, on-chain data is **permanent and immutable** — a poisoned payload persists indefinitely and cannot be patched. This proposal defines three security primitives missing from the current ERC-8004 stack:

1. **Input Trust Boundaries** — mandatory sanitization and source declaration for on-chain data entering agent context
2. **A2A Trust Scope** — explicit limits on inter-agent trust transitivity to prevent cascade failures
3. **Execution Attestation** — lightweight proof that a running agent follows its declared manifest

dinamic.eth is implementing these primitives in GoBoiler and proposing them as a companion standard or amendment to ERC-8004.

---

## Motivation

### The Prompt Injection Problem (Already Exploited)

Prompt injection in AI agents is documented and live: the Base/Bankr incident (SlowMist, Q1 2025) resulted in $150k+ losses via off-chain injection. On-chain injection is categorically worse:

| Property | Off-chain injection | On-chain injection |
|----------|--------------------|--------------------|
| Persistence | Temporary | **Permanent** |
| Patchable | Yes (rotate API, fix endpoint) | **No** |
| Scope | Single request | **Every future agent that reads the field** |
| Attribution | Traceable to attacker | Traceable but unremovable |

An ENS text record or NFT attribute containing adversarial instructions affects every agent that reads it as context — now and for the lifetime of the chain.

### The Trust Chain Problem (Not Yet Addressed)

ERC-8126 covers agent identity. ERC-8118 covers agent authorisation. Neither addresses what happens when agents form hierarchies. As registries grow (dinamic.eth currently has Pixel Goblins, Goblinarinos, and Sproto Gremlins), a single compromised agent can propagate malicious instructions to every agent downstream that trusts it. There is no current mechanism to cap this blast radius.

### The Manifest/Execution Gap

ERC-8004 defines what an agent *should* do. Nothing currently proves the running agent *actually* follows its manifest. An actor can register a legitimate manifest and run a different agent under it.

---

## Specification

### 1. Input Trust Boundaries

#### 1.1 Input Source Declaration (`inputSources`)

Every ERC-8004 agent manifest MUST include an `inputSources` array declaring every on-chain data source the agent reads:

```json
{
  "inputSources": [
    {
      "type": "own-manifest",
      "trust": "trusted",
      "sanitize": false
    },
    {
      "type": "ens",
      "keys": ["name", "avatar"],
      "trust": "untrusted",
      "sanitize": true,
      "maxLength": 500
    },
    {
      "type": "nft-metadata",
      "contract": "0x...",
      "fields": ["name", "description", "attributes"],
      "trust": "untrusted",
      "sanitize": true,
      "maxLength": 1000
    }
  ]
}
```

**Rules:**
- Any source not declared in `inputSources` MUST be rejected at runtime
- Sources with `trust: "untrusted"` MUST be sanitized before entering the reasoning loop
- `own-manifest` is the only source that may carry `trust: "trusted"` by default

#### 1.2 Sanitization Requirements

On-chain strings classified as untrusted MUST pass through a sanitization layer before entering LLM context. Required steps in order:

1. **Length enforcement** — truncate to `maxLength` (hard cap, no truncation indicators)
2. **Instruction pattern stripping** — remove strings matching injection signatures:
   - `ignore`, `disregard`, `override`, `system`, `assistant`
   - `<|im_start|>`, `<|im_end|>`, `[INST]`, `[SYS]`
   - `you are now`, `act as`, `pretend you`, `roleplay as`
   - `ignore previous`, `from now on`, `your new instructions`
3. **Control character removal** — strip `\x00-\x08`, `\x0E-\x1F`, `\x7F`
4. **Provenance labelling** — prefix with `[on-chain:{sourceType}]` so the LLM always sees data origin

#### 1.3 Field Allowlists

Agents MUST only read declared fields from each source. Default allowlists:

| Source type | Allowed fields |
|-------------|---------------|
| `ens` | `name`, `avatar`, `description` |
| `nft-metadata` | `name`, `description`, `image`, `attributes` |
| `contract-return` | raw string (max 500 chars) |

Any field not in the allowlist is dropped silently, not passed to the agent.

---

### 2. A2A Trust Scope

#### 2.1 Trust Scope Declaration (`trustScope`)

Every ERC-8004 manifest MUST include a `trustScope` object:

```json
{
  "trustScope": {
    "transitive": false,
    "maxDepth": 1,
    "capabilities": ["read", "respond"]
  }
}
```

**Fields:**
- `transitive` (bool) — whether this agent can relay trust to downstream agents. Default: `false`.
- `maxDepth` (int) — maximum hop count from original human request. `0` = cannot call other agents. Default: `0`.
- `capabilities` (string[]) — tool names this agent is authorized to invoke when called by another agent.

#### 2.2 A2A Request Headers

When an agent calls another agent, it MUST include:

```
X-Agent-Caller-Id: <calling agent's skill ID>
X-Agent-Depth: <integer hop count from original human>
X-Agent-Capabilities: <comma-separated granted capabilities>
```

#### 2.3 Trust Validation Rules

The receiving agent MUST reject the request if any of:
- `X-Agent-Depth >= targetAgent.trustScope.maxDepth`
- Calling agent's `trustScope.transitive === false` AND `X-Agent-Depth > 0`
- Requested capability is not in `targetAgent.trustScope.capabilities`

Human callers bypass A2A trust checks entirely (detected by absence of `X-Agent-Caller-Id` or non-agent key type).

---

### 3. Execution Attestation

#### 3.1 Execution Log Entry

After each significant action, the agent MUST record:

```typescript
{
  agentId: string           // skill ID
  sessionId: string
  actionType: string        // "chat" | "tool_call" | "a2a_call"
  inputHash: string         // SHA-256 of sanitized input
  outputHash: string        // SHA-256 of reply (null if error)
  manifestHash: string      // SHA-256 of JSON.stringify(manifest at call time)
  callerDepth: number
  durationMs: number
  timestamp: ISO8601
}
```

#### 3.2 Attestation Endpoint

Agents implementing this standard MUST expose:

```
GET /agents/:agentId/attestations
```

Returning the last N execution log entries. This allows anyone to verify:
- Was the agent running the manifest it claimed?
- Did it process the inputs it received?
- Did it produce outputs consistent with its declared capabilities?

---

## Backwards Compatibility

- `inputSources: null` — treated as "unscoped, sanitize all, log warning." Existing skills continue to function.
- `trustScope: null` — treated as `{ transitive: false, maxDepth: 0, capabilities: [] }`. Human callers unaffected.
- All new manifest fields are additive. No existing ERC-8004 manifest becomes invalid.
- API keys without `keyType` default to `"user"` — no existing key breaks.

---

## Implementation Status

### GoBoiler (dinamic.eth reference implementation)

| Phase | Description | Status | Files |
|-------|-------------|--------|-------|
| 1 | Input sanitization middleware | 🔴 Not started | `src/lib/sanitize.ts` (new), `src/crypto/ens.ts`, `src/lib/skills.ts` |
| 2 | `inputSources` schema + runtime enforcement | 🔴 Not started | `src/db/schema.ts`, `src/lib/skills.ts`, `src/routes/admin.ts`, `admin/app.tsx` |
| 3 | ERC-8004 manifest endpoints | 🔴 Not started | `src/routes/agent.ts`, `src/index.ts` |
| 4 | A2A trust scope + API key types | 🔴 Not started | `src/lib/a2a-trust.ts` (new), `src/db/schema.ts`, `src/routes/agent.ts`, `admin/app.tsx` |
| 5 | Execution attestation log | 🔴 Not started | `src/lib/attestation.ts` (new), `src/db/schema.ts`, `src/lib/skills.ts`, `src/routes/agent.ts` |

### Forum / Standard Track

| Action | Status |
|--------|--------|
| Identify gaps in ERC-8004, ERC-8126, ERC-8118 | ✅ Done |
| Validate concern with Ethereum community | ✅ Validated — confirmed serious, not addressed |
| Draft Ethereum Magicians reply (ERC-8004 thread) | ✅ Written, pending post |
| Post to Ethereum Magicians | 🔴 Pending (need topic posting rights) |
| Post to Farcaster for reach | 🔴 Pending |
| ENS Forum reply (jkm.eth thread) | 🔴 Pending (link to EM post once live) |
| Formal EIP/ERC draft | 🔴 Future — after reference implementation exists |

---

## Risk Assessment for GoBoiler Implementation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Phase 1 breaks existing ENS reads | Low | Sanitizer is additive — addresses pass format-only check, not content strip |
| Schema migration fails | Very low | Only `ADD COLUMN` with nullable defaults — fully reversible |
| Phase 4 locks out existing agent keys | Low | `keyType` defaults to `"user"` — existing keys unaffected |
| `logExecution` slows down chat | Very low | Fire-and-forget with `.catch(() => {})` — never blocks response path |
| Sanitizer over-strips legitimate content | Medium | Monitor `[redacted]` frequency in conversation table after Phase 1 deploy |

**Safe order to deploy:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5  
Each phase is independently deployable and independently reversible.

---

## TODO Before Marking Complete

- [ ] Phase 1: Write and test `sanitize.ts` unit tests before deploying
- [ ] Phase 1: Verify existing ENS/avatar reads still work after wrapping
- [ ] Phase 2: Run `bun run db:generate` and review migration SQL before applying
- [ ] Phase 2: Test backward compat — existing skills with `inputSources: null` still chat normally
- [ ] Phase 3: Validate manifest JSON against ERC-8004 spec shape
- [ ] Phase 3: Test `/.well-known/agent.json` with an ENS client
- [ ] Phase 4: Issue a test agent API key, confirm trust check fires
- [ ] Phase 4: Confirm human sessions bypass A2A check entirely
- [ ] Phase 5: Verify attestation rows appear in DB after a chat call
- [ ] Phase 5: Confirm `logExecution` failure never surfaces to the API caller
- [ ] Post Ethereum Magicians reply once topic rights are available
- [ ] Reference this implementation in the forum post as proof-of-concept
- [ ] Propose as formal ERC once all 5 phases are live and stable

---

## References

- [ERC-8004 Trustless Agents](https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098)
- [ERC-8126 AI Agent Verification](https://ethereum-magicians.org/t/erc-8126-ai-agent-verification/27445)
- [ERC-8118 Agent Authorization](https://ethereum-magicians.org/t/erc-8118-agent-authorization/27402)
- [ERC-8001 Secure Intents](https://ethereum-magicians.org/t/erc-8001-secure-intents-a-cryptographic-framework-for-autonomous-agent-coordination/24989)
- [ENSIP-25 Verifiable AI Agent Identity](https://ens.domains/blog/post/ens-ai-agent-erc8004)
- [SlowMist: Base/Bankr Prompt Injection (2025)](https://slowmist.com)
- [arXiv 2601.04583 — Autonomous Agents on Blockchains](https://arxiv.org/pdf/2601.04583)
