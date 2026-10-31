# Atlanta 1878 blocks and horse routes (`atlanta-blocks-1878`, `atlanta-horsecars-1878`)

Files: `data/atlanta-blocks-1878.geojson`, `data/atlanta-horsecars-1878.geojson`
Build: `scripts/fetch-atlanta-1878.sh` (with `scripts/atlanta-1878-clean.js`, `scripts/atlanta-1878-drop-null.js`)
Date fetched: 2026-10-27

## Source
- ECDS GeoServer, workspace `Atlanta1878`, WFS GetFeature (EPSG:4326): https://geoserver.ecds.emory.edu/wfs
  - `Atlanta1878:ATL1878_City_Blocks` (1,062 MultiPolygon)
  - `Atlanta1878:ATL1878_Horse_Routes` (18 MultiLineString)
- Publisher: Digital Visualization Lab, Emory Center for Digital Scholarship, Emory University (the GeoServer attribution).
- Licence: not stated. GeoServer lists AccessConstraints NONE. Confirm reuse with ECDS before redistribution.
- Attribution to print: "Digital Visualization Lab, Emory Center for Digital Scholarship, Emory University"

## Processing
- Blocks: mapshaper `-o precision=0.00001` (no simplification). One sliver block (OBJECTID 972) became empty at that precision and was dropped (1,062 to 1,061). Output is 0.37 MB.
- Horse routes: `precision=0.00001`. Output 0.01 MB.
- Properties: `kind` ("block" or "horsecar"), `date_quality: "snapshot"`, `date_source` (ECDS OpenWorld Atlanta, 1878 blocks / horse routes), `id` (source OBJECTID).

## Gaps
- Blocks have no block number, ward or name field in the source.
- Horse routes have no route or company name; `name` is omitted. The source `Id` field is 0 on every route, so it was dropped.
- The horse routes' date is the layer's 1878 survey year, not a verified route opening year.
