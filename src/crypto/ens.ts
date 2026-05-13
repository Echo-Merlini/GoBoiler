import { getClient } from "@/crypto/viem";
import { normalize } from "viem/ens";
import { sanitizeOnChainInput } from "@/lib/sanitize";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// ─── Resolve ENS name → address ──────────────────────────
export async function resolveEnsName(name: string): Promise<`0x${string}` | null> {
  const client = getClient(1); // ENS lives on mainnet
  const addr = await client.getEnsAddress({ name: normalize(name) });
  if (addr && !ETH_ADDRESS_RE.test(addr)) return null;
  return addr;
}

// ─── Reverse lookup: address → ENS name ─────────────────
export async function lookupEnsName(address: `0x${string}`): Promise<string | null> {
  const client = getClient(1);
  const name = await client.getEnsName({ address });
  if (!name) return null;
  return sanitizeOnChainInput(name, "ens_name");
}

// ─── Fetch ENS avatar ────────────────────────────────────
export async function getEnsAvatar(name: string): Promise<string | null> {
  const client = getClient(1);
  const avatar = await client.getEnsAvatar({ name: normalize(name) });
  if (!avatar) return null;
  return sanitizeOnChainInput(avatar, "ens_avatar");
}

// ─── Fetch arbitrary ENS text record ─────────────────────
export async function getEnsTextRecord(name: string, key: string): Promise<string | null> {
  const client = getClient(1);
  const value = await client.getEnsText({ name: normalize(name), key });
  if (!value) return null;
  return sanitizeOnChainInput(value, "ens_text_record");
}
