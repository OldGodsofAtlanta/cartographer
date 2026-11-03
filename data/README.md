# Cartographer data

Every layer the map maker can draw lives here as GeoJSON (or TopoJSON), listed in `catalog.json`.

## Files

| Path | What it holds |
| --- | --- |
| `catalog.json` | The layers, their files, default styles, and attribution. The app reads only what is listed here |
| `<layer>.geojson` | One layer's features |
| `sources/<layer>.md` | Where a layer came from: URLs, licence, date fetched, what was done to it, known gaps |
| `../scripts/fetch-<layer>.*` | The script that rebuilds the layer from its sources |
| `../sources/raw/<layer>/` | Raw downloads. Not committed |
| `../scripts/fetch-data.sh` | Pulls every external source and rebuilds the layers that come from them (see below) |

## Rebuilding the data

Two kinds of file live in `data/`.

**Built from external sources, committed as snapshots**: every layer made by `scripts/fetch-data.sh`. These are `states`, `ga-counties-historical`, `railroads-historical`, `railroads-atlanta`, `atlanta-limits`, `atlanta-blocks-1878`, `atlanta-horsecars-1878`, `atlanta-streetcars-1924`, `atlanta-streets-1928`, `atlanta-streets-osm`, `waterways-atlanta`, `waterways-georgia`, `lakes`, `ga-places`, the `terrain-*` contours and the `town-*` layers. They are about 37 MB together. The deploy workflow no longer fetches them: it uses what is committed here. To rebuild them, run `scripts/fetch-data.sh`, then commit the changed files. Their raw downloads (`../sources/raw/`, about 900 MB) are not committed.

**Committed**: what was written or inferred here. `catalog.json`, `backdrops.json` (with `../backdrops/`), `sites-sources.json` and the `canon-sites` layer built from it, `neighborhoods-sources.json` and `black-neighborhoods`, `street-renames.json`, `street-names-1903.json` (from `../sources/street-names-1903.txt`), the traced 1911 street layer and the 1878 streets derived from the 1928 ones and the 1878 blocks, the notes in `sources/`, and two files whose source was never recorded (`georgia-counties.json`, `us-states.json`).

On a fresh checkout, run from `cartographer/`:

```sh
npm install
scripts/fetch-data.sh            # fetch and build whatever is missing: about 650 MB of downloads
scripts/fetch-data.sh --list     # the steps, and which are present
scripts/fetch-data.sh --skip lakes,terrain   # leave out the two big ones (lakes only draw on the statewide map)
```

Each step is the layer's own script (`fetch-<layer>.sh` and friends), so one layer can be rebuilt alone, and a step is skipped when its output exists unless you pass `--force` (reuse the cached downloads) or `--refresh` (download again). The OpenStreetMap layers (`atlanta-streets-osm`, `railroads-atlanta`, `waterways-*`, `lakes`, `town-*`) come from OpenStreetMap as it is on the day you run it, so they will differ a little from the first build (2026-10-27) and from the dates in each source note; the Census, Emory, Newberry, Atack and USGS layers come from fixed files and rebuild the same. The last step adds the period street names to the street layers, so run it whenever a street layer is rebuilt (the script does).

## Format

- GeoJSON `FeatureCollection`, WGS84 longitude/latitude.
- Round coordinates: 4 decimals (about 10 m) for statewide layers, 5 decimals (about 1 m) for Atlanta layers.
- Keep each file under 5 MB. Simplify (`npx mapshaper ... -simplify 15% keep-shapes`) and drop unused properties to get there.
- Polygon winding doesn't matter; the app rewinds rings on load. Don't pass mapshaper's `rfc7946` flag.

## Properties

Every feature may carry these. Anything else is allowed, but keep it small.

| Property | Type | Meaning |
| --- | --- | --- |
| `name` | string | Label text. The name in use for most of 1877–1941, or the modern name if unknown |
| `names` | array | Optional period names: `[{"name": "Wheat Street", "start": 1853, "end": 1893}]`. The app labels with the entry whose span holds the map year, else `name` |
| `kind` | string | Subtype the style keys on (`river`, `creek`, `main`, `branch`, `county-seat`, …). Each layer's source note lists its kinds |
| `start` | integer or null | First year the feature existed: built, opened, laid out, incorporated, created, impounded. `null` = existed before 1870 or unknown, see `date_quality` |
| `end` | integer or null | First year it no longer existed: abandoned, merged, renamed away, drowned, demolished. `null` = still there |
| `start_date` | string | Optional `YYYY-MM-DD`, when the source gives a day (county lines, annexations). First day it existed |
| `end_date` | string | Optional `YYYY-MM-DD`. First day it no longer existed (exclusive) |
| `date_quality` | string | `documented` (a source gives the year), `approximate` (decade or "by" a year), `snapshot` (inferred from the dataset's survey year), `natural` (a natural feature, there throughout), `unknown` |
| `date_source` | string | Short citation for `start`/`end` |

A feature is drawn in year **Y** when `(start == null || start <= Y) && (end == null || Y < end)`. When `start_date` or `end_date` is present, the app compares it with the map date instead (the map date defaults to July 1 of the map year).

In a layer whose catalog entry says `"undated": "hide"`, features with `date_quality: "unknown"` are drawn only when the layer's "show undated" switch is on, so a modern street doesn't turn up in 1877 by accident.

### Populations

Places may carry census counts as `pop`: `{"1870": 21789, "1880": 37409, …}`. The app ranks labels by the latest count at or before the map year.

## Snapshot layers

Some sources are a survey of one year (a street grid traced from an 1878 map, another from 1928). List them as `snapshots` in `catalog.json`; the app draws the snapshot nearest the map year (the earlier one on a tie). A snapshot may set `"labels": false` when its names don't belong to its year. A snapshot with `"within": N` is drawn only within N years of its survey; outside that the layer draws nothing. A project can pin a survey with `"snapshot": <year>` in the layer's settings (for example `"snapshot": 1928` on `atlanta-streets`) when the nearest survey doesn't cover the map's area.
