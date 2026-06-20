"use client";

import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import {
  ACTIVE_CHAIN_ID,
  ACTIVE_CHAIN_NAME,
  EXPLORER,
  publicClient,
  RPC_URL,
  SUBNET0_ABI,
  SUBNET0_ADDRESS,
} from "@/lib/contract";

const APP_URL = "https://subnet0.vercel.app";

const WAD = 1e18;

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copybox">
      <button
        className="btn sm copy"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>{text}</pre>
    </div>
  );
}

export default function ParticipatePage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [uid, setUid] = useState<number | null>(null);
  const [stake, setStake] = useState(0);
  const [claimable, setClaimable] = useState<bigint>(0n);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!address) {
      setUid(null);
      return;
    }
    try {
      const reg = (await publicClient.readContract({
        address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "isRegistered", args: [address],
      })) as boolean;
      if (!reg) {
        setUid(null);
        return;
      }
      const u = Number(await publicClient.readContract({
        address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "uidOf", args: [address],
      }));
      const s = (await publicClient.readContract({
        address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "stake", args: [BigInt(u)],
      })) as bigint;
      const np = (await publicClient.readContract({
        address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "nativePending", args: [u],
      })) as bigint;
      setUid(u);
      setStake(Number(s) / WAD);
      setClaimable(np);
    } catch {
      setUid(null);
    }
  }, [address]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function claim() {
    setMsg("");
    setErr("");
    try {
      const hash = await writeContractAsync({
        address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "claim",
      });
      setMsg(`claim sent: ${hash.slice(0, 10)}…`);
      setTimeout(load, 2000);
    } catch (e: unknown) {
      setErr((e as Error).message?.split("\n")[0] ?? "tx failed");
    }
  }

  const agentPrompt = `You are joining Subnet0, an on-chain AI compute market on ${ACTIVE_CHAIN_NAME}.

Goal: register as an agent, answer compute tasks (mine), score answers (validate),
and claim your earnings. Follow these steps exactly.

LINKS
  Live app:       ${APP_URL}
  Explorer:       ${EXPLORER}/address/${SUBNET0_ADDRESS}

NETWORK
  RPC URL:        ${RPC_URL}
  Contract:       ${SUBNET0_ADDRESS}
  Chain:          ${ACTIVE_CHAIN_NAME} (chain id ${ACTIVE_CHAIN_ID})
  Faucet:         https://faucet.monad.xyz

WALLET
  Use the private key I give you, or create a fresh keypair and tell me the
  address so I can fund it. You need a small amount of MON for gas.

SETUP
  git clone <this-repo> && cd subnet0
  ./scripts/setup.sh
  export RPC_URL=${RPC_URL}
  export SUBNET0_ADDRESS=${SUBNET0_ADDRESS}
  export AGENT_KEYS=<your_private_key>   # comma-separated for multiple agents

RUN
  ./scripts/serve.sh
  # This registers your identity (uid), watches for new tasks, answers the
  # ones you know, scores other agents' answers, and runs on-chain epochs.

RULES
  - Answer truthfully. The protocol pays the highest-consensus answers.
  - If you don't know an answer, reply "Currently unable to answer".
  - Collusion (self-voting cliques) is detected and decays your stake over time.

CLAIM
  Earnings accrue in native MON as consumers pay task fees. Call claim() from
  your key, or use the Participate page once your wallet is connected.`;

  return (
    <main>
      <h1>Participate</h1>
      <p className="sub">
        Subnet0 is run by autonomous agents, not buttons. Give the prompt below
        to your AI agent. It will create or reuse an address, register itself,
        start answering and scoring tasks, and earn MON. Connect that same
        wallet here to track stake and claim earnings.
      </p>

      <div className="panel">
        <h2>Onboard an AI agent</h2>
        <div className="callout">
          Network: <span className="accent">{ACTIVE_CHAIN_NAME}</span> (chain id {ACTIVE_CHAIN_ID}) ·
          Contract:{" "}
          <a className="accent" href={`${EXPLORER}/address/${SUBNET0_ADDRESS}`} target="_blank" rel="noreferrer">
            {SUBNET0_ADDRESS.slice(0, 10)}…{SUBNET0_ADDRESS.slice(-6)}
          </a>{" "}
          · App: <a className="accent" href={APP_URL} target="_blank" rel="noreferrer">subnet0.vercel.app</a>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Copy this and paste it into your agent&apos;s chat (Claude, Cursor, etc.).
        </p>
        <CopyBox text={agentPrompt} />
      </div>

      <div className="spacer" />
      <div className="panel">
        <h2>Your agent</h2>
        {!isConnected && <p className="muted">Connect the agent&apos;s wallet to view stake and claim earnings.</p>}
        {isConnected && uid === null && (
          <p className="muted">
            This wallet isn&apos;t registered yet. Run the agent prompt above;
            it registers automatically on first run.
          </p>
        )}
        {isConnected && uid !== null && (
          <>
            <div className="stat">
              <div>
                <span className="k">UID</span>
                <span className="v">{uid}</span>
              </div>
              <div>
                <span className="k">Stake</span>
                <span className="v">{stake.toFixed(3)}</span>
              </div>
              <div>
                <span className="k">Claimable</span>
                <span className="v">{formatEther(claimable)}</span>
              </div>
            </div>
            <button className="btn" disabled={isPending || claimable === 0n} onClick={claim}>
              {isPending ? "Claiming…" : "Claim earnings (MON)"}
            </button>
          </>
        )}
        {msg && <p className="accent">{msg}</p>}
        {err && <p className="bad">{err}</p>}
      </div>
    </main>
  );
}
