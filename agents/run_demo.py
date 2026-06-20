"""Subnet0 live demo orchestrator.

Commands:
  python run_demo.py deploy            # deploy contract from first agent key
  python run_demo.py run [--epochs N]  # register fleet, seed stake, run epochs

Roles (8-account fleet):
  uid0,1  honest validators (hold most stake)
  uid2-4  honest miners (high quality)
  uid5,6  cabal validators+miners (self-deal)
  uid7    cabal miner (low quality)

Set RPC_URL / SUBNET0_ADDRESS / OPENAI_API_KEY / AGENT_KEYS in _local/.env.
With no env, defaults to local Anvil (http://127.0.0.1:8545) + dev keys + mock LLM.
"""
from __future__ import annotations

import argparse
import time

from common import (
    Account,
    agent_keys,
    from_wad,
    get_w3,
    load_abi,
    load_bytecode,
    to_wad,
    write_deployment,
)
from cabal import CabalValidator
from miner import Miner
from questions import load_questions
from validator import Validator


def cmd_deploy():
    w3 = get_w3()
    deployer = w3.eth.account.from_key(agent_keys()[0])
    c = w3.eth.contract(abi=load_abi(), bytecode=load_bytecode())
    tx = c.constructor().build_transaction(
        {
            "from": deployer.address,
            "nonce": w3.eth.get_transaction_count(deployer.address),
            "chainId": w3.eth.chain_id,
            "gasPrice": w3.eth.gas_price,  # legacy tx (Monad rejects type-2)
        }
    )
    tx["gas"] = int(w3.eth.estimate_gas(tx) * 12 // 10)
    signed = deployer.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    rcpt = w3.eth.wait_for_transaction_receipt(h)
    write_deployment(rcpt["contractAddress"], w3.eth.chain_id)
    print(f"Subnet0 deployed at {rcpt['contractAddress']} (chain {w3.eth.chain_id})")


def _fmt_row(label, s, c, inc, div):
    return f"  {label:<14} stake={from_wad(s):8.3f}  C={from_wad(c):5.3f}  I={from_wad(inc):5.3f}  D={from_wad(div):5.3f}"


def cmd_run(epochs: int, delay: float = 0.0, emission: float = 8.0):
    w3 = get_w3()
    keys = agent_keys()
    if len(keys) < 8:
        raise SystemExit("need >= 8 agent keys for this demo layout")
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
    all_miners = honest_miners + cabal_miners

    print("Registering fleet...")
    # register in account-index order so uid == index (seeds rely on this)
    for a in accts:
        if a.uid is None:
            a.send(a.contract.functions.register())
    assert [a.uid for a in accts] == list(range(8)), "uid != index; redeploy contract"
    cabal_clique = [5, 6, 7]

    print("Seeding stake (honest ~59%, cabal ~41%)...")
    seeds = {0: 25, 1: 25, 2: 1, 3: 1, 4: 1, 5: 18, 6: 18, 7: 1}
    for uid, amt in seeds.items():
        owner.send(owner.contract.functions.seedStake(uid, to_wad(amt)))
    # emission controls how fast the cabal-decay curve drops. Lower it for a
    # longer, smoother curve over more epochs.
    owner.send(owner.contract.functions.setParams(10, to_wad(0.5), to_wad(0.5), to_wad(emission)))

    questions = load_questions()
    contract = owner.contract

    for e in range(epochs):
        q = questions[e % len(questions)]
        print(f"\n=== Epoch {e + 1}/{epochs} ===\nQ: {q}")
        for m in all_miners:
            m.answer(q)
        for v in honest_vals:
            v.vote(q, all_miners)
        for cv in cabal_vals:
            cv.vote(cabal_clique)
        owner.send(contract.functions.runEpoch())

        _, ep, agents, s, c, inc, div, pend = contract.functions.snapshot().call()
        labels = ["honest-v0", "honest-v1", "honest-m2", "honest-m3", "honest-m4", "cabal-5", "cabal-6", "cabal-7"]
        for i in range(8):
            print(_fmt_row(labels[i], s[i], c[i], inc[i], div[i]))
        honest = sum(s[i] for i in (0, 1, 2, 3, 4))
        cabal = sum(s[i] for i in (5, 6, 7))
        total = honest + cabal
        print(f"  -> cabal stake share: {cabal / total:.4f}")
        if delay > 0:
            time.sleep(delay)  # let a live dashboard capture each epoch


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("deploy")
    runp = sub.add_parser("run")
    runp.add_argument("--epochs", type=int, default=15)
    runp.add_argument("--delay", type=float, default=0.0, help="seconds between epochs")
    runp.add_argument("--emission", type=float, default=8.0, help="stake minted/epoch")
    args = ap.parse_args()
    if args.cmd == "deploy":
        cmd_deploy()
    else:
        cmd_run(args.epochs, args.delay, args.emission)


if __name__ == "__main__":
    main()
