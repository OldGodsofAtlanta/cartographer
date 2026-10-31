# Lakes (layer `lakes`)

Lakes, reservoirs, ponds and the Okefenokee outline, dated by when the water was impounded.

## Sources

- OpenStreetMap water polygons via Overpass API (`https://overpass-api.de/api/interpreter`, fallback `https://overpass.private.coffee/api/interpreter`). Query: `way`/`relation` with `natural=water` or `landuse=reservoir`, bbox 30.2,-86.0,35.3,-80.5, fetched 2026-10-27 in 30 tiles of about 1° × 1°.
- Okefenokee: OSM Overpass query for `natural=wetland` named Okefenokee, same bbox. **No polygon found** (see gaps).
- USACE National Inventory of Dams (NID) national CSV export, `https://nid.sec.usace.army.mil/api/nation/csv?state=GA` (the parameter is ignored; the file holds all states). Data last updated 2026-10-27. 92,692 dams; 16,079 in GA, AL, FL, SC, NC, TN are used for matching.
- Wikipedia (fetched 2026-10-27 via WebFetch) for lake-fill dates: Lake Lanier, Allatoona, Harding, Hartwell, Clarks Hill, West Point, Sinclair, Lake Jackson (Lloyd Shoals), Tallulah, Rabun, Walter F. George, Seminole, Blackshear.
- Piedmont Park (Lake Clara Meer) and Grant Park (Lake Abana) history via WebSearch: Atlanta Magazine, Georgia Encyclopedia, Piedmont Park Conservancy, theatlanta100.com. Lakewood: no source found for the lake's date.

## Licence and attribution

- OSM data: ODbL 1.0, © OpenStreetMap contributors. Requires attribution and share-alike for derived databases.
- NID: US Government work (public domain).
- Print line: **© OpenStreetMap contributors (ODbL); dam dates from the USACE National Inventory of Dams**

## Processing (`scripts/fetch-lakes.js`)

1. `download`: fetch 30 OSM tiles, Okefenokee query and NID CSV to `sources/raw/lakes/` (not committed).
2. Keep elements tagged `natural=water` or `landuse=reservoir`, with `water` one of lake, reservoir, pond or absent. Ways that are members of a kept multipolygon are dropped.
3. Build geometry: ways with closed rings become polygons; relations are stitched from outer and inner member ways by endpoint matching. Inner rings are kept as holes when they lie inside an outer ring.
4. Area: equirectangular projection (planar, lon scaled by cos latitude).
5. Statewide features: area ≥ 1 km². Atlanta extras: named, 0.01 km² ≤ area < 1 km², inside the Atlanta bbox 33.55,-84.65,34.00,-84.10. Larger Atlanta features come from the statewide set.
6. Dating: NID dams with a year completed within 1 km of the polygon's boundary (planar, lon scaled). Name match (lake name tokens in NID dam name, other names, former names or river) wins; otherwise the largest candidate by normal storage. Date source is `NID: <dam name>`, marked "nearest largest; name not matched" when no name matched. If no NID dam: OSM `start_date` if present, else unknown.
7. Overrides (`OVERRIDES` in the script) take precedence when a source gives a first-fill year. Each has its source in `date_source`.
8. Statewide geometry simplified with `npx mapshaper -simplify 15% keep-shapes`, precision 0.0001. Atlanta extras written at 0.00001.

## Kinds

- `reservoir`: `water=reservoir`, `landuse=reservoir`, or a NID dam is matched.
- `lake`: other lakes (natural or unknown).
- `pond`: `water=pond`.
- `swamp`: none (Okefenokee polygon missing).

## Start and end

- `start`: year from NID "Year Completed", or from an override where a source gives the year the water first filled. Where the dam year and the first-fill year differ, the override is used.
- `end`: null for all. Only Lake Abana (drained in the 1960s, approximate) would have an end year, but it is not in the OSM data.
- `date_quality`: `documented` (NID or a cited source), `approximate` (Lake Clara Meer), `unknown` (no source), `natural` (none).

## Counts (395 features, 2.85 MB)

- By kind: reservoir 291, lake 97, pond 7, swamp 0.
- By date_quality: documented 271, approximate 1, unknown 123.
- By start decade: 1860s 1, 1890s 1, 1900s 5, 1910s 9, 1920s 14, 1930s 16, 1940s 26, 1950s 74, 1960s 58, 1970s 40, 1980s 14, 1990s 8, 2000s 4, 2010s 2, unknown 123.
- Area ≥ 1 km² statewide: 210. Atlanta extras: 185.
- Unnamed: 62 (name is "").

## Sanity checks

