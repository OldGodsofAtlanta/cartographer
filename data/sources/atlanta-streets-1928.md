# Atlanta streets, 1928 (`atlanta-streets-1928`)

Layer file: `data/atlanta-streets-1928.geojson`
Build script: `scripts/fetch-atlanta-streets-1928.sh` (calls `scripts/atlanta-streets-1928-clean.js` and mapshaper)
Date fetched: 2026-10-27

## Source

- Dataset: **Atlanta 1928 road system**, layer `OpenWorldAtlanta:Atlanta1928_RoadSystem`, served by the Emory Center for Digital Scholarship (ECDS) GeoServer.
- WFS endpoint: `https://geoserver.ecds.emory.edu/wfs` (GetFeature, `outputFormat=application/json`, paged 3,000 at a time, sorted by OBJECTID). Native CRS EPSG:4326. 23,042 line features (MultiLineString).
- Project page: https://www.openworldatlanta.org/ (OpenWorld Atlanta Research and Learning Hub), news item https://news.emory.edu/stories/2026/05/new-digital-mapping-project-lets-users-explore-layers-atlanta-history
- Licence: **not stated.** The GeoServer lists `AccessConstraints: NONE` and `Fees: NONE`, and no licence appears on the project site. Confirm reuse terms with ECDS before redistributing the file or printing it in a commercial book.
- Attribution to print: "1928 road system: Digital Visualization Lab, Emory Center for Digital Scholarship, Emory University" (the title the GeoServer gives its WMS layers).

## Processing

1. Download all 23,042 features (8 pages). Raw files: `sources/raw/atlanta-streets-1928/page_*.json` (not committed).
2. `scripts/atlanta-streets-1928-clean.js`:
   - `name` = `ROAD_NAME`, whitespace trimmed. For the 7 features with a blank `ROAD_NAME` but a `FENAME`, the name is rebuilt from FEDIRP, FENAME, FETYPE and FEDIRS.
   - `kind` from `FETYPE`: `alley` (Alley, Aly); `avenue` (Ave, Av, Avenue, Blvd, Pkwy); `road` (Rd, Road, Hwy, Fwy, Conn, Loop); `street` for all else (St, Dr, Pl, Cir, Way, Ln, blank, and the rest).
   - Named segments with the same name and kind are merged into one MultiLineString per street (23,042 segments became 8,801 features: 3,975 named streets and 4,826 unnamed segments). This keeps the file under 5 MB, since each segment otherwise repeats its properties.
   - Dropped: `OBJECTID`, `Alias`, `ARC`, `RdType`, `Sanborn`, `FRADDR` and the other address fields, `ZIP*`, `COUNTY_FIP`, `BusDir1928`, `Shape_Leng`.
   - `date_quality: "snapshot"`, `date_source: "Atlanta 1928 road system, OpenWorld Atlanta (Emory Center for Digital Scholarship), 1928"` (the layer file uses a shorter string).
3. mapshaper: `-filter-fields name,kind,date_quality,date_source -simplify 60% keep-shapes -o format=geojson precision=0.00001`. No reprojection was needed (the source is already WGS84).

## Kinds

| kind | features |
| --- | --- |
| street | 7,386 |
| avenue | 775 |
| road | 552 |
| alley | 88 |

## Counts and checks

- 8,801 features; 3,975 with a name, 4,826 unnamed (`name` is `""`; the app cannot label these, but they are part of the 1928 network).
- Bbox: -84.52589, 33.62400 to -84.21270, 33.93699 (the full ECDS extent).
- File size: 4.17 MB (under 5 MB).
- Feature properties: `name`, `kind`, `date_quality`, `date_source`. No `start`/`end`; `null` start is implied by the snapshot quality.

## Known gaps and cautions

- **Names: mostly 1928's, with modern suffixes (corrected 2026-10-28).** The first read of this layer, "names look modern",  was too strong: the layer carries names that were changed after 1928 (Hunter, Houston, Butler, Fair, Ashby Streets, where today's names are Martin Luther King Jr. Drive, John Wesley Dobbs Avenue, Jesse Hill Jr. Drive and so on), so the names are 1928's, written in modern form with quadrant suffixes. Original note: `ROAD_NAME` values are in current form with directional suffixes ("Childress Dr SW", "Cascade Rd SW", "Peachtree Rd NE"), and the source carries modern ZIP codes (30311, 30309). The network may be traced from modern TIGER-type centerlines with 1928 selections, so the names may not be period names. Verify against the 1928 atlas before presenting these as period labels.
- The `Alias` field holds alternate names (for example "Exposition NW" for "Hampton St NW", "Old Wheat St NE" for "Auburn Ave NE", "Azelia St SW" for "Azalia St SW"). These were not used; they may be period names and could go into a `names` array if verified.
- Unnamed segments (4,826) have no `ROAD_NAME` in the source.
- Licence unstated (see above).
- Simplification at 60% (keep-shapes) was needed to fit the size limit at this feature count; the 100% version was 4.76 MB, so 60% is a deliberate trade for a smaller file.
