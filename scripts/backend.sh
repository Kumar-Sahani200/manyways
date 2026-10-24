#!/usr/bin/env bash
set -euo pipefail
python3 -m uvicorn services.story.api:app --host 0.0.0.0 --port "${PORT:-8000}" &
api=$!
python3 -m services.story.worker &
worker=$!
trap 'kill "$api" "$worker" 2>/dev/null || true; wait || true' EXIT INT TERM
wait -n "$api" "$worker"
exit 1
