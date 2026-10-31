# terrain-georgia, terrain-atlanta, terrain-city

Contour lines (feet above sea level) traced from USGS 3D Elevation Program bare-earth elevation, at three scales:

| Layer | Area | Grid | Interval (index every) | Draws at |
| --- | --- | --- | --- | --- |
| `terrain-georgia` | Georgia and its borders, -85.9 to -80.6 / 30.2 to 35.4 | 250 m | 200 ft (1,000 ft) | 1:600,000 and smaller |
| `terrain-atlanta` | Atlanta region, -84.65 to -84.10 / 33.55 to 34.00 | 20 m | 20 ft (100 ft) | 1:30,000 to 1:600,000 |
| `terrain-city` | Atlanta, -84.46 to -84.30 / 33.68 to 33.83 | 10 m | 10 ft (50 ft) | 1:30,000 and larger (west and central Atlanta only; elsewhere tick "any scale" on the region layer) |

- **Source:** USGS 3DEP bare-earth DEM, from the 3DEPElevation ImageServer (https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer), fetched 2026-10-27. US government work, public domain. Attribution line: "Elevation: USGS 3D Elevation Program".
- **Build:** `node scripts/build-terrain.js <georgia|atlanta|city|all>` fetches the grid (cached in `sources/raw/terrain/`, not committed), blurs it lightly, traces contours with d3-contour, drops specks and the lines the grid's edge makes, and simplifies with mapshaper to keep each file under 5 MB.
- **Properties:** `kind` (`contour` or `index`), `elev_ft`, `name` (the elevation, on index lines only, for lettering). Undated: `date_quality: "natural"`.

## Known problems

- **The ground is modern.** The elevation data is from after 1945 and includes everything done to the land since. On a map of 1877–1941 the contours are right for most of the country and wrong where the ground has been cut or filled:
  - quarry pits (the Bellwood quarry floor is about 200 ft below its rim today and was far shallower in 1934; Stone Mountain's quarry and Lithonia's pits are larger than in the period);
  - expressway and rail cuts (I-75/85, the Downtown Connector), the MARTA lines, and the stadium and airport platforms (Candler Field's runways are graded and its Flint headwaters are buried);
  - filled ground downtown (the Gulch before the 1920s viaducts, Ponce de Leon's lake filled in 1907) and reservoirs, whose drowned valleys show as flat water surfaces;
  - Stone Mountain's carving.
  Treat contours near such places as a guide to the natural slope, not the 1877 or 1941 surface.
- **Statewide contours stop at 200 ft** and the 250 m grid smooths small hills away. They show the Fall Line and the mountains, not a town's ridges.
- Contours at or below sea level are not drawn (no data over the ocean).
- Lettering of index lines follows only runs of the line straight enough to read, so some index lines have no elevation.
