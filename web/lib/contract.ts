import { createPublicClient, http, defineChain } from "viem";

export { SUBNET0_ABI } from "./abi";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
export const SUBNET0_ADDRESS = (process.env.NEXT_PUBLIC_SUBNET0_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monadscan", url: "https://testnet.monadscan.com" },
  },
});

export const publicClient = createPublicClient({
  transport: http(RPC_URL),
});

export const EXPLORER = "https://testnet.monadscan.com";
