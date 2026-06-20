#!/usr/bin/env bash
# Full end-to-end test: contracts -> chain -> agents -> dashboard.
# Asserts: forge tests pass, cabal stake share decays, dashboard serves 200
# against the SAME deployed contract.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="http://127.0.0.1:8545"
PASS=0; FAIL=0
ok(){ echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad(){ echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

cleanup(){ pkill -f "anvil" 2>/dev/null || true; pkill -f "next dev" 2>/dev/null || true; pkill -f "next-server" 2>/dev/null || true; }
trap cleanup EXIT
cleanup; sleep 1

echo "== 1. forge tests =="
( cd "$ROOT/contracts" && forge test >/tmp/forge.log 2>&1 ) && ok "forge test" || { bad "forge test"; tail -20 /tmp/forge.log; }

echo "== 2. anvil + deploy =="
anvil --silent >/tmp/anvil.log 2>&1 & sleep 3
( cd "$ROOT/contracts" && forge build >/dev/null )
cd "$ROOT/agents"; . .venv/bin/activate
export RPC_URL="$RPC"; unset AGENT_KEYS SUBNET0_ADDRESS
python run_demo.py deploy >/tmp/deploy.log 2>&1 && ok "deploy" || { bad "deploy"; cat /tmp/deploy.log; }
ADDR="$(python -c 'import json,common; print(json.load(open(common.DEPLOY_PATH))["address"])')"

echo "== 3. run agents (12 epochs) =="
python run_demo.py run --epochs 12 >/tmp/run.log 2>&1 && ok "agents run" || { bad "agents run"; tail -20 /tmp/run.log; }

echo "== 4. assert cabal decay =="
python - <<'PY' && ok "cabal share decayed" || bad "cabal share did NOT decay"
import re
lines=[float(x) for x in re.findall(r"cabal stake share: ([0-9.]+)", open("/tmp/run.log").read())]
assert len(lines)>=5, f"too few epochs: {lines}"
assert lines[-1] < lines[0] - 0.05, f"no decay: {lines[0]} -> {lines[-1]}"
print(f"   share {lines[0]:.4f} -> {lines[-1]:.4f}")
PY

echo "== 5. assert on-chain consensus ordering =="
python - "$ADDR" <<'PY' && ok "honest consensus > cabal" || bad "consensus ordering wrong"
import sys
from common import get_w3, get_contract
w3=get_w3(); c=get_contract(w3)
con=c.functions.getConsensus().call()
honest=min(con[2],con[3],con[4]); cabal=max(con[5],con[6],con[7])
print(f"   honest C>={honest/1e18:.3f}  cabal C<={cabal/1e18:.3f}")
assert honest>cabal, (honest,cabal)
PY

echo "== 6. dashboard build + serve 200 =="
cat > "$ROOT/web/.env.local" <<EOF
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_SUBNET0_ADDRESS=$ADDR
EOF
( cd "$ROOT/web" && npm run build >/tmp/webbuild.log 2>&1 ) && ok "web build" || { bad "web build"; tail -20 /tmp/webbuild.log; }
( cd "$ROOT/web" && npm run dev >/tmp/web.log 2>&1 & ) ; sleep 9
CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000 || echo 000)"
[ "$CODE" = "200" ] && ok "dashboard HTTP 200" || bad "dashboard HTTP $CODE"

echo
echo "== RESULT: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
