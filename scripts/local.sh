#!/usr/bin/env bash
# Local demo: start anvil, deploy, run agents, point dashboard at the deploy.
# Usage: scripts/local.sh [EPOCHS]   (default 15)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EPOCHS="${1:-15}"
RPC="http://127.0.0.1:8545"

pkill -f "anvil" 2>/dev/null || true
sleep 1
echo ">> starting anvil"
anvil --silent > /tmp/anvil.log 2>&1 &
sleep 3

echo ">> forge build"
( cd "$ROOT/contracts" && forge build >/dev/null )

cd "$ROOT/agents"
. .venv/bin/activate
export RPC_URL="$RPC"
unset AGENT_KEYS SUBNET0_ADDRESS  # force local anvil dev keys

echo ">> deploy"
python run_demo.py deploy
ADDR="$(python -c 'import json,common; print(json.load(open(common.DEPLOY_PATH))["address"])')"

echo ">> sync ABI + questions to frontend"
"$ROOT/scripts/sync-abi.sh"
"$ROOT/scripts/sync-qa.sh"

# wire dashboard to this deploy
cat > "$ROOT/web/.env.local" <<EOF
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_SUBNET0_ADDRESS=$ADDR
NEXT_PUBLIC_CHAIN_ID=31337
EOF
echo ">> dashboard wired to $ADDR"

echo ">> running $EPOCHS epochs"
python run_demo.py run --epochs "$EPOCHS" ${RUN_ARGS:-}

echo
echo ">> done. start dashboard:  scripts/dashboard.sh"
echo ">> anvil still running (pid in /tmp/anvil.log). stop with: scripts/clean.sh"
