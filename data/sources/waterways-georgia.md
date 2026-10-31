# waterways-georgia

Rivers and canals of Georgia and the surrounding bbox, for state-scale maps. Layer id `waterways-georgia`. File: `data/waterways-georgia.geojson`.

## Source

- OpenStreetMap via Overpass API. Query: `scripts/queries/waterways-georgia.ql`. Endpoint: `https://overpass-api.de/api/interpreter` (fallback `https://overpass.private.coffee/api/interpreter`).
- OSM data timestamp: 2026-05-31T22:37:44Z (from the Overpass response). Fetched 2026-10-27.
- Raw download: `sources/raw/waterways-georgia/overpass.json` (not committed).
- Licence: ODbL 1.0 (© OpenStreetMap contributors). Share-alike applies to derived databases; the output is a derived extract.
- Attribution line: "© OpenStreetMap contributors (ODbL)".
- Build: `scripts/fetch-waterways-georgia.sh`, with `scripts/overpass-to-geojson.mjs` and `scripts/check-waterways.py`.

## Processing

1. Query: ways with `waterway=river` or `waterway=canal` in bbox 30.2,-86.0,35.3,-80.5, plus `waterway=stream` ways whose name ends in "River". Ways are selected if they touch the bbox, so pieces outside it are kept whole.
2. Converter keeps the same tags. Named pieces are grouped by name and kind. Unnamed pieces are kept only if 2 km or longer (great-circle length) and are not merged.
3. Named pieces dissolved with mapshaper (`-dissolve key`, one feature per name+kind): 7,623 pieces became 797 features.
4. Combined with the unnamed pieces, `-filter-fields`, `-simplify 15% keep-shapes`, precision 0.0001.
5. Simplification collapsed 5 very short canal pieces to null geometry; these were dropped (931 to 926 features).

## Kinds

- `river`: OSM `waterway=river`, and `waterway=stream` named "...River". 727 features.
- `canal`: OSM `waterway=canal`. 199 features.

Note: some OSM ways tagged `waterway=river` are creeks by name (e.g. "Fishing Creek", "Rocky Creek"); they are `kind: river` because that is the OSM tag.

## Dates

- Rivers: `start: null, end: null, date_quality: "natural"`, date_source "Natural watercourse (OpenStreetMap waterway tag)".
- Canals, 197 features: no year in OSM or a checked source. `start: null, end: null, date_quality: "unknown"`.
- "Savannah and Ogeechee Canal" and "... - Historical Property" (2 features): `start: 1830, date_quality: "approximate"`. Sources disagree: Georgia historical marker gives completion in 1830; Chatham County HPC minutes (2006) say it opened in 1830 and 1831; Georgia Encyclopedia gives 1829. Used 1830. `end: null`: the canal worked until about 1890, but no single end year is given.

## Feature counts

- Total 926. Lines (LineString) 708, multi-part (MultiLineString) 218.
- By kind: river 727, canal 199.
- Bbox: lon -87.60..-80.16, lat 29.96..35.44. The query bbox reaches into Alabama, Florida, South Carolina, North Carolina and Tennessee, so out-of-state rivers (e.g. Tallapoosa, Tennessee tributaries, Edisto) are present. Tiling to Georgia only was not done.
- File size: 1.6 MB.

## Known gaps and errors

- Same-name rivers far apart are merged into one multi-part feature by name+kind. Example: "Little River" is one MultiLineString of 17 parts, across several drainages. Many names (e.g. "Little River", "Rocky Creek", "New River") repeat across the state. Treat them as one label.
- 20 names appear as both river and canal, or as stream and river. They are kept as separate features per kind.
- Names as in OSM: "Saint Marys River" (not "St. Marys"), "Oostanaula River", "Coosa River", "Chattahoochee River".
- Only named river/canal ways are labelled; unnamed pieces of 2 km or more (134 ways) have no name.
- Pieces shorter than 2 km with no name (9,473 ways) were dropped.
- Canal dates: almost all canals are modern drainage or irrigation canals, and have no year. Only the Savannah and Ogeechee Canal has a start year.
- The mapshaper simplification reported 1 intersection it could not repair; it is a minor artefact.
- OSM has no start/end dates for any waterway, so river start/end are never set.
