import { getClient } from "@/crypto/viem";
import type { Context, Next } from "hono";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ERC721_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── Check ERC20 balance ─────────────────────────────────
export async function getERC20Balance({
  contractAddress,
  walletAddress,
  chainId = 1,
}: {
  contractAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  chainId?: number;
}): Promise<bigint> {
  const client = getClient(chainId);
  return client.readContract({
    address: contractAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });
}

// ─── Check ERC721 balance (NFT ownership) ───────────────
export async function getERC721Balance({
  contractAddress,
  walletAddress,
  chainId = 1,
}: {
  contractAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  chainId?: number;
}): Promise<bigint> {
  const client = getClient(chainId);
  return client.readContract({
    address: contractAddress,
    abi: ERC721_ABI,
    functionName: "balanceOf",
    args: [walletAddress],
  });
}

// ─── Middleware factory: require min token balance ───────
export function tokenGate({
  contractAddress,
  minBalance = 1n,
  chainId = 1,
  standard = "ERC721",
}: {
  contractAddress: `0x${string}`;
  minBalance?: bigint;
  chainId?: number;
  standard?: "ERC20" | "ERC721";
}) {
  return async (c: Context, next: Next) => {
    const u = c.get("user") as { walletAddress?: string } | undefined;
    if (!u?.walletAddress) return c.json({ error: "No wallet linked" }, 403);

    const address = u.walletAddress as `0x${string}`;
    const balance =
      standard === "ERC20"
        ? await getERC20Balance({ contractAddress, walletAddress: address, chainId })
        : await getERC721Balance({ contractAddress, walletAddress: address, chainId });

    if (balance < minBalance) {
      return c.json({ error: "Insufficient token balance", required: minBalance.toString() }, 403);
    }

    c.set("hasToken", true);
    c.set("tokenBalance", balance.toString());
    await next();
  };
}
