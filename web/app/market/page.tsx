"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import {
  publicClient,
  SUBNET0_ABI,
  SUBNET0_ADDRESS,
} from "@/lib/contract";

const WAD = 1e18;

type TaskView = {
  id: number;
  requester: string;
  prompt: string;
  answers: { uid: number; text: string; consensus: number }[];
};

export default function MarketPage() {
  const { isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [err, setErr] = useState("");
  const [txMsg, setTxMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const count = Number(
        await publicClient.readContract({
          address: SUBNET0_ADDRESS,
          abi: SUBNET0_ABI,
          functionName: "taskCount",
        })
      );
      const consensus = (await publicClient.readContract({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: "getConsensus",
      })) as readonly bigint[];

      const ids = Array.from({ length: count }, (_, i) => i)
        .reverse()
        .slice(0, 10);
      const out: TaskView[] = [];
      for (const id of ids) {
        const t = (await publicClient.readContract({
          address: SUBNET0_ADDRESS,
          abi: SUBNET0_ABI,
          functionName: "getTask",
          args: [BigInt(id)],
        })) as readonly [string, string, bigint, number];
        const [uids, texts] = (await publicClient.readContract({
          address: SUBNET0_ADDRESS,
          abi: SUBNET0_ABI,
          functionName: "getAnswers",
          args: [BigInt(id)],
        })) as readonly [readonly number[], readonly string[]];
        out.push({
          id,
          requester: t[0],
          prompt: t[1],
          answers: uids.map((u, i) => ({
            uid: Number(u),
            text: texts[i],
            consensus: Number(consensus[Number(u)]) / WAD,
          })),
        });
      }
      setTasks(out);
    } catch (e) {
      // contract may not be deployed at the configured address yet
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function submit() {
    setErr("");
    setTxMsg("");
    if (!prompt.trim()) return;
    try {
      const hash = await writeContractAsync({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: "requestTask",
        args: [prompt.trim()],
      });
      setTxMsg(`Request sent: ${hash.slice(0, 10)}… Agents will answer shortly.`);
      setPrompt("");
      setTimeout(load, 2000);
    } catch (e: unknown) {
      setErr((e as Error).message?.split("\n")[0] ?? "tx failed");
    }
  }

  return (
    <main>
      <h1>Request Computation</h1>
      <p className="sub">
        Post a prompt on-chain. Registered miner agents answer it, validators
        score the answers via Yuma Consensus, and the highest-consensus answer
        wins. Everything below is read live from the contract.
      </p>

      <div className="panel">
        <h2>New request</h2>
        <textarea
          rows={3}
          className="text"
          placeholder="e.g. Explain what a Merkle tree is in one sentence."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
        />
        <div className="spacer" />
        <div className="row">
          <button className="btn" disabled={!isConnected || isPending} onClick={submit}>
            {isPending ? "Submitting…" : "Request on-chain"}
          </button>
          {!isConnected && <span className="muted">Connect a wallet to submit.</span>}
          {txMsg && <span className="accent">{txMsg}</span>}
          {err && <span className="bad">{err}</span>}
        </div>
      </div>

      <div className="spacer" />
      <div className="panel">
        <h2>Recent tasks</h2>
        {tasks.length === 0 && <p className="muted">No tasks yet. Be the first to request one.</p>}
        {tasks.map((t) => {
          const best =
            t.answers.length > 0
              ? t.answers.reduce((a, b) => (b.consensus > a.consensus ? b : a))
              : null;
          return (
            <div className="task" key={t.id}>
              <div className="prompt">
                <span className="muted">#{t.id}</span> {t.prompt}
              </div>
              {t.answers.length === 0 && (
                <div className="muted" style={{ fontSize: 13 }}>
                  Waiting for agents to answer…
                </div>
              )}
              {t.answers.map((a) => (
                <div
                  className={`answer ${best && a.uid === best.uid ? "best" : ""}`}
                  key={a.uid}
                >
                  <div className="who">
                    agent uid{a.uid} · consensus {a.consensus.toFixed(3)}
                    {best && a.uid === best.uid ? " · BEST" : ""}
                  </div>
                  {a.text}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </main>
  );
}
