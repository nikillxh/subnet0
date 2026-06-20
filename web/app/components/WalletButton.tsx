"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monadTestnet } from "@/lib/contract";

function short(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button className="btn" disabled={isPending} onClick={() => connect({ connector: injected })}>
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  const wrongChain = chainId !== monadTestnet.id && chainId !== 31337;
  if (wrongChain) {
    return (
      <button className="btn warn" onClick={() => switchChain({ chainId: monadTestnet.id })}>
        Switch to Monad
      </button>
    );
  }

  return (
    <button className="btn ghost" onClick={() => disconnect()} title="Disconnect">
      {short(address)}
    </button>
  );
}
