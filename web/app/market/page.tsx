"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { publicClient, SUBNET0_ABI, SUBNET0_ADDRESS } from "@/lib/contract";
import { SAMPLE_QUESTIONS } from "@/lib/questions";

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
  const [fee, setFee] = useState<bigint>(0n);
  const [err, setErr] = useState("");
  const [txMsg, setTxMsg] = useState("");
  const [filter, setFilter] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return SAMPLE_QUESTIONS.filter((q) => q.toLowerCase().includes(f)).slice(0, 40);
  }, [filter]);

  const load = useCallback(async () => {
    try {
      const [count, feeWei, consensus] = await Promise.all([
        publicClient.readContract({ address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "taskCount" }),
        publicClient.readContract({ address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "taskFee" }),
        publicClient.readContract({ address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "getConsensus" }),
      ]);
      setFee(feeWei as bigint);
      const c = consensus as readonly bigint[];
      const ids = Array.from({ length: Number(count) }, (_, i) => i).reverse().slice(0, 10);
      const out: TaskView[] = [];
      for (const id of ids) {
        const t = (await publicClient.readContract({
          address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "getTask", args: [BigInt(id)],
        })) as readonly [string, string, bigint, number];
        const [uids, texts] = (await publicClient.readContract({
          address: SUBNET0_ADDRESS, abi: SUBNET0_ABI, functionName: "getAnswers", args: [BigInt(id)],
        })) as readonly [readonly number[], readonly string[]];
        out.push({
          id, requester: t[0], prompt: t[1],
          answers: uids.map((u, i) => ({ uid: Number(u), text: texts[i], consensus: Number(c[Number(u)]) / WAD })),
        });
      }
      setTasks(out);
    } catch {
      /* contract not reachable at configured address */
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
      // read the fee fresh so we never send value: 0 (which reverts)
      const feeWei = (await publicClient.readContract({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: "taskFee",
      })) as bigint;
      setFee(feeWei);
      const hash = await writeContractAsync({
        address: SUBNET0_ADDRESS,
        abi: SUBNET0_ABI,
        functionName: "requestTask",
        args: [prompt.trim()],
        value: feeWei,
      });
      setTxMsg(`Request sent (${hash.slice(0, 10)}…). Agents are answering…`);
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
        Post a prompt on-chain and pay a small fee. Miner agents answer it,
        validators score the answers via Yuma Consensus, and the
        highest-consensus answer wins. Agents answer questions from the public
        knowledge set; anything else returns &quot;Currently unable to answer&quot;.
      </p>

      <div className="panel">
        <h2>New request</h2>
        <textarea
          rows={3}
          className="text"
          placeholder="Ask something, e.g. What is the capital of Japan?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={500}
        />
        <div className="spacer" />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" disabled={!isConnected || isPending} onClick={submit}>
            {isPending ? "Submitting…" : `Request (${formatEther(fee)} MON)`}
          </button>
          <button className="btn ghost sm" onClick={() => setShowPicker((s) => !s)}>
            {showPicker ? "Hide samples" : "Pick a sample question"}
          </button>
          {!isConnected && <span className="muted">Connect a wallet to submit.</span>}
          {txMsg && <span className="accent">{txMsg}</span>}
          {err && <span className="bad">{err}</span>}
        </div>

        {showPicker && (
          <div style={{ marginTop: 14 }}>
            <input
              className="text"
              placeholder="Filter questions…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="picker">
              {filtered.map((q) => (
                <button
                  key={q}
                  className="chip"
                  onClick={() => {
                    setPrompt(q);
                    setShowPicker(false);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="spacer" />
      <div className="panel">
        <h2>Recent tasks</h2>
        {tasks.length === 0 && <p className="muted">No tasks yet. Be the first to request one.</p>}
        {tasks.map((t) => {
          const best = t.answers.length > 0 ? t.answers.reduce((a, b) => (b.consensus > a.consensus ? b : a)) : null;
          return (
            <div className="task" key={t.id}>
              <div className="prompt">
                <span className="muted">#{t.id}</span> {t.prompt}
              </div>
              {t.answers.length === 0 && (
                <div className="muted" style={{ fontSize: 13 }}>Waiting for agents to answer…</div>
              )}
              {t.answers.map((a) => (
                <div className={`answer ${best && a.uid === best.uid ? "best" : ""}`} key={a.uid}>
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