| Lake | start | Source |
| --- | --- | --- |
| Lake Lanier | 1956 | Wikipedia: filling began 1 Feb 1956 (NID differs; see build-report) |
| Lake Allatoona | 1949 | Wikipedia: dam completed 1949, filling Dec 1949 (NID 1950 expected; not checked in output) |
| Lake Hartwell | 1962 | NID Hartwell Dam |
| Clarks Hill / Thurmond | 1951 | Wikipedia: filling 1951-52 (dam completed 1954) |
| Lake Sinclair | 1953 | Wikipedia: "created in 1953" |
| Jackson Lake | 1911 | Wikipedia "Lake Jackson (Georgia)": Lloyd Shoals Dam completed 1911 (built 1910). Coordinator confirmed Jackson Lake is this reservoir |
| Lake Burton | 1927 | NID Burton (dam); not checked against Wikipedia (the page fetched was a disambiguation) |
| Lake Tallulah | 1914 | Wikipedia: formed 1914 with Tallulah Falls Dam. The OSM polygon "Tallulah Falls Lake" is below 1 km² and is not in the layer |
| Lake Rabun | 1925 | NID Mathis & Terrora (matched by location); Wikipedia: Mathis Dam completed 1915, filled about 1925 |
| Lake Blackshear | 1930 | NID Crisp County (Warwick) |
| Lake Seminole | 1954 | NID Jim Woodruff Lock and Dam; Wikipedia says dam completed 1952 |
| Lake Harding | 1926 | Wikipedia: built 1926 by Columbus Power Co. |
| Goat Rock | 1959 (as Lake Oliver) | NID Oliver Dam (1959); Goat Rock Dam (1912) is the earlier impoundment, now part of Lake Oliver |
| West Point Lake | 1974 | Wikipedia: filling began 16 Oct 1974 |
| Walter F. George | 1962 | NID Walter F. George Lock and Dam; Wikipedia gives 1963 naming as Eufaula |
| Lake Clara Meer | 1895 (approximate) | Piedmont Park history: enlarged for 1895 exposition (1887 spring-fed pond before) |
| Lake Abana (Grant Park) | not in data | OSM has no polygon; drained in 1960s per Atlanta Magazine |
| Lakewood Fairgrounds Lake | 1950 | NID Lakewood Fairgrounds Lake Dam. Lakewood Park's 1893 opening is for the park, not the lake |

## Known gaps and errors

- Okefenokee Swamp: no OSM polygon in the bbox (node `369140059`, `natural=wetland`, `wikidata=Q2162020`, is a point). Not in the layer.
- Disagreements: the build's automatic OSM `start_date` vs NID check recorded no conflicts (`build-report.json` disagreements list is empty). Known Wikipedia-vs-NID conflicts are noted in the sanity table above.
- Name-unmatched NID dams: many small Atlanta-area lakes (e.g. Lake Tahoe, Browns Lake) take the largest nearby NID dam, which may be a different structure. Treat their dates as weak.
- Mapshaper repaired 102 self-intersections in the simplified statewide layer and could not repair 40; a few polygons may look slightly off. Source: build log.
- Unknown dates (123): mostly small Atlanta-area ponds and lakes with no NID dam and no OSM start date. Their `start` is null, so the app will show them only with "show undated".
- 62 unnamed features have `name: ""`.
- Lake Walter F. George: OSM has three polygons under related names; all are dated 1962 by override.
- Lakewood: no date source found for the lake; the entry dated 1950 is the NID Lakewood Fairgrounds Lake Dam (small, 0.03 km²).
- Atlanta extras include 185 small named water bodies; most are dated only by nearby NID dams.

## Changes after the first build (2026-10-27)

- **Unmatched dam dates are `approximate`, not `documented`.** When no National Inventory of Dams entry within 1 km shares a word with the lake's name, the build takes the largest nearby dam's year. That dam may belong to another pond, or be a later rebuild, so these 79 features are now `approximate` (their `date_source` says "name not matched"). They are still drawn by that year.
- **Lakewood Fairgrounds Lake: start 1875, approximate.** NID's "Year Completed" is 1950, which would hide the lake from every earlier map. The city's first waterworks stood at Lakewood and began pumping from the South River on 11 September 1875 ([waterworkshistory.us](https://www.waterworkshistory.us/GA/Atlanta/), citing the *Atlanta Constitution*, 12 Sep 1875; the NPS nomination for the Hemphill Avenue Station says the original works served a reservoir). The lake is taken to be that impoundment and NID's 1950 to be a later dam. **Not verified:** check Garrett, *Atlanta and Environs*, pp. 914–916, for when the lake was made. Its name is modern: rename it on a map before the fairgrounds (1916).
