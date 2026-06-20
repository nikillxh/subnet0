#!/usr/bin/env bash
# Run the event-driven agent fleet: watch for on-chain tasks, answer + score.
# Local (default): RPC defaults to anvil.  Testnet: RPC_URL=https://testnet-rpc.monad.xyz scripts/serve.sh
# Passes extra args through (e.g. --interval 2 --no-seed).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/agents"
. .venv/bin/activate
export RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
echo ">> serving against $RPC_URL (Ctrl+C to stop)"
python -u serve.py "$@"
