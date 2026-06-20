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

echo ">> funding the other 7 agents from account 0"
python disperse.py "${FUND_PER_AGENT:-0.1}"

echo ">> sync ABI + questions to frontend"
"$ROOT/scripts/sync-abi.sh"
"$ROOT/scripts/sync-qa.sh"

# .env.local for local `next dev`; .env.production (committed, public values)
# so Vercel's `next build` picks up the testnet config automatically.
for f in "$ROOT/web/.env.local" "$ROOT/web/.env.production"; do
cat > "$f" <<EOF
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_SUBNET0_ADDRESS=$ADDR
NEXT_PUBLIC_CHAIN_ID=10143
EOF
done
echo ">> deployed at $ADDR (dashboard wired, all agents funded)"
echo ">> wrote web/.env.production for Vercel"
echo ">> explorer: https://testnet.monadscan.com/address/$ADDR"
echo ">> next: scripts/testnet-run.sh   (register + seed + run epochs)"
echo ">>   or: scripts/serve.sh         (answer live Market requests)"
