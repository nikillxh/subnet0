#!/usr/bin/env bash
# Generate 8 fresh testnet keys into _local/.env and print addresses to fund.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/agents"
. .venv/bin/activate
python gen_keys.py
echo
echo ">> next: fund the addresses, then scripts/testnet-deploy.sh"
