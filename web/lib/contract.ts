import { createPublicClient, http, defineChain } from "viem";

export { SUBNET0_ABI } from "./abi";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
export const SUBNET0_ADDRESS = (process.env.NEXT_PUBLIC_SUBNET0_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// The chain the dapp targets. Local Anvil = 31337, Monad testnet = 10143.
export const ACTIVE_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"
);
export const ACTIVE_CHAIN_NAME = ACTIVE_CHAIN_ID === 10143 ? "Monad Testnet" : "Local Anvil";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
});

// Local chain (Anvil id 31337) defined with MON so MetaMask labels the native
// token "MON" instead of "ETH" when it adds the network from the dapp.
export const monadLocal = defineChain({
  id: 31337,
  name: "Subnet0 Local",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

export const ACTIVE_CHAIN = ACTIVE_CHAIN_ID === 10143 ? monadTestnet : monadLocal;

export const publicClient = createPublicClient({
  transport: http(RPC_URL),
});

export const EXPLORER = "https://testnet.monadscan.com";
