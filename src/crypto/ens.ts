import { getClient } from "@/crypto/viem";
import { normalize } from "viem/ens";

// ─── Resolve ENS name → address ──────────────────────────
export async function resolveEnsName(name: string): Promise<`0x${string}` | null> {
  const client = getClient(1); // ENS lives on mainnet
  return client.getEnsAddress({ name: normalize(name) });
}

// ─── Reverse lookup: address → ENS name ─────────────────
export async function lookupEnsName(address: `0x${string}`): Promise<string | null> {
  const client = getClient(1);
  return client.getEnsName({ address });
}

// ─── Fetch ENS avatar ────────────────────────────────────
export async function getEnsAvatar(name: string): Promise<string | null> {
  const client = getClient(1);
  return client.getEnsAvatar({ name: normalize(name) });
}
