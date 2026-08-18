#!/usr/bin/env bash
# Daily unattended career-ops scan + evaluate + email digest.
# Installed via crontab, runs headless (claude -p), no interactive approval
# possible — tools are pre-scoped via --allowedTools rather than a full
# permission bypass.
set -uo pipefail
# cron runs with a bare PATH -- $HOME/.local/bin (claude) and the latest nvm
# node build cover the common install layout. Adjust if yours differs
# (`which claude`, `which node`).
export PATH="$HOME/.local/bin:$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -1):$PATH"
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p logs
DATE=$(date +%F)
OUT="logs/daily-scan-$DATE.log"

claude --model claude-sonnet-5 -p "$(cat daily-scan-prompt.md)" \
  --allowedTools Bash Read Write Edit Glob Grep WebSearch WebFetch \
  --output-format text \
  > "$OUT" 2>&1

BODY=/tmp/daily-scan-email-body.txt
awk '/<<<EMAIL_START>>>/{flag=1;next}/<<<EMAIL_END>>>/{flag=0;next}flag' "$OUT" > "$BODY"

if [ -s "$BODY" ]; then
  node send-daily-report.mjs "$BODY"
else
  echo "career-ops daily scan: no EMAIL markers found in output — sending full log as fallback so nothing silently disappears." > "$BODY"
  echo "---" >> "$BODY"
  tail -c 4000 "$OUT" >> "$BODY"
  node send-daily-report.mjs "$BODY"
fi
