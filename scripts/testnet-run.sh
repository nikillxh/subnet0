#!/usr/bin/env bash
# Register fleet, seed stake, and run epochs on Monad testnet.
# Usage: scripts/testnet-run.sh [EPOCHS]   (default 15)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EPOCHS="${1:-15}"

cd "$ROOT/agents"
. .venv/bin/activate
export RPC_URL="https://testnet-rpc.monad.xyz"
echo ">> running $EPOCHS epochs on Monad testnet (each epoch = several txs)"
python run_demo.py run --epochs "$EPOCHS"
echo ">> done. open dashboard: scripts/dashboard.sh"
