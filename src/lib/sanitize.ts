export type OnChainSourceType =
  | "ens_name"
  | "ens_avatar"
  | "ens_text_record"
  | "nft_metadata_name"
  | "nft_metadata_description"
  | "nft_attribute"
  | "contract_return";

const MAX_LENGTH: Record<OnChainSourceType, number> = {
  ens_name: 253,
  ens_avatar: 500,
  ens_text_record: 500,
  nft_metadata_name: 200,
  nft_metadata_description: 1000,
  nft_attribute: 300,
  contract_return: 500,
};

// Patterns an attacker would embed in on-chain strings to hijack agent reasoning
const INJECTION_PATTERN =
  /\b(ignore|disregard|override|assistant|you are now|act as|pretend\s+you|roleplay\s+as|from now on|ignore previous|your new instructions)\b|<\|im_start\|>|<\|im_end\|>|\[INST\]|\[SYS\]/gi;

// Control characters except tab (\x09), LF (\x0A), CR (\x0D)
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeOnChainInput(
  raw: string | null | undefined,
  sourceType: OnChainSourceType
): string {
  if (raw == null || raw === "") return "";

  let s = String(raw);

  // 1. Hard length cap
  const maxLen = MAX_LENGTH[sourceType];
  if (s.length > maxLen) s = s.slice(0, maxLen);

  // 2. Strip injection patterns
  s = s.replace(INJECTION_PATTERN, "[redacted]");

  // 3. Strip control characters
  s = s.replace(CONTROL_CHAR_PATTERN, "");

  // 4. Provenance label — always present so LLM knows data origin
  return `[on-chain:${sourceType}] ${s}`;
}

// Filter an object to allowed keys and sanitize each string value
export function sanitizeOnChainObject<T extends Record<string, unknown>>(
  obj: T,
  sourceType: OnChainSourceType,
  allowedKeys: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of allowedKeys) {
    if (!(key in obj)) continue;
    const val = obj[key];
    result[key] = (
      typeof val === "string" ? sanitizeOnChainInput(val, sourceType) : val
    ) as T[typeof key];
  }
  return result;
}
