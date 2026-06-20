"""Shared Web3 plumbing for Subnet0 agents."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from web3 import Web3

WAD = 10**18

ROOT = Path(__file__).resolve().parents[1]
ABI_PATH = ROOT / "contracts" / "out" / "Subnet0.sol" / "Subnet0.json"
DEPLOY_PATH = ROOT / "contracts" / "deployment.json"

# load _local/.env first (gitignored secrets), then any .env beside agents/
load_dotenv(ROOT / "_local" / ".env")
load_dotenv(ROOT / "agents" / ".env")


def to_wad(x: float) -> int:
    return int(x * WAD)


def from_wad(x: int) -> float:
    return x / WAD


def load_abi() -> list:
    if not ABI_PATH.exists():
        raise FileNotFoundError(
            f"ABI not found at {ABI_PATH}. Run `forge build` in contracts/ first."
        )
    return json.loads(ABI_PATH.read_text())["abi"]


def load_bytecode() -> str:
    art = json.loads(ABI_PATH.read_text())
    return art["bytecode"]["object"]


def write_deployment(address: str, chain_id: int) -> None:
    DEPLOY_PATH.write_text(
        json.dumps({"address": Web3.to_checksum_address(address), "chainId": chain_id}, indent=2)
    )


def get_w3() -> Web3:
    rpc = os.environ.get("RPC_URL", "http://127.0.0.1:8545")
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        raise ConnectionError(f"Cannot connect to RPC {rpc}")
    return w3


def get_contract_address() -> str:
    addr = os.environ.get("SUBNET0_ADDRESS")
    if addr:
        return Web3.to_checksum_address(addr)
    if DEPLOY_PATH.exists():
        return Web3.to_checksum_address(json.loads(DEPLOY_PATH.read_text())["address"])
    raise RuntimeError(
        "No contract address. Set SUBNET0_ADDRESS or write contracts/deployment.json"
    )


def get_contract(w3: Web3):
    return w3.eth.contract(address=get_contract_address(), abi=load_abi())


def agent_keys() -> list[str]:
    """Private keys for the agent fleet.

    Reads AGENT_KEYS (comma-separated) from env. Falls back to the well-known
    Anvil dev keys so the demo runs locally with zero setup.
    """
    raw = os.environ.get("AGENT_KEYS", "").strip()
    if raw:
        return [k.strip() for k in raw.split(",") if k.strip()]
    # default: first 8 deterministic Anvil accounts (local demo only)
    return [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
        "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
        "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
        "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
        "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
        "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    ]


class Account:
    """A signing account bound to the Subnet0 contract."""

    def __init__(self, w3: Web3, key: str):
        self.w3 = w3
        self.acct = w3.eth.account.from_key(key)
        self.address = self.acct.address
        self.contract = get_contract(w3)

    @property
    def uid(self) -> int | None:
        try:
            return self.contract.functions.uidOf(self.address).call()
        except Exception:
            return None

    def send(self, fn) -> dict:
        w3 = self.w3
        tx = fn.build_transaction(
            {
                "from": self.address,
                "nonce": w3.eth.get_transaction_count(self.address),
                "chainId": w3.eth.chain_id,
            }
        )
        if "gas" not in tx:
            tx["gas"] = int(w3.eth.estimate_gas(tx) * 12 // 10)
        signed = self.acct.sign_transaction(tx)
        h = w3.eth.send_raw_transaction(signed.raw_transaction)
        return dict(w3.eth.wait_for_transaction_receipt(h))
