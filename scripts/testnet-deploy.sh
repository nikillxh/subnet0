#!/usr/bin/env bash
# Deploy Subnet0 to Monad testnet using account 0 from _local/.env AGENT_KEYS.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="https://testnet-rpc.monad.xyz"

cd "$ROOT/agents"
. .venv/bin/activate
# load AGENT_KEYS from _local/.env
set -a; . "$ROOT/_local/.env"; set +a
DEPLOYER="$(echo "$AGENT_KEYS" | cut -d, -f1)"

( cd "$ROOT/contracts" && forge build >/dev/null )

export RPC_URL="$RPC"
echo ">> deploying to Monad testnet (chain 10143)"
python run_demo.py deploy
ADDR="$(python -c 'import json,common; print(json.load(open(common.DEPLOY_PATH))["address"])')"

cat > "$ROOT/web/.env.local" <<EOF
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_SUBNET0_ADDRESS=$ADDR
EOF
echo ">> deployed at $ADDR (dashboard wired)"
echo ">> explorer: https://testnet.monadscan.com/address/$ADDR"
echo ">> next: scripts/testnet-run.sh"
