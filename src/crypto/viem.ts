import { createPublicClient, http } from "viem";
import { mainnet, base, polygon, optimism, arbitrum } from "viem/chains";

// ─── Multi-chain public clients ──────────────────────────
// Add or remove chains as needed per project
export const clients = {
  1: createPublicClient({ chain: mainnet, transport: http(process.env.ETH_RPC_URL) }),
  8453: createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL) }),
  137: createPublicClient({ chain: polygon, transport: http(process.env.POLYGON_RPC_URL) }),
  10: createPublicClient({ chain: optimism, transport: http() }),
  42161: createPublicClient({ chain: arbitrum, transport: http() }),
} as const;

export type SupportedChainId = keyof typeof clients;

export function getClient(chainId: number) {
  const client = clients[chainId as SupportedChainId];
  if (!client) throw new Error(`Unsupported chainId: ${chainId}`);
  return client;
}
