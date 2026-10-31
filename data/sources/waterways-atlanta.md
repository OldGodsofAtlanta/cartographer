# waterways-atlanta

Named rivers, creeks and canals of metro Atlanta, for city maps. Layer id `waterways-atlanta`. File: `data/waterways-atlanta.geojson`.

## Source

- OpenStreetMap via Overpass API. Query: `scripts/queries/waterways-atlanta.ql`. Fetched 2026-10-27 from `https://overpass.private.coffee/api/interpreter` (`overpass-api.de` returned HTTP 406 for this query).
- OSM data timestamp: 2026-07-24T11:04:51Z (from the Overpass response; a rerun on 2026-10-27 replaced an earlier 2026-07-15 snapshot).
- Raw download: `sources/raw/waterways-atlanta/overpass.json` (not committed).
- Licence: ODbL 1.0 (© OpenStreetMap contributors). Output is a derived extract.
- Attribution line: "© OpenStreetMap contributors (ODbL)".
- Build: `scripts/fetch-waterways-atlanta.sh`, with `scripts/overpass-to-geojson.mjs` and `scripts/check-waterways.py`.

## Processing

1. Query: `waterway` in (river, stream, canal) with a `name` tag, bbox 33.55,-84.65,34.00,-84.10 (south,west,north,east). 1,914 ways.
2. Converter sets `kind`: `river` for waterway=river, `canal` for canal, `creek` for stream.
3. `culvert: true` when `tunnel=culvert`, or `culvert=yes`, or a `tunnel` tag other than `no` with `layer` below 0. 501 ways.
4. Not dissolved. Not simplified. Precision 0.00001 (about 1 m).

## Kinds

- `creek`: OSM `waterway=stream`. 1,890 features.
- `river`: OSM `waterway=river`. 23 features (Chattahoochee and Flint, and parts of South River).
- `canal`: OSM `waterway=canal`. 1 feature: "Little Hooch River", which OSM tags as a canal. Its name suggests a river; check before use.

Flint River and South River each have both `creek` and `river` pieces, because OSM tags parts of them differently.

## Dates

- Rivers and creeks: `start: null, end: null, date_quality: "natural"`, date_source "Natural watercourse (OpenStreetMap waterway tag)".
- Canal (1 feature): `start: null, end: null, date_quality: "unknown"`. No year in OSM.
- Culverted segments are dated like the rest: they are natural creeks that were later covered. Use the `culvert` flag to show them as covered for the period, not as a date.

## Feature counts

- Total 1,914 LineStrings. Culverted 501.
- By kind: creek 1,890, river 23, canal 1.
- Bbox: lon -84.74..-84.08, lat 33.54..34.05.
- File size: 1.4 MB.

## Known gaps and errors

- Creek names are from OSM and may differ from period names (e.g. "Peachtree Creek" vs. period usage). Use `names` for period labels when a source gives them.
- No dates from OSM; culverting years are unknown, so every culvert is a current-state value.
- Pieces of one creek in OSM may be split at county, culvert or junction points; they are not joined.
- The Chattahoochee and Flint are only partly in bbox; the bbox cut is at the bbox edge.
- Checked present: Peachtree Creek, North Fork Peachtree Creek, Proctor Creek, Tanyard Creek, Clear Creek, Intrenchment Creek, Sugar Creek, South River, Utoy Creek, Nancy Creek, Flint River, Chattahoochee River.
