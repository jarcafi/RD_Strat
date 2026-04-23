#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python)"
fi
if [[ -z "$PYTHON_BIN" ]]; then
  echo "Python not found (need python3)." >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port 8000 already in use."
  else
    "$PYTHON_BIN" -m http.server 8000 >/tmp/rd_strat_http.log 2>&1 &
    sleep 0.5
  fi
else
  "$PYTHON_BIN" -m http.server 8000 >/tmp/rd_strat_http.log 2>&1 &
  sleep 0.5
fi

open http://localhost:8000/
