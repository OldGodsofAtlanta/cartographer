# Atlanta wards, 1854–1883 (`atlanta-wards`): NOT BUILT

Status: blocked. The ECDS GeoServer returns a server error for every ward layer, so `data/atlanta-wards.geojson` was not written.

## Layers
- `Wards:Wards1854`, `Wards:Wards1871`, `Wards:Wards1874`, `Wards:Wards1883` (listed in the GetCapabilities at https://geoserver.ecds.emory.edu/wfs).

## What was tried (2026-10-27)
- WFS 2.0.0 GetFeature, GeoJSON output, with and without srsName: HTTP 400, `java.lang.IndexOutOfBoundsException: Index 0 out of bounds for length 0`.
- WFS 1.0.0 and 1.1.0: service exception.
- Workspace-path endpoint (`/Wards/ows`, `/Wards/wfs`): same exception or a service error.
- WMS GetMap and GeoWebCache (`/gwc/service/wms`): same exception or a GWC error.

Each layer appears in GetCapabilities with a bounding box, so the data exists. The failure is server-side (probably a broken data store or an empty index), and it may recover later.

## Next step
Ask ECDS (Digital Visualization Lab) to repair the Wards workspace, or get the ward shapefiles another way. Then rebuild with a script that writes `name` ("First Ward" etc.), `kind: "ward"`, `ward`, `start` (1854, 1871, 1874, 1883), `end` (the next layer's year; 1883 null until a source gives its successor), `date_quality: "snapshot"`, `date_source: "ECDS Atlanta1878 Wards<year>"`.
