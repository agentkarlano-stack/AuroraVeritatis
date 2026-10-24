#!/usr/bin/env bash
# Waits until <base-url> serves the deployment of <commit> (or a newer commit that contains it), instead of a fixed sleep.
#   scripts/wait-for-deploy.sh <base-url> <commit> [timeout seconds, default 480]
# /api/health reports the commit the deployment was built from (Workers Builds: WORKERS_CI_COMMIT_SHA). Needs the git
# history of main (actions/checkout with fetch-depth: 50 or more) to recognise newer commits.
# Fallback: if the site does not report a commit (older deployment, or a build without the variable), it waits a
# fixed 180 s from the start, as before, so an older deployment is never tested by accident without that delay.
set -uo pipefail
BASE=${1%/} SHA=$2 TIMEOUT=${3:-480}
start=$(date +%s)
seen=""
while :; do
  elapsed=$(( $(date +%s) - start ))
  deployed=$(curl -sf -m 10 "$BASE/api/health?t=$(date +%s)" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit") or "")' 2>/dev/null || true)
  if [ -n "$deployed" ]; then
    if [ "$deployed" = "$SHA" ]; then echo "Deployment of ${SHA::7} is live after ${elapsed}s."; exit 0; fi
    # A newer deployment that already contains this commit is fine to test.
    if git merge-base --is-ancestor "$SHA" "$deployed" 2>/dev/null; then echo "A newer deployment (${deployed::7}) containing ${SHA::7} is live after ${elapsed}s."; exit 0; fi
    [ "$deployed" != "$seen" ] && echo "Live: ${deployed::7}; waiting for ${SHA::7}…" && seen=$deployed
  elif [ "$elapsed" -ge 180 ]; then
    echo "::warning title=Deployment check::$BASE does not report its commit; continued after the fixed 180 s fallback."
    exit 0
  fi
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "::error title=Deployment check::${SHA::7} was not live on $BASE after ${TIMEOUT}s (live: ${deployed:-unknown})."
    exit 1
  fi
  sleep 10
done
