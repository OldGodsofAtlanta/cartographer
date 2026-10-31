# town-streets, town-railroads, town-waterways, terrain-mcdonough / -gainesville / -lithonia

Base maps for the towns outside the Atlanta street coverage: Marietta (Dead Freight, Second Hearing), Decatur (Brick Dust, Still Pending), McDonough (High Water), Gainesville (Piece Work) and Lithonia (Star Drill). Built by `scripts/build-towns.js` from OpenStreetMap extracts (`scripts/queries/town-*.ql`, fetched with `scripts/overpass-get.sh` into `sources/raw/towns/`) and `scripts/build-terrain.js`.

**Status (2026-10-28):** all five towns are built. The main Overpass server and its usual fallback timed out repeatedly for Lithonia; the extract came from the French mirror (`https://overpass.openstreetmap.fr/api/interpreter`) instead, with a smaller box (33.695–33.735, -84.125 to -84.085). If a download stalls again, try that mirror directly with `curl -A "<your agent> (<contact>)" --data-urlencode data@scripts/queries/town-<name>.ql`.

## What each layer is

- **`town-streets`**: named streets (not service roads, paths or tracks) whose midpoint is within a radius of the town's centre: Marietta 2.0 km, Decatur 1.8, Lithonia 1.5, McDonough 1.5, Gainesville 2.5. **Today's street pattern, undated**: `date_quality: "unknown"`, so it draws only when "undated" is on, and the map's credit line says "present-day pattern". Cutting at the town core drops most post-war subdivisions but not all of them: Gainesville in particular carries expressways and parkways (Jesse Jewell Parkway, Browns Bridge Road) that did not exist in 1936. For Marietta and Decatur, lay the Sanborn sheets under it (`sanborn-marietta-square-1885`, the two Decatur 1911 sheets) to see the real grid.
- **`town-railroads`**: OpenStreetMap rail ways, dated by matching three points on each to Jeremy Atack's segments (within 400 m of the same segment): `start` = Atack's year in operation, `date_quality: "approximate"`. Ways that match nothing are undated. Atack's licence is unconfirmed (see `railroads-historical.md`). Where a town has a track OpenStreetMap names for a modern bridge (McDonough's "Camp Creek Bridge"), the name is today's.
- **`town-waterways`**: named rivers, creeks and canals; natural, so they draw in any year. Names are today's.
- **`terrain-mcdonough`, `-gainesville`, `-lithonia`**: 10 ft contours from USGS 3DEP, same method and same caveat (modern ground) as `terrain.md`.

## Sample maps

`projects/marietta-1879.json` (Dead Freight), `decatur-1916.json` (Still Pending), `high-water-1900.json` (McDonough and Camp Creek), `piece-work-1936.json` (Gainesville). Second Hearing can reuse the Marietta map at 1915; Brick Dust the Decatur one at 1908. `star-drill-1891.json` (Lithonia). In that map the large ring north of the town is a quarry pit as it is today: the contours are modern, and the 1891 quarries were far smaller.

## Sites added or moved with these layers

- **Camp Creek trestle** (`camp-creek`): now the crossing of Camp Creek by the Norfolk Southern line, which OpenStreetMap names "Camp Creek Bridge", 1.1 miles straight-line north of McDonough's centre (the canon says a mile and a half). The present bridge is not necessarily where the 1900 trestle stood; no source I read pins the wreck.
- **Cooper Pants Factory** (`cooper-pants-factory`): the crossing of Broad Street Southwest and Maple Street in Gainesville. The canon says West Broad and Maple; the crossing, not the lot.

## Licence

OpenStreetMap: ODbL, credit "© OpenStreetMap contributors". Map images are produced works, so only attribution is needed. USGS elevation: public domain.
