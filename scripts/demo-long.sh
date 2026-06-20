#!/usr/bin/env bash
# Longer local demo -> a long, smooth cabal-decay curve on the dashboard.
# Lower emission + a pause per epoch so a LIVE dashboard captures every point.
#
# Usage:
#   1) scripts/dashboard.sh            # start the dashboard FIRST, open it
#   2) scripts/demo-long.sh [EPOCHS]   # default 60 epochs, ~1.2s each
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EPOCHS="${1:-60}"
export RUN_ARGS="--delay 1.2 --emission 3"
echo ">> long demo: $EPOCHS epochs (open the dashboard first to see the full curve)"
"$ROOT/scripts/local.sh" "$EPOCHS"
