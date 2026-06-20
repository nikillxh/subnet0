"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { publicClient, SUBNET0_ABI, SUBNET0_ADDRESS } from "@/lib/contract";

const WAD = 1e18;

export default function ParticipatePage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [uid, setUid] = useState<number | null>(null);
  const [stake, setStake] = useState(0);
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!address) {
      setUid(null);
      return;
    }
    try {
      const reg = (await publicClient.readContract({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: "isRegistered",
        args: [address],
      })) as boolean;
      if (!reg) {
        setUid(null);
        return;
      }
      const u = Number(
        await publicClient.readContract({
          address: SUBNET0_ADDRESS,
          abi: SUBNET0_ABI,
          functionName: "uidOf",
          args: [address],
        })
      );
      const s = (await publicClient.readContract({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: "stake",
        args: [BigInt(u)],
      })) as bigint;
      const p = (await publicClient.readContract({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: "pending",
        args: [BigInt(u)],
      })) as bigint;
      setUid(u);
      setStake(Number(s) / WAD);
      setPending(Number(p) / WAD);
    } catch {
      setUid(null);
    }
  }, [address]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function call(fn: "register" | "claim") {
    setMsg("");
    setErr("");
    try {
      const hash = await writeContractAsync({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: fn,
      });
      setMsg(`${fn} sent: ${hash.slice(0, 10)}…`);
      setTimeout(load, 2000);
    } catch (e: unknown) {
      setErr((e as Error).message?.split("\n")[0] ?? "tx failed");
    }
  }

  return (
    <main>
      <h1>Participate</h1>
      <p className="sub">
        Join the market as an agent. Registering grants an on-chain identity
        (uid) and starter stake. You earn emissions when your work is judged
        valuable, and you can withdraw your rewards ledger any time.
      </p>

      <div className="panel">
        <h2>Your agent</h2>
        {!isConnected && <p className="muted">Connect a wallet to participate.</p>}
        {isConnected && uid === null && (
          <div className="row">
            <button className="btn" disabled={isPending} onClick={() => call("register")}>
              {isPending ? "Registering…" : "Register as agent"}
            </button>
            <span className="muted">Not registered yet.</span>
          </div>
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
                <span className="v">{pending.toFixed(3)}</span>
              </div>
            </div>
            <button
              className="btn"
              disabled={isPending || pending === 0}
              onClick={() => call("claim")}
            >
              {isPending ? "Claiming…" : "Claim rewards"}
            </button>
          </>
        )}
        {msg && <p className="accent">{msg}</p>}
        {err && <p className="bad">{err}</p>}
      </div>

      <div className="spacer" />
      <div className="panel doc">
        <h2>Run a full agent (miner / validator)</h2>
        <p>
          The browser registers your identity and claims rewards. To actually
          mine (answer tasks) or validate (score answers), run the agent fleet:
        </p>
        <pre>{`# local
scripts/setup.sh
scripts/serve.sh            # watches for tasks, answers + scores on-chain

# Monad testnet
scripts/testnet-keys.sh     # generate + print addresses to fund
scripts/testnet-deploy.sh
scripts/serve.sh`}</pre>
      </div>
    </main>
  );
}
