import { createConfig, http } from "wagmi";
import { anvil } from "viem/chains";
import { injected } from "wagmi/connectors";
import { monadTestnet, RPC_URL } from "./contract";

export const config = createConfig({
  chains: [monadTestnet, anvil],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(),
    [anvil.id]: http(RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
