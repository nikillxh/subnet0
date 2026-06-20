#!/usr/bin/env bash
# Stop background processes (anvil, next dev).
set -euo pipefail
pkill -f "anvil" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
echo ">> stopped anvil + dashboard"
