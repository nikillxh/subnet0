"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME } from "@/lib/contract";

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
      <button className="btn" disabled={isPending || !injected} onClick={() => connect({ connector: injected })}>
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  if (chainId !== ACTIVE_CHAIN_ID) {
    return (
      <button className="btn warn" onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID as 10143 | 31337 })}>
        Switch to {ACTIVE_CHAIN_NAME}
      </button>
    );
  }

  return (
    <button className="btn ghost" onClick={() => disconnect()} title="Disconnect">
      {short(address)}
    </button>
  );
}
