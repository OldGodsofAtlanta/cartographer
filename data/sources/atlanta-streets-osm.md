# Atlanta streets, OpenStreetMap (`atlanta-streets-osm`)

Layer file: `data/atlanta-streets-osm.geojson`
Build script: `scripts/fetch-atlanta-streets-osm.sh` (Overpass query in `scripts/atlanta-streets-osm.overpass.txt`; builds with `scripts/atlanta-streets-osm-build.js`; 6 km residential cut is the default)
Date fetched: 2026-10-27 (OSM base timestamp 2026-10-27T21:33:02Z)

## Source

- OpenStreetMap, via the Overpass API: `https://overpass-api.de/api/interpreter` (the `overpass.json` response is in `sources/raw/atlanta-streets-osm/`, not committed).
- Query: `way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential)$"]["name"](33.62,-84.52,33.86,-84.28); out geom;`
- Licence: ODbL 1.0 (© OpenStreetMap contributors).
- Attribution to print: **© OpenStreetMap contributors (ODbL)**

## Processing

1. Overpass returned 19,431 named ways (no motorway, link, service, footway or track values).
2. `kind` = the `highway` value. `name` = `name` tag. `old_name` kept when tagged.
3. Historical match (`in_1928`): each way is sampled at 25%, 50% and 75% of its length. Distances are planar, with longitude scaled by cos(33.75°) and both axes in metres (111,320 m per degree). A way is marked `in_1928: true` when all three samples are within 25 m of a vertex-to-vertex segment of `atlanta-streets-1928.geojson`'s source (the cleaned 1928 road system, unsimplified, all segments named or unnamed). Matching uses a 50 m cell index.
   - Matched ways: `start: null`, `date_quality: "snapshot"`, `date_source: "present in Atlanta 1928 road system (Emory ECDS) 1928"`.
4. Otherwise, if `start_date` is tagged with a four-digit year: `start` = that year, `date_quality: "documented"`, `date_source: "OSM start_date"`.
5. Otherwise: `start: null`, `date_quality: "unknown"`.
6. Size control: residential ways whose midpoint is more than 6 km from Five Points (33.7537, -84.3910) were dropped. The full set (19,431 ways) came to 7.65 MB, over the 5 MB limit. With the 6 km residential cut it is 4.4 MB. 8,001 residential ways were dropped; no other kinds were cut.
7. Coordinates rounded to 5 decimals (`precision=0.00001` via mapshaper's final write).

## Kinds and counts (output)

| kind | features |
| --- | --- |
| residential | 3,429 |
| tertiary | 2,162 |
| secondary | 3,259 |
| primary | 1,384 |
| trunk | 708 |
| unclassified | 488 |
| **total** | **11,430** |

Date quality: `snapshot` 7,802 (`in_1928: true`, `start: null`); `documented` 56 (`start` from `start_date`); `unknown` 3,572.

## Checks

- 11,430 features, all with a name. 0 features without `name`.
- Bbox: -84.54018, 33.61220 to -84.25563, 33.86815 (within the requested 33.62–33.86, -84.52 to -84.28 window, plus a little at the edges of the OSM ways).
- File size: 4.41 MB.
- Properties: `name`, `old_name` (when tagged), `kind`, `start`, `date_quality`, `date_source`, `in_1928` (only when true).

## Known gaps and cautions

- **Match rate is strict.** Ways are matched only if all three samples fall within 25 m of a 1928 segment. Modern alignments (Northside Drive, Peachtree Road) match well, but many arterials that were realigned, widened or renamed (for example Jonesboro Road, Buford Highway, the East-West Connector and Donald Lee Hollowell Parkway) may fail. Treat `in_1928: false` as "not confirmed on the 1928 grid", not as "absent in 1928".
- **22 contradictions.** Ways that match the 1928 grid but carry a `start_date` after 1928 were given the snapshot (`start: null`) rule, as the spec requires. These are worth checking in OSM.
- **Residential coverage.** Residential ways beyond 6 km of Five Points are not in this file. The 1928 grid coverage is wider (it reaches the full ECDS extent), so an unmatched residential way beyond 6 km is not a finding.
- **The 1928 grid's own names** are modern-form (see `atlanta-streets-1928.md`), so the OSM name match is not evidence that the period name was used.
- Only `start_date` gives a start year. No `end_date` or `opening_date` handling.
- Overpass was unreliable during this run (502 and 406 errors); the query was run once successfully from `overpass-api.de` with a User-Agent and `Accept: application/json` header.
