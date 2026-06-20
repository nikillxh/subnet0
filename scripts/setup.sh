#!/usr/bin/env bash
# One-time setup: forge libs, python venv, node deps.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ">> contracts: forge install"
( cd "$ROOT/contracts" && forge install foundry-rs/forge-std >/dev/null 2>&1 || true )

echo ">> agents: venv + pip"
( cd "$ROOT/agents" && python3 -m venv .venv && . .venv/bin/activate && pip install -q -r requirements.txt )

echo ">> web: npm install"
( cd "$ROOT/web" && npm install --silent )

echo ">> done. next: scripts/local.sh"
