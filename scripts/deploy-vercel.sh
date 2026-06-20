#!/usr/bin/env bash
# Deploy the frontend to Vercel (target: subnet0.vercel.app).
#
# Prereqs (one-time):
#   npm i -g vercel          # or use npx (below)
#   vercel login             # auth with your Vercel account
#
# The public testnet config is read from web/.env.production (written by
# scripts/testnet-deploy.sh), so run that first.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/web"

if [ ! -f .env.production ]; then
  echo "!! web/.env.production missing. Run scripts/testnet-deploy.sh first."
  exit 1
fi

echo ">> deploying web/ to Vercel (production)"
# --name sets the project (subnet0 -> subnet0.vercel.app, if available to you)
npx vercel deploy --prod --yes --name subnet0
echo ">> if the URL isn't subnet0.vercel.app, set the project name to 'subnet0'"
echo "   in the Vercel dashboard (Settings -> General), or add it as a domain."
