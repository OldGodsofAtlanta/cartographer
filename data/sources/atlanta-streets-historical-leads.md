# Historical Atlanta street data: leads

Checked 2026-10-27. Only the first lead below could be downloaded (see `atlanta-streets-1928.md`).

## Downloaded

- **Atlanta 1928 road system** (ECDS, OpenWorld Atlanta): WFS layer `OpenWorldAtlanta:Atlanta1928_RoadSystem` at https://geoserver.ecds.emory.edu/wfs. 23,042 segments, public, licence unstated. Output: `data/atlanta-streets-1928.geojson`.

## Found, not downloaded

- **ECDS GeoServer, Atlanta 1878 layers** (https://geoserver.ecds.emory.edu/Atlanta1878/wfs): `ATL1878_City_Blocks` (1,062 block polygons), `ATL1878_Buildings`, `ATL1878_Land_Parcels`, `ATL1878_City_Boundaries`, `ATL1878_Horse_Routes` (18 horse-railway lines), `ATL1878_Railroads`, `ATL1878_Streetcar`. None has street names or a street-centreline layer. The 1878 streets could be derived from block gaps, but that would be a digitising job, not a download.
- **ECDS GeoServer, ATLMaps layers** (https://geoserver.ecds.emory.edu/ATLMaps/wfs): `buildings_1928` (38,289 building features), `buildings_with_occupants_1928`, `ATLas_final_draft` (points only). No street centrelines.
- **ECDS GeoServer, Wards** (`Wards:Wards1854`, `Wards1871`, `Wards1874`, `Wards1883`) and **AtlantaAnnexations** (1847–1945, annexation polygons): not streets, but may be useful for the era layers.
- **ECDS Dataverse** (dataverse.library.emory.edu): not reachable from this environment (DNS failure). Not checked.
- **Georgia State University, Planning Atlanta and the Atlanta-Fulton Public Library digital collections** (https://digitalcollections.library.gsu.edu/): scanned maps, including a 1911 "World Atlas and Gazetteer: Map of the City of Atlanta" and Planning Atlanta overlays (KML/ZIP overlays, not vector streets). Would need georeferencing and digitising.
- **Pastmaps, 1890 Atlanta map** (https://pastmaps.com/explore/us/georgia/fulton-county/atlanta): scanned, no vector data found.
- **Fulton County street centrelines** (https://gisdata.fultoncountyga.gov/datasets/street-centerlines/explore): current data, not historical.
- **Census TIGER/Line roads** (https://catalog.data.gov/): current data, public domain, not historical.
- **OpenWorld Atlanta "1934 Street Map" and "1928 Atlas" layers** (https://www.openworldatlanta.org/): raster map layers, no download found.

## WFS GetCapabilities check (2026-10-27)

`https://geoserver.ecds.emory.edu/wfs?service=WFS&version=2.0.0&request=GetCapabilities`: 215 feature types across 20 workspaces. The full list is in `sources/raw/notes/wfs_caps_now.xml` (not committed).

**OpenWorldAtlanta workspace (every layer, name = title):**
- `OpenWorldAtlanta:Atlanta1928_RoadSystem`: 1928 road system (downloaded, see `atlanta-streets-1928.md`).
- `OpenWorldAtlanta:cabbagetown1928bounds`: Cabbagetown 1928 bounds (not fetched; a boundary polygon, not a street layer).

There are no 1928 block or 1878 layers in this workspace. The 1878 layers are in the `Atlanta1878` workspace; the 1928 buildings are in `ATLMaps`.

**Other relevant workspaces:**
- `Atlanta1878`: `ATL1878_City_Blocks` (1,062), `ATL1878_Horse_Routes` (18), `ATL1878_Buildings`, `ATL1878_City_Boundaries`, `ATL1878_Fire_Hydrants`, `ATL1878_Land_Parcels`, `ATL1878_Railroads`, `ATL1878_Streetcar`.
- `Wards`: `Wards1854`, `Wards1871`, `Wards1874`, `Wards1883`.
- `StreetcarRoutes`: `streetcars1924` and `1924_Route_1` to `_24`, plus sidings and support buildings.
- `AtlantaAnnexations`: annexation polygons 1847 to 1945, `annexations_1847-1945`, and `Annex_1928`.
- `ATLMaps`: `buildings_1928`, `buildings_1928_alt`, `buildings_with_occupants_1928`, `Atlanta Neighborhoods`, `Atlanta NPUs`, `Atlanta City Limits`.

## 1878 layers downloaded

- `data/atlanta-blocks-1878.geojson` (`atlanta-blocks-1878`): `ATL1878_City_Blocks`, 1,061 polygons, 0.37 MB. Source has no block ID or ward field beyond OBJECTID (kept as `id`). One sliver block (OBJECTID 972) collapsed to empty at 5-decimal rounding and was dropped.
- `data/atlanta-horsecars-1878.geojson` (`atlanta-horsecars-1878`): `ATL1878_Horse_Routes`, 18 lines, 0.01 MB. No route or company name in the source; `name` is omitted. The source `Id` is 0 on every route.
- Scripts: `scripts/fetch-atlanta-1878.sh`, `scripts/atlanta-1878-clean.js`, `scripts/atlanta-1878-drop-null.js`.
