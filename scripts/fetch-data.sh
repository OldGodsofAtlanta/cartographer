#!/usr/bin/env bash
# Pulls every external source the map maker uses and rebuilds the layers in data/ that come from them.
#
#   scripts/fetch-data.sh                 fetch and build whatever is missing
#   scripts/fetch-data.sh --list          show the steps, what each makes, and whether it is there
#   scripts/fetch-data.sh --only a,b      just those steps (names from --list)
#   scripts/fetch-data.sh --skip a,b      everything but those (lakes and terrain are the big ones: about 600 MB)
#   scripts/fetch-data.sh --force         run the steps even when their output exists (cached downloads are reused)
#   scripts/fetch-data.sh --refresh       as --force, and download again: raw files for the steps are deleted first
#
# Raw downloads go to sources/raw/ and are not committed. The built layers go to data/ and are committed as
# snapshots, so the deploy workflow does not run this. Also committed, and written or inferred here: catalog.json, backdrops.json, the sites and
# neighbourhood sources and their layers, the 1878 and 1911 street layers, the street-name tables, georgia-counties.json,
# us-states.json (their source wasn't recorded) and the notes in data/sources/.
#
# Needs: node 20+, npm packages installed (mapshaper), curl, unzip, python3. OpenStreetMap layers are rebuilt from
# today's OpenStreetMap, so they will differ a little from the first build (2026-10-27); the others come from fixed
# files. Each step is one script and can be run on its own; a step that fails stops the run.
set -euo pipefail
cd "$(dirname "$0")/.."

# name | output that shows the step is done | what it downloads (approximate) | command
STEPS=(
  "states|data/states.geojson|Census cartographic boundaries, 8 MB|bash scripts/fetch-states.sh"
  "ga-counties-historical|data/ga-counties-historical.geojson|Newberry Atlas of Historical County Boundaries, 54 MB|bash scripts/fetch-ga-counties-historical.sh"
  "railroads-historical|data/railroads-historical.geojson|Atack railroad shapefile (Vanderbilt), 53 MB|bash scripts/fetch-railroads-historical.sh"
  "atlanta-limits|data/atlanta-limits.geojson|Emory ECDS annexations, under 1 MB|bash scripts/fetch-atlanta-limits.sh"
  "atlanta-1878|data/atlanta-blocks-1878.geojson|Emory ECDS 1878 blocks and horse-car routes, 2 MB|bash scripts/fetch-atlanta-1878.sh"
  "atlanta-streetcars-1924|data/atlanta-streetcars-1924.geojson|Emory ECDS 1924 streetcar routes, 1 MB|bash scripts/fetch-atlanta-streetcars-1924.sh"
  "atlanta-streets-1928|data/atlanta-streets-1928.geojson|Emory ECDS 1928 road system, 20 MB|bash scripts/fetch-atlanta-streets-1928.sh"
  "atlanta-streets-osm|data/atlanta-streets-osm.geojson|OpenStreetMap streets (Overpass), 24 MB|bash scripts/fetch-atlanta-streets-osm.sh"
  "railroads-atlanta|data/railroads-atlanta.geojson|OpenStreetMap track (Overpass), 3 MB|bash scripts/fetch-railroads-atlanta.sh"
  "waterways-atlanta|data/waterways-atlanta.geojson|OpenStreetMap creeks (Overpass), 5 MB|bash scripts/fetch-waterways-atlanta.sh"
  "waterways-georgia|data/waterways-georgia.geojson|OpenStreetMap rivers (Overpass), 64 MB|bash scripts/fetch-waterways-georgia.sh"
  "ga-places|data/ga-places.geojson|Census gazetteer and Wikipedia articles, 12 MB, a few hundred requests|node scripts/fetch-ga-places.js"
  "lakes|data/lakes.geojson|OpenStreetMap lakes and the Corps' dam inventory, 470 MB|node scripts/fetch-lakes.js download && node scripts/fetch-lakes.js build"
  "terrain|data/terrain-georgia.geojson|USGS 3DEP elevation grids, 150 MB|node scripts/build-terrain.js all && node scripts/build-terrain.js towns"
  "towns|data/town-streets.geojson|OpenStreetMap extracts for five towns (Overpass), 7 MB|fetch_towns"
  "street-names|data/atlanta-streets-1928.geojson|(nothing: adds period street names to the street layers)|node scripts/apply-street-renames.js && node scripts/build-street-names-1903.js >/dev/null"
)
# terrain also makes terrain-atlanta, -city and the three town sheets; towns makes the town-* layers.
OUTPUTS_EXTRA=(
  "terrain|data/terrain-atlanta.geojson data/terrain-city.geojson data/terrain-mcdonough.geojson data/terrain-gainesville.geojson data/terrain-lithonia.geojson"
  "towns|data/town-railroads.geojson data/town-waterways.geojson"
  "atlanta-1878|data/atlanta-horsecars-1878.geojson"
)

