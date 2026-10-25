#!/usr/bin/env bash
# OpenSky credentials check from a GitHub runner (OpenSky's identity server does not answer Cloudflare Workers).
# Uses the GitHub Actions secrets OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET; prints statuses and counts only, never
# the credentials or the token. One small area request (Budapest region) costs a few of the daily free API credits.
set -uo pipefail
note() { echo "OpenSky (GitHub runner): $1"; [[ -n "${GITHUB_ACTIONS:-}" ]] && echo "::notice title=OpenSky (GitHub runner)::$1"; return 0; }
if [[ -z "${OPENSKY_CLIENT_ID:-}" || -z "${OPENSKY_CLIENT_SECRET:-}" ]]; then
  note "credentials not set as GitHub Actions secrets (OPENSKY_CLIENT_ID, OPENSKY_CLIENT_SECRET)"; exit 0
fi
tok=$(curl -sS -m 25 -X POST https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token \
  -d grant_type=client_credentials --data-urlencode "client_id=$OPENSKY_CLIENT_ID" --data-urlencode "client_secret=$OPENSKY_CLIENT_SECRET" \
  -w '\n%{http_code}' 2>/dev/null || true)
code=$(printf '%s' "$tok" | tail -n1)
access=$(printf '%s' "$tok" | sed '$d' | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)
if [[ "$code" != "200" || -z "$access" ]]; then note "token request failed (HTTP ${code:-000}): check the client id and secret"; exit 0; fi
echo "::add-mask::$access"
res=$(curl -sS -m 25 -H "Authorization: Bearer $access" 'https://opensky-network.org/api/states/all?lamin=46.5&lomin=17.5&lamax=48.5&lomax=20.5' -w '\n%{http_code}' 2>/dev/null || true)
rcode=$(printf '%s' "$res" | tail -n1)
count=$(printf '%s' "$res" | sed '$d' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d.get("states") or []))' 2>/dev/null || echo "?")
note "token OK; states API HTTP ${rcode:-000}, ${count} aircraft in the Budapest test area (not stored or published)"
