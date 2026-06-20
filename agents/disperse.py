"""Fund the agent fleet from a single account.

Account 0 (the only address you fund at the faucet) sends a little native MON to
agents 1..7 so they can pay gas to register, answer, and vote.

Usage: python disperse.py [AMOUNT_PER_AGENT]   (default 0.1)
"""
from __future__ import annotations

import sys

from common import agent_keys, get_w3, to_wad


def main():
    amount = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
    w3 = get_w3()
    keys = agent_keys()
    deployer = w3.eth.account.from_key(keys[0])
    need = to_wad(amount)

    bal0 = w3.eth.get_balance(deployer.address)
    print(f"funder {deployer.address} balance: {bal0 / 1e18:.4f} MON")
    if bal0 < need * (len(keys) - 1):
        print("!! warning: funder balance may be too low to fund all agents")

    gas_price = w3.eth.gas_price
    nonce = w3.eth.get_transaction_count(deployer.address)
    chain_id = w3.eth.chain_id

    for k in keys[1:]:
        to = w3.eth.account.from_key(k).address
        bal = w3.eth.get_balance(to)
        if bal >= need:
            print(f"  {to} already funded ({bal / 1e18:.4f} MON)")
            continue
        tx = {
            "from": deployer.address,
            "to": to,
            "value": need - bal,
            "gas": 21000,
            "gasPrice": gas_price,
            "nonce": nonce,
            "chainId": chain_id,
        }
        signed = deployer.sign_transaction(tx)
        h = w3.eth.send_raw_transaction(signed.raw_transaction)
        w3.eth.wait_for_transaction_receipt(h)
        nonce += 1
        print(f"  funded {to} with {(need - bal) / 1e18:.4f} MON")

    print("done. all agents funded from account 0.")


if __name__ == "__main__":
    main()
