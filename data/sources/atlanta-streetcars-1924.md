# Atlanta streetcar routes, 1924 (`atlanta-streetcars-1924`)

File: `data/atlanta-streetcars-1924.geojson`. Build: `scripts/fetch-atlanta-streetcars-1924.sh` (with `scripts/atlanta-streetcars-1924-clean.js`). Fetched 2026-10-27.

## Source
- ECDS GeoServer, layer `StreetcarRoutes:streetcars1924` (WFS, EPSG:4326): https://geoserver.ecds.emory.edu/wfs
- Attribution: Digital Visualization Lab, Emory Center for Digital Scholarship, Emory University.
- Licence: not stated (GeoServer AccessConstraints NONE). Confirm reuse with ECDS.

## Choice
The combined layer carries `R_Name` and `Route_num` for every route, so the per-route layers `StreetcarRoutes:1924_Route_1` to `_24` were not needed.

## Properties
- `name`: `R_Name` (e.g. "Decatur St- Marietta St", "Ponce de Leon-West View").
- `kind`: "streetcar".
- `route`: the route number (string).
- `date_quality`: "snapshot"; `date_source`: "ECDS GeoServer StreetcarRoutes:streetcars1924, 1924".

## Counts
- 30 features covering 24 routes (MultiLineString 25, LineString 5). Routes 8 and 10 have several pieces each (named the same). The source's `TYPE` field (all "boundary") and the `bbox` and `Shape_*` fields were dropped.
- Size 0.16 MB.

## Gaps
- The layer's year is 1924, not an opening or abandonment date per route.
- Sidings and support buildings (`StreetcarRoutes:1924_Sidings`, `1924_SupportBuildings`) were not fetched.
