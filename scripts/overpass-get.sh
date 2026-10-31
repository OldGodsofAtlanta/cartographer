#!/usr/bin/env bash
# Usage: overpass-get.sh <query.ql> <out.json>
# POSTs an Overpass QL query as form field `data`, retrying on 429/504 (shared public server).
set -u
QUERY="$1"; OUT="$2"
ENDPOINTS=("https://overpass-api.de/api/interpreter" "https://overpass.private.coffee/api/interpreter" "https://overpass.openstreetmap.fr/api/interpreter")
TMP="$OUT.part"
for attempt in 1 2 3 4 5 6; do
  for ep in "${ENDPOINTS[@]}"; do
    code=$(curl -sS -H "User-Agent: OldGodsofAtlanta-cartographer/0.1" -H "Accept: application/json" -o "$TMP" -w '%{http_code}' --max-time 400 --data-urlencode "data@$QUERY" "$ep") || code=000
    if [ "$code" = "200" ] && head -c1 "$TMP" | grep -q '{'; then
      mv "$TMP" "$OUT"; echo "fetched $ep -> $OUT"; exit 0
    fi
    echo "attempt $attempt via $ep: HTTP $code" >&2
  done
  sleep 45
done
echo "failed to fetch $QUERY" >&2; exit 1
