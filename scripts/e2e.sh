#!/usr/bin/env bash
# Full end-to-end test: contracts -> chain -> agents -> task board -> dashboard.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC="http://127.0.0.1:8545"
PASS=0; FAIL=0
ok(){ echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad(){ echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

cleanup(){ pkill -x anvil 2>/dev/null || true; pkill -f "next dev" 2>/dev/null || true; pkill -f "next-server" 2>/dev/null || true; }
trap cleanup EXIT
cleanup; sleep 1

echo "== 1. forge tests =="
( cd "$ROOT/contracts" && forge test >/tmp/forge.log 2>&1 ) && ok "forge test" || { bad "forge test"; tail -20 /tmp/forge.log; }

echo "== 2. anvil + deploy + sync abi =="
anvil --silent >/tmp/anvil.log 2>&1 & sleep 3
( cd "$ROOT/contracts" && forge build >/dev/null )
cd "$ROOT/agents"; . .venv/bin/activate
export RPC_URL="$RPC"; export AGENT_KEYS=""; unset SUBNET0_ADDRESS
python run_demo.py deploy >/tmp/deploy.log 2>&1 && ok "deploy" || { bad "deploy"; cat /tmp/deploy.log; }
ADDR="$(python -c 'import json,common; print(json.load(open(common.DEPLOY_PATH))["address"])')"
"$ROOT/scripts/sync-abi.sh" >/dev/null && ok "sync-abi" || bad "sync-abi"
"$ROOT/scripts/sync-qa.sh" >/dev/null && ok "sync-qa" || bad "sync-qa"

echo "== 3. scripted decay (collusion resistance) =="
python run_demo.py run --epochs 12 >/tmp/run.log 2>&1 && ok "agents run" || { bad "agents run"; tail -20 /tmp/run.log; }
python - <<'PY' && ok "cabal share decayed" || bad "cabal share did NOT decay"
import re
v=[float(x) for x in re.findall(r"cabal stake share: ([0-9.]+)", open("/tmp/run.log").read())]
assert len(v)>=5 and v[-1] < v[0]-0.05, v
print(f"   share {v[0]:.4f} -> {v[-1]:.4f}")
PY

echo "== 4. on-chain task board flow (paid) =="
python - <<'PY' && ok "paid task answered on-chain" || bad "task flow failed"
from common import Account, agent_keys, get_w3
w3=get_w3(); keys=agent_keys()
consumer=Account(w3, keys[2])
fee=consumer.contract.functions.taskFee().call()
assert fee>0, "taskFee should be set"
tid=consumer.contract.functions.taskCount().call()
consumer.send(consumer.contract.functions.requestTask("What is the capital of Japan?"), value=fee)
for i in range(2,8):  # miners uid2..7 (registered by step 3)
    a=Account(w3, keys[i])
    a.send(a.contract.functions.submitAnswer(tid, f"answer from uid{i}"))
uids,texts=consumer.contract.functions.getAnswers(tid).call()
assert len(uids)==6, (uids,texts)
pool=consumer.contract.functions.feePool().call()
assert pool>=fee, ("feePool not collected", pool, fee)
print(f"   task #{tid}: {len(uids)} answers, feePool={pool}")
PY

echo "== 5. consensus ordering =="
python - <<'PY' && ok "honest C > cabal C" || bad "consensus ordering wrong"
from common import get_w3, get_contract
c=get_contract(get_w3()).functions.getConsensus().call()
h=min(c[2],c[3],c[4]); k=max(c[5],c[6],c[7])
print(f"   honest>={h/1e18:.3f} cabal<={k/1e18:.3f}"); assert h>k
PY

echo "== 6. web build + all pages 200 =="
cat > "$ROOT/web/.env.local" <<EOF
NEXT_PUBLIC_RPC_URL=$RPC
NEXT_PUBLIC_SUBNET0_ADDRESS=$ADDR
NEXT_PUBLIC_CHAIN_ID=31337
EOF
( cd "$ROOT/web" && npm run build >/tmp/webbuild.log 2>&1 ) && ok "web build" || { bad "web build"; tail -20 /tmp/webbuild.log; }
( cd "$ROOT/web" && npm run dev >/tmp/web.log 2>&1 & ); sleep 10
for route in "" market participate docs; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/$route" || echo 000)"
  [ "$CODE" = "200" ] && ok "GET /$route -> 200" || bad "GET /$route -> $CODE"
done

echo
echo "== RESULT: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