fetch_towns() {
  mkdir -p sources/raw/towns
  for t in decatur gainesville lithonia marietta mcdonough; do
    [ -s "sources/raw/towns/$t.json" ] || bash scripts/overpass-get.sh "scripts/queries/town-$t.ql" "sources/raw/towns/$t.json"
  done
  node scripts/build-towns.js
}

# Steps that need another step's layer first.
needs() {
  case "$1" in
    atlanta-streets-osm) echo atlanta-streets-1928 ;;
    railroads-atlanta|towns) echo railroads-historical ;;
    street-names) echo atlanta-streets-1928 ;;
  esac
}

FORCE=0; REFRESH=0; LIST=0; ONLY=""; SKIP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --refresh) FORCE=1; REFRESH=1 ;;
    --list) LIST=1 ;;
    --only) ONLY=",$2,"; shift ;;
    --skip) SKIP=",$2,"; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
  shift
done

outputs_of() { # the files a step makes
  local name="$1" out="$2" extra=""
  for e in "${OUTPUTS_EXTRA[@]}"; do [ "${e%%|*}" = "$name" ] && extra="${e#*|}"; done
  echo "$out $extra"
}
done_p() { local f; for f in $(outputs_of "$1" "$2"); do [ -s "$f" ] || return 1; done; }
selected() { [ -z "$ONLY" ] || [[ "$ONLY" == *",$1,"* ]]; }
skipped() { [ -n "$SKIP" ] && [[ "$SKIP" == *",$1,"* ]]; }

if [ "$LIST" = 1 ]; then
  printf '%-24s %-8s %s\n' STEP STATE DOWNLOADS
  for s in "${STEPS[@]}"; do
    IFS='|' read -r name out what cmd <<<"$s"
    state=missing; done_p "$name" "$out" && state=present
    if [ "$name" = street-names ]; then state=-; fi
    printf '%-24s %-8s %s\n' "$name" "$state" "$what"
  done
  exit 0
fi

[ -d node_modules/mapshaper ] || { echo "Installing packages (mapshaper is needed by the fetch scripts)"; npm install --no-audit --no-fund; }
for tool in curl unzip python3 node; do command -v "$tool" >/dev/null || { echo "$tool is needed" >&2; exit 1; }; done

ran=0; renamed=0
for s in "${STEPS[@]}"; do
  IFS='|' read -r name out what cmd <<<"$s"
  selected "$name" || continue
  skipped "$name" && { echo "== $name: skipped"; continue; }
  if [ "$name" != street-names ] && [ "$FORCE" = 0 ] && done_p "$name" "$out"; then echo "== $name: present"; continue; fi
  # The street-name step runs after the street layers are built or rebuilt, and only then.
  if [ "$name" = street-names ] && [ "$renamed" = 0 ] && [ "$FORCE" = 0 ] && [ -z "$ONLY" ]; then echo "== $name: nothing rebuilt, left as is"; continue; fi
  dep=$(needs "$name")
  if [ -n "$dep" ]; then
    depout=$(for x in "${STEPS[@]}"; do IFS='|' read -r n o _ <<<"$x"; if [ "$n" = "$dep" ]; then echo "$o"; fi; done)
    [ -s "$depout" ] || { echo "== $name: needs $dep first (it was skipped or failed)" >&2; exit 1; }
  fi
  echo "== $name: $what"
  if [ "$REFRESH" = 1 ]; then
    case "$name" in
      atlanta-1878) rm -rf sources/raw/atlanta-blocks-1878 sources/raw/atlanta-horsecars-1878 ;;
      atlanta-limits) rm -rf sources/raw/annex ;;
      street-names) ;;
      terrain) rm -rf sources/raw/terrain ;;
      *) rm -rf "sources/raw/$name" ;;
    esac
  fi
  eval "$cmd"
  ran=$((ran + 1))
  case "$name" in atlanta-streets-1928|atlanta-streets-osm) renamed=1 ;; esac
done

echo
echo "Ran $ran step(s). Checking the layers against the contract:"
node scripts/check-data.js
