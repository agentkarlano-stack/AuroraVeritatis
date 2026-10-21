#!/usr/bin/env bash
# Read-only HTTP smoke test of a deployed Aurora Veritatis Worker.
# Usage: scripts/smoke.sh https://aurorav.app
# Prints one line per check and a GitHub annotation summary; exits non-zero if any check fails.
set -uo pipefail
base="${1:?base URL required}"
base="${base%/}"
fail=0
results=()

check() { # name, path, expected status, grep pattern (extended regex, may be empty)
  local name=$1 path=$2 want=$3 pattern=$4 body code
  body=$(mktemp)
  code=$(curl -sS -m 20 -A "aurora-smoke/1.0" -o "$body" -w '%{http_code}' "$base$path" 2>/dev/null || echo 000)
  if [[ "$code" == "$want" ]] && { [[ -z "$pattern" ]] || grep -qE "$pattern" "$body"; }; then
    results+=("PASS $name ($code)")
  else
    results+=("FAIL $name (HTTP $code, expected $want${pattern:+ and /$pattern/} | body: $(head -c 240 "$body" | tr -d '\n;'))")
    fail=1
  fi
  rm -f "$body"
}

check "health API"            /api/health                              200 '"status":"ok"'
check "public config API"     /api/config                              200 '\{'
check "homepage HTML"         /                                        200 '<div id="root"'
check "radar route metadata"  /radar                                   200 '<title>[^<]*Radar'
check "dossier metadata"      /countries/DEU                           200 '<title>[^<]*Germany'
check "unknown path noindex"  /this-page-does-not-exist                200 'noindex'
check "favicon"               /favicon.svg                             200 '<svg'
check "World Bank profile"    /api/countries/DEU                       200 '"iso3":"DEU"'
check "World Bank comparison" /api/compare/2022                        200 '"points":\[\{'
check "USGS earthquakes"      /api/events/earthquakes                  200 '"events"'
check "GDACS disasters"       /api/events/disasters                    200 '"events"'
check "bad indicator rejected" '/api/compare/2022?x=BAD.ID'            400 'Unsupported'
check "unknown API route"     /api/does-not-exist                      404 'Not found'

asset=$(curl -sS -m 20 "$base/" 2>/dev/null | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)
if [[ -n "$asset" ]]; then check "JS bundle" "$asset" 200 ''; else results+=("FAIL JS bundle (no /assets/index-*.js in homepage)"); fail=1; fi

printf '%s\n' "${results[@]}"
passed=$(printf '%s\n' "${results[@]}" | grep -c '^PASS' || true)
summary="$base: $passed/${#results[@]} checks passed"
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  if (( fail )); then
    echo "::error title=Smoke test::$summary — $(printf '%s; ' "${results[@]}" | grep -oE 'FAIL[^;]*;' | tr -d '\n')"
  else
    echo "::notice title=Smoke test::$summary"
  fi
fi
echo "$summary"
exit $fail
