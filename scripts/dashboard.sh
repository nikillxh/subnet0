#!/usr/bin/env bash
# Start the dashboard (reads web/.env.local written by local.sh / testnet scripts).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"
[ -f .env.local ] || cp .env.local.example .env.local
echo ">> dashboard: http://localhost:3000"
npm run dev
