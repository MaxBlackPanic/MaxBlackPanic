#!/bin/bash
# SessionStart hook — install dependencies for both apps so tests, linters,
# typechecks and builds work in Claude Code on the web sessions.
#
# This repo holds two independent npm projects:
#   - the repository root: TokenBurn (Next.js)
#   - tokenburn2/:         TokenBurn 2.0 (React + Vite)
#
# Runs synchronously: the session waits until dependencies are installed, which
# avoids race conditions where tests/linters run before node_modules exists.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

echo "[session-start] Installing root (Next.js) dependencies…"
cd "$ROOT"
npm install --no-audit --no-fund

echo "[session-start] Installing tokenburn2 (Vite) dependencies…"
cd "$ROOT/tokenburn2"
npm install --no-audit --no-fund

echo "[session-start] Dependencies installed for both apps."
