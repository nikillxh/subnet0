"""Generate a fresh 8-agent keypair fleet for testnet.

Writes AGENT_KEYS into _local/.env (gitignored) and prints the addresses to
fund via the Monad faucet. Account 0 is the deployer/owner and needs the most.
"""
from __future__ import annotations

import re

from eth_account import Account

from common import ROOT

N = 8


def main():
    accts = [Account.create() for _ in range(N)]
    keys = [a.key.hex() for a in accts]
    keys = [k if k.startswith("0x") else "0x" + k for k in keys]

    env_path = ROOT / "_local" / ".env"
    env_path.parent.mkdir(exist_ok=True)
    text = env_path.read_text() if env_path.exists() else ""
    line = "AGENT_KEYS=" + ",".join(keys)
    if re.search(r"^AGENT_KEYS=.*$", text, flags=re.M):
        text = re.sub(r"^AGENT_KEYS=.*$", line, text, flags=re.M)
    else:
        text = text.rstrip() + "\n" + line + "\n"
    env_path.write_text(text)

    print(f"Wrote {N} keys to {env_path} (AGENT_KEYS)\n")
    print("Fund these addresses at https://faucet.monad.xyz :")
    for i, a in enumerate(accts):
        role = "deployer/owner (fund FIRST, needs most gas)" if i == 0 else "agent"
        print(f"  [{i}] {a.address}   <- {role}")
    print("\nAll 8 send transactions (register/setWeights), so fund all 8.")


if __name__ == "__main__":
    main()
