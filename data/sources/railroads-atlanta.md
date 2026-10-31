# railroads-atlanta

Layer id `railroads-atlanta`. Built by `scripts/fetch-railroads-atlanta.sh` (with `scripts/build-railroads-atlanta.js`). Fetched 2026-10-27. Needs `data/railroads-historical.geojson` built first (`scripts/fetch-railroads-historical.sh`), because undated ways are matched to it.

## Source

- OpenStreetMap, via the Overpass API. Mirror used: https://lz4.overpass-api.de/api/interpreter (the main server returned 502/504 during the fetch; the script also tries overpass-api.de and overpass.private.coffee).
- Query: `way["railway"~"^(rail|abandoned|disused|razed|preserved)$"](33.55,-84.65,34.00,-84.10); out geom;` with `[out:json][timeout:180]`.
- Raw response kept at `sources/raw/railroads-atlanta/overpass.json` (not committed).
- Licence: ODbL 1.0 (https://opendatacommons.org/licenses/odbl/). Share-alike applies to derived databases; check that this layer's use is compatible before publishing.
- Attribution line: "© OpenStreetMap contributors (ODbL)"

## Processing

1. Overpass returns 2,756 ways (whole ways, not clipped to the bbox, so some extend beyond it; the layer's bbox is -84.68797,33.23225,-83.91900,34.05203).
2. Drop: `railway=subway`, any `operator` or `network` matching MARTA, and `usage=tourism`. Dropped: 0 subway, 0 MARTA, 6 tourism; 2,750 kept. The query does not return subway ways, so the subway rule removed nothing.
3. Coordinates rounded to 5 decimals.
4. Properties: `name`, `operator`, `old_name`, `old_operator`, and `historic:operator` (written as `historic_operator`) where present; `kind`; `abandoned` (true for `railway` = abandoned, disused or razed); `start`; `end` (null); `date_quality`; `date_source`.
5. Kind, first rule that applies: `service` in yard/siding/spur/crossover → `yard`; `usage=main` → `main`; `usage` branch or industrial → `branch`; no `service` tag → `main`; anything else → `other` (none occurred).
6. Dates, first rule that applies:
   - `start_date` as a plain year, `YYYY-MM` or `YYYY-MM-DD` → `start` = that year, `documented`, `date_source` "OSM start_date" (197 ways).
   - `start_date` fuzzy (`1980s`, `1972..1978`) → `start` = the leading year, `approximate`, `date_source` "OSM start_date" (298 ways).
   - Otherwise sample the way at 25%, 50% and 75% of its length (planar metres, longitude scaled by cos 33.75°). Find Atack segments within 400 m of all three samples; take the one with the smallest total distance; copy its `start`. `approximate`, `date_source` "matched to Atack segment" (1,679 ways).
   - No match → `start` null, `date_quality` `unknown`, no `date_source` (576 ways).

## Kinds

- `main`: 673
- `branch`: 73
- `yard`: 2,004 (includes `spur` 1,196, `siding` 106, `crossover` 60, `yard` 647 by OSM service tag)
- `other`: 0
- `abandoned` is a boolean flag on any kind: 1,122 features.

## Counts

- Features: 2,750. Size: 1.3 MB.
- date_quality: documented 197, approximate 1,977 (298 from fuzzy `start_date`, 1,679 matched), unknown 576.
- Start decades: 1830s 40, 1840s 275, 1850s 483, 1860s 24, 1870s 317, 1880s 160, 1890s 453, 1940s 3, 1950s 18, 1960s 102, 1970s 150, 1980s 51, 1990s 29, 2000s 24, 2010s 36, 2020s 9.
- Features with a name: 818.

## Known gaps and errors

- `end` is null for every way. OSM does not carry closing dates here, and `abandoned` / `disused` / `razed` ways are shown as existing. Their true end is unknown; the map style should key on `abandoned`, not on the date range, for these.
- The Atack match is a planar 400 m test against a 1:100,000-scale network that lacks many yards and spurs. Matches for yard and spur tracks are therefore weak. Matched dates are `approximate`, and the match can pick a neighbouring line's year when two lines run together.
- Atack's Atlanta-end segments for the Atlanta & West Point are not in the historical layer (nearest 9–10 km out), so ways there match nothing or match a wrong segment.
- `start_date` values such as `2017-9-1` (non-padded) are read as exact years. `1972..1978` takes the first year.
- Overpass returned 502/504 for several minutes during the fetch. The mirror that answered was lz4.overpass-api.de.
- `railway=preserved` ways are included as a query term, but none appeared in this bbox.
