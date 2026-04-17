import { createPublicClient, http } from "viem";
import { mainnet, base, polygon, optimism, arbitrum } from "viem/chains";

const PUBLIC_FALLBACKS: Record<number, string> = {
  1:     "https://eth.llamarpc.com",
  8453:  "https://mainnet.base.org",
  137:   "https://polygon-rpc.com",
  10:    "https://mainnet.optimism.io",
  42161: "https://arb1.arbitrum.io/rpc",
};

function rpcUrl(chainId: number, envVar: string | undefined): string | undefined {
  if (envVar) return envVar;
  const fallback = PUBLIC_FALLBACKS[chainId];
  console.warn(`⚠  Chain ${chainId}: no RPC configured — using public fallback ${fallback}. Set a dedicated RPC in production.`);
  return fallback;
}

// ─── Multi-chain public clients ──────────────────────────
export const clients = {
  1:     createPublicClient({ chain: mainnet, transport: http(rpcUrl(1,     process.env.ETH_RPC_URL)) }),
  8453:  createPublicClient({ chain: base,    transport: http(rpcUrl(8453,  process.env.BASE_RPC_URL)) }),
  137:   createPublicClient({ chain: polygon,  transport: http(rpcUrl(137,   process.env.POLYGON_RPC_URL)) }),
  10:    createPublicClient({ chain: optimism, transport: http(rpcUrl(10,    process.env.OPTIMISM_RPC_URL)) }),
  42161: createPublicClient({ chain: arbitrum, transport: http(rpcUrl(42161, process.env.ARBITRUM_RPC_URL)) }),
} as const;

export type SupportedChainId = keyof typeof clients;

export function getClient(chainId: number) {
  const client = clients[chainId as SupportedChainId];
  if (!client) throw new Error(`Unsupported chainId: ${chainId}`);
  return client;
}
