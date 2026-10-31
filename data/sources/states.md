# states

State outlines for Georgia and its five neighbours, clipped to a box that covers the map area.

## Sources

- U.S. Census Bureau, Cartographic Boundary File, 2023, 1:500,000: https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_500k.zip (3.2 MB; NAD83 geographic)
- Fetched: 2026-10-27

## Licence and attribution

U.S. federal government work: public domain. Attribution is courtesy only.

Attribution line for a map:

> Source: U.S. Census Bureau, Cartographic Boundary File, 2023 (1:500,000).

## Processing

Script: `scripts/fetch-states.sh`.

1. Download and unzip into `sources/raw/states/`.
2. mapshaper: reproject to WGS84.
3. Keep six states by `STATEFP`: 13 Georgia, 01 Alabama, 12 Florida, 45 South Carolina, 37 North Carolina, 47 Tennessee (6 of 56 features).
4. Clip to bbox -88.5, 29.0, -78.5, 36.8.
5. Set `kind: "state"` and `date_quality: "natural"`. Rename `NAME` to `name`. Drop every other field.

## Properties

| Property | Value |
| --- | --- |
| `name` | Census `NAME` (e.g. "Georgia") |
| `kind` | `state` |
| `date_quality` | `natural` |

No `start` or `end`: state lines in this box did not change in 1870–1945, so the layer is always drawn.

## Kinds

- `state`: 6 features.

## Counts and checks

- Output: 6 features, 250,408 bytes (under the 2 MB target), bbox -88.5, 29.0, -78.5, 36.6781 (the north edge is the Tennessee/North Carolina border, inside the requested box).
- Geometry: MultiPolygon and Polygon.

## Known gaps

- The Census cartographic boundary files are generalized and clipped to the shoreline. They are not the legal boundary and do not match the TIGER/Line full-resolution file, so coastline detail is approximate.
