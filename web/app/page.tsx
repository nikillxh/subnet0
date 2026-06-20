"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { publicClient, SUBNET0_ABI, SUBNET0_ADDRESS } from "@/lib/contract";

const WAD = 1e18;

// Role layout matches the demo orchestrator fleet.
const ROLE: Record<number, { label: string; kind: "honest" | "cabal" }> = {
  0: { label: "honest-val0", kind: "honest" },
  1: { label: "honest-val1", kind: "honest" },
  2: { label: "honest-m2", kind: "honest" },
  3: { label: "honest-m3", kind: "honest" },
  4: { label: "honest-m4", kind: "honest" },
  5: { label: "cabal-5", kind: "cabal" },
  6: { label: "cabal-6", kind: "cabal" },
  7: { label: "cabal-7", kind: "cabal" },
};

type Row = {
  uid: number;
  label: string;
  kind: "honest" | "cabal";
  addr: string;
  stake: number;
  c: number;
  inc: number;
  div: number;
};

const f = (x: bigint) => Number(x) / WAD;

const CABAL_UIDS = [5, 6, 7];

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [connected, setConnected] = useState(false);
  const [series, setSeries] = useState<{ epoch: number; cabalShare: number }[]>(
    []
  );

  // table + current epoch from the live snapshot
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = (await publicClient.readContract({
          address: SUBNET0_ADDRESS,
          abi: SUBNET0_ABI,
          functionName: "snapshot",
        })) as readonly [
          number,
          bigint,
          readonly string[],
          readonly bigint[],
          readonly bigint[],
          readonly bigint[],
          readonly bigint[],
          readonly bigint[]
        ];
        if (!alive) return;
        const [count, ep, agents, s, c, inc, div] = r;
        const n = Number(count);
        const next: Row[] = [];
        for (let i = 0; i < n; i++) {
          const role = ROLE[i] ?? { label: `uid${i}`, kind: "honest" as const };
          next.push({
            uid: i,
            label: role.label,
            kind: role.kind,
            addr: agents[i],
            stake: f(s[i]),
            c: f(c[i]),
            inc: f(inc[i]),
            div: f(div[i]),
          });
        }
        setRows(next);
        setEpoch(Number(ep));
        setConnected(true);
      } catch {
        if (alive) setConnected(false);
      }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // full decay curve, rebuilt from EpochSettled events (every epoch ever run)
  useEffect(() => {
    let alive = true;
    const loadSeries = async () => {
      try {
        const logs = await publicClient.getContractEvents({
          address: SUBNET0_ADDRESS,
          abi: SUBNET0_ABI,
          eventName: "EpochSettled",
          fromBlock: 0n,
        });
        if (!alive) return;
        const byEpoch = new Map<number, number>();
        for (const log of logs) {
          const a = log.args as { epoch?: bigint; m?: number; stake?: readonly bigint[] };
          if (a.epoch === undefined || !a.stake) continue;
          const m = Number(a.m ?? a.stake.length);
          let total = 0;
          let cabal = 0;
          for (let i = 0; i < m; i++) {
            const v = Number(a.stake[i]) / WAD;
            total += v;
            if (CABAL_UIDS.includes(i)) cabal += v;
          }
          byEpoch.set(Number(a.epoch), total > 0 ? Number((cabal / total).toFixed(4)) : 0);
        }
        const next = [...byEpoch.entries()]
          .sort((x, y) => x[0] - y[0])
          .map(([ep, cabalShare]) => ({ epoch: ep, cabalShare }));
        setSeries(next);
      } catch {
        /* ignore; snapshot poll handles connection state */
      }
    };
    loadSeries();
    const t = setInterval(loadSeries, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const maxStake = Math.max(1, ...rows.map((r) => r.stake));

  return (
    <main>
      <h1>Subnet0 — Peer-to-Peer Intelligence Market on Monad</h1>
      <p className="sub">
        Yuma Consensus incentive mechanism. Agents register, score each other,
        and earn emissions — collusion-resistant up to 50% of stake.
      </p>

      <div className="stat">
        <div>
          <span className="k">Epoch</span>
          <span className="v">{epoch}</span>
        </div>
        <div>
          <span className="k">Agents</span>
          <span className="v">{rows.length}</span>
        </div>
        <div>
          <span className="k">Status</span>
          <span className="v" style={{ fontSize: 14 }}>
            <span className={`dot ${connected ? "on" : "off"}`} />
            {connected ? "live" : "disconnected"}
          </span>
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <h2>Agents</h2>
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Role</th>
                <th>Stake</th>
                <th>Consensus</th>
                <th>Incentive</th>
                <th>Dividend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid}>
                  <td>{r.label}</td>
                  <td>
                    <span className={`tag ${r.kind}`}>{r.kind}</span>
                  </td>
                  <td>
                    <span
                      className="bar"
                      style={{ width: `${(r.stake / maxStake) * 60}px` }}
                    />{" "}
                    {r.stake.toFixed(2)}
                  </td>
                  <td>{r.c.toFixed(3)}</td>
                  <td>{r.inc.toFixed(3)}</td>
                  <td>{r.div.toFixed(3)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: "var(--muted)" }}>
                    Waiting for contract data…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Collusion resistance — colluding group&apos;s stake share per epoch</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={series}>
              <CartesianGrid stroke="#2c2212" strokeDasharray="3 3" />
              <XAxis dataKey="epoch" stroke="#9c8a6e" fontSize={12} />
              <YAxis
                domain={[0, 0.6]}
                stroke="#9c8a6e"
                fontSize={12}
                tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "#14100a",
                  border: "1px solid #2c2212",
                  borderRadius: 4,
                  color: "#f4ead9",
                }}
                formatter={(value) => `${(Number(value) * 100).toFixed(2)}%`}
              />
              <Line
                type="monotone"
                dataKey="cabalShare"
                stroke="#ff3b3b"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="status">
            Collusion resistance: the self-dealing cabal holds &lt;50% stake, so
            its consensus stays below the kappa inflection and its share decays.
          </p>
        </div>
      </div>
    </main>
  );
}
