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
    print("=" * 64)
    print("FUND ONLY THIS ONE ADDRESS at https://faucet.monad.xyz :")
    print(f"\n    {accts[0].address}\n")
    print("=" * 64)
    print("It is the deployer/owner. testnet-deploy.sh then funds the other 7")
    print("agents from it automatically — you do NOT fund them yourself.")


if __name__ == "__main__":
    main()
