"""Event-driven agent fleet: answer on-chain compute requests live.

Polls the contract for new Tasks (posted via requestTask, e.g. from the
frontend). For each task: every miner submits an answer on-chain, validators
judge the answers and set weights, the owner runs an epoch. This is what powers
the browser "Request Computation" flow.

Run: python serve.py [--interval SECONDS] [--no-seed]
Reads RPC_URL / SUBNET0_ADDRESS / AGENT_KEYS / OPENAI_API_KEY from _local/.env.
With no env it targets local Anvil with dev keys + the mock LLM.
"""
from __future__ import annotations

import argparse
import time

from common import Account, agent_keys, from_wad, get_w3, to_wad
from cabal import CabalValidator
from miner import Miner
from validator import Validator


def build_fleet(w3):
    keys = agent_keys()
    if len(keys) < 8:
        raise SystemExit("need >= 8 agent keys")
    accts = [Account(w3, k) for k in keys[:8]]
    owner = accts[0]
    honest_vals = [Validator(accts[0], "honest-val0"), Validator(accts[1], "honest-val1")]
    honest_miners = [
        Miner(accts[2], "honest-m2", "expert", 0.88),
        Miner(accts[3], "honest-m3", "expert", 0.85),
        Miner(accts[4], "honest-m4", "expert", 0.82),
    ]
    cabal_vals = [CabalValidator(accts[5], "cabal-v5"), CabalValidator(accts[6], "cabal-v6")]
    cabal_miners = [
        Miner(accts[5], "cabal-m5", "lazy", 0.30),
        Miner(accts[6], "cabal-m6", "lazy", 0.28),
        Miner(accts[7], "cabal-m7", "lazy", 0.25),
    ]
    return {
        "accts": accts,
        "owner": owner,
        "honest_vals": honest_vals,
        "honest_miners": honest_miners,
        "cabal_vals": cabal_vals,
        "all_miners": honest_miners + cabal_miners,
        "cabal_clique": [5, 6, 7],
    }


def ensure_setup(fleet, seed: bool):
    accts = fleet["accts"]
    owner = fleet["owner"]
    print("Registering fleet (idempotent)...")
    for a in accts:
        if a.uid is None:
            a.send(a.contract.functions.register())
    assert [a.uid for a in accts] == list(range(8)), "uid != index; redeploy"
    if seed:
        print("Seeding stake + params...")
        seeds = {0: 25, 1: 25, 2: 1, 3: 1, 4: 1, 5: 18, 6: 18, 7: 1}
        for uid, amt in seeds.items():
            owner.send(owner.contract.functions.seedStake(uid, to_wad(amt)))
        owner.send(owner.contract.functions.setParams(10, to_wad(0.5), to_wad(0.5), to_wad(8)))


def serve_task(fleet, task_id: int):
    owner = fleet["owner"]
    contract = owner.contract
    requester, prompt, _, answer_count = contract.functions.getTask(task_id).call()
    if answer_count > 0:
        return False  # already handled (e.g. by a previous serve session)
    print(f"\n=== Task #{task_id} from {requester[:10]}… ===\n  prompt: {prompt}")

    submitted = 0
    for m in fleet["all_miners"]:
        text = m.answer(prompt)
        try:
            m.acct.send(contract.functions.submitAnswer(task_id, text[:1000]))
            submitted += 1
        except Exception as e:  # already answered / revert
            print(f"  ! {m.name} submit skipped: {e}")
    if submitted == 0:
        return False

    for v in fleet["honest_vals"]:
        v.vote(prompt, fleet["all_miners"])
    for cv in fleet["cabal_vals"]:
        cv.vote(fleet["cabal_clique"])
    owner.send(contract.functions.runEpoch())

    _, ep, _, s, c, inc, div, _ = contract.functions.snapshot().call()
    uids, texts = contract.functions.getAnswers(task_id).call()
    best = max(range(len(uids)), key=lambda i: c[uids[i]]) if uids else None
    print(f"  epoch now {ep}. answers:")
    for i, uid in enumerate(uids):
        flag = "  <-- best (highest consensus)" if i == best else ""
        print(f"    uid{uid} C={from_wad(c[uid]):.3f} I={from_wad(inc[uid]):.3f}: {texts[i][:60]}{flag}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=float, default=3.0)
    ap.add_argument("--no-seed", action="store_true")
    args = ap.parse_args()

    w3 = get_w3()
    fleet = build_fleet(w3)
    ensure_setup(fleet, seed=not args.no_seed)
    contract = fleet["owner"].contract

    # start at 0 so we answer any task already posted (incl. ones submitted
    # before serve started). serve_task() no-ops on already-answered tasks.
    processed = 0
    existing = contract.functions.taskCount().call()
    print(f"\nServing. {existing} existing task(s) will be checked for pending answers.")
    print("Submit one from the frontend Market page (or requestTask on-chain). Ctrl+C to stop.")
    while True:
        try:
            count = contract.functions.taskCount().call()
            while processed < count:
                serve_task(fleet, processed)
                processed += 1
            time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nstopped.")
            break
        except Exception as e:  # noqa: BLE001
            print(f"  ! loop error: {e}")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
