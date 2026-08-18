#!/usr/bin/env bash
# Daily unattended career-ops system-file update check + auto-apply.
# Installed via crontab, runs headless. update-system.mjs apply is
# non-interactive and only ever touches system-layer files (it stashes any
# dirty local files first and restores them after, per its own design) --
# safe to auto-apply without a human in the loop.
set -uo pipefail
# cron runs with a bare PATH -- latest nvm node build covers the common
# install layout. Adjust if yours differs (`which node`).
export PATH="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -1):$PATH"
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p logs
DATE=$(date +%F)
OUT="logs/update-check-$DATE.log"

{
  echo "=== career-ops update check: $(date -u +%FT%TZ) ==="
  STATUS_JSON=$(node update-system.mjs check)
  echo "$STATUS_JSON"

  STATUS=$(echo "$STATUS_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).status)}catch{console.log('parse-error')}})")

  if [ "$STATUS" = "update-available" ]; then
    echo "Update available -- applying..."
    node update-system.mjs apply
  else
    echo "No update applied (status: $STATUS)"
  fi
} > "$OUT" 2>&1
