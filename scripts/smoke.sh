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
check "positioning metadata"  /positioning                             200 '<title>[^<]*[Pp]ositioning'
check "CFTC COT overview"     /api/cot                                 200 '"missing":\[\]'
check "CFTC COT history"      '/api/cot/088691?years=3'                200 '"openInterest":[0-9]'
check "brain metadata"        /brain                                   200 '<title>[^<]*Brain'
check "share page metadata"   /share                                   200 '<title>[^<]*Share'
check "og:image on homepage"  /                                        200 'property="og:image" content="https://aurorav.app/media/og.png"'
check "twitter card"          /                                        200 'name="twitter:card" content="summary_large_image"'
check "route preview image"   /radar                                   200 'content="https://aurorav.app/media/og-radar.png"'
check "OG image file"         /media/og.png                            200 ''
check "story video file"      /media/story.mp4                         200 ''
check "macro metadata"        /macro                                   200 '<title>[^<]*Macro'
check "ECB macro overview"    /api/macro                               200 '"missing":\[\]'
check "ECB series history"    '/api/macro/ECB-DFR?years=10'            200 '"value":[0-9-]'
check "currency metadata"     /currency                                200 '<title>[^<]*[Pp]urchasing power'
check "currency (World Bank)" /api/currency/AUT                        200 '"cpi":\[\{"year"'
check "bad indicator rejected" '/api/compare/2022?x=BAD.ID'            400 'Unsupported'
check "unknown API route"     /api/does-not-exist                      404 'Not found'

asset=$(curl -sS -m 20 "$base/" 2>/dev/null | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1 || true)
if [[ -n "$asset" ]]; then check "JS bundle" "$asset" 200 ''; else results+=("FAIL JS bundle (no /assets/index-*.js in homepage)"); fail=1; fi

# Informational (never fails the run): is Supabase auth configured, is the schema applied, how is sign-up set up?
# Uses only public values: /api/config exposes the project URL and anon key by design. No key is printed.
auth_status() {
  local cfg url key code settings
  cfg=$(curl -sS -m 20 "$base/api/config" 2>/dev/null || true)
  url=$(printf '%s' "$cfg" | python3 -c 'import json,sys; c=json.load(sys.stdin).get("supabase") or {}; print(c.get("url",""))' 2>/dev/null || true)
  key=$(printf '%s' "$cfg" | python3 -c 'import json,sys; c=json.load(sys.stdin).get("supabase") or {}; print(c.get("anonKey",""))' 2>/dev/null || true)
  if [[ -z "$url" || -z "$key" ]]; then echo "not configured (SUPABASE_URL / SUPABASE_ANON_KEY not set on the Worker)"; return; fi
  code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -H "apikey: $key" -H "Authorization: Bearer $key" "$url/rest/v1/profiles?select=id&limit=1" 2>/dev/null || echo 000)
  local schema="profiles table missing (migration not applied, HTTP $code)"
  # The migration revokes all guest (anon) access, so PostgREST answers 401/403 for an existing table and 404 for a missing one.
  [[ "$code" == "401" || "$code" == "403" ]] && schema="schema applied (profiles table exists, guest access denied)"
  [[ "$code" == "200" ]] && schema="profiles table readable by guests (older migration: re-run the current one)"
  settings=$(curl -sS -m 20 -H "apikey: $key" "$url/auth/v1/settings" 2>/dev/null | python3 -c '
import json, sys
s = json.load(sys.stdin)
signup = "on" if s.get("external", {}).get("email") and not s.get("disable_signup") else "off"
confirm = "off" if s.get("mailer_autoconfirm") else "required"
print("email sign-up " + signup + ", email confirmation " + confirm)' 2>/dev/null || echo "auth settings unreadable")
  echo "configured ($(printf '%s' "$url" | sed -E 's#https?://([^.]+)\..*#\1#')…); $schema; $settings"
}
auth="Auth: $(auth_status)"
echo "$auth"
[[ -n "${GITHUB_ACTIONS:-}" ]] && echo "::notice title=Auth status::$auth"

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
