#!/usr/bin/env bash
# a11y-contrast.sh — run the Playwright contrast audit against a local server.
#
# Spins up scripts/serve.sh on :8765, waits for it to respond, then runs
# scripts/a11y-contrast.mjs. The server is killed on exit (including on
# failure) via an EXIT trap, and the script propagates the audit's exit
# code so CI fails when the audit fails.

set -euo pipefail

PORT=8765
URL="http://localhost:${PORT}/AI-Car-Racer/index.html"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "a11y-contrast: launching server on :$PORT"
"$SCRIPT_DIR/serve.sh" "$PORT" >/tmp/a11y-serve.log 2>&1 &
SERVER_PID=$!

# Wait up to ~15s for the server. Python's http.server binds fast so this
# is usually <1s — the timeout exists purely for slow CI containers.
for i in $(seq 1 60); do
  if curl -sSf -o /dev/null "http://localhost:${PORT}/" ; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "a11y-contrast: server died before binding. Log:"
    cat /tmp/a11y-serve.log || true
    exit 1
  fi
  sleep 0.25
done

if ! curl -sSf -o /dev/null "http://localhost:${PORT}/"; then
  echo "a11y-contrast: server never responded. Log:"
  cat /tmp/a11y-serve.log || true
  exit 1
fi

echo "a11y-contrast: server up, running audit"
node "$SCRIPT_DIR/a11y-contrast.mjs" --url "$URL"
