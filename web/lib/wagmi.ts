import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { monadLocal, monadTestnet, RPC_URL } from "./contract";

export const config = createConfig({
  chains: [monadTestnet, monadLocal],
  connectors: [injected()],
  transports: {
    [monadTestnet.id]: http(),
    [monadLocal.id]: http(RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
