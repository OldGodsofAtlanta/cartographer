# ga-counties-historical

Georgia county boundaries as they stood between 1860 and 1950, one feature per county version.

## Sources

- Download page: https://publications.newberry.org/ahcb/downloads/states.html (Georgia GIS link)
- File: https://publications.newberry.org/ahcb/downloads/gis/GA_AtlasHCB.zip (21.3 MB; contains `GA_AtlasHCB/GA_Historical_Counties/GA_Historical_Counties.shp`, 1,310 polygons)
- Metadata: `GA_Supplemental_Texts/GA_Metadata2.htm` inside the zip (the Georgia Historical Counties Dataset, covering 17 Mar 1758 through 31 Dec 2000)
- Fetched: 2026-10-27

## Licence and attribution

The Newberry's readme (`Atlas_Dataset_READ_ME.htm`) states: "The Newberry Library is the copyright holder. These files are free for use under an Attribution-NonCommercial-ShareAlike Creative Commons License." Newberry's download pages also say the data can be reused for any lawful purpose. Those two statements conflict. Treat the NC/SA terms as binding until Newberry confirms otherwise. The NC term matters for a commercially sold print book.

Attribution line for a map:

> County boundaries: Newberry Library, Atlas of Historical County Boundaries, Georgia (John H. Long, editor). Used under CC BY-NC-SA.

## Processing

Script: `scripts/fetch-ga-counties-historical.sh`, which calls `scripts/build-ga-counties-historical.mjs`.

1. Download and unzip into `sources/raw/ga-counties-historical/`.
2. mapshaper: reproject to WGS84 (the source is NAD83 geographic, so the change is negligible).
3. mapshaper filter: keep versions with `START_N <= 19501231` and `END_N >= 18600101`, which overlap 1860-01-01 to 1950-12-31. Drop `NCA` (non-county area) and "Georgia West Lands". Both fall outside the window anyway.
4. mapshaper: `-simplify 15% keep-shapes`, then write GeoJSON at precision 0.0001. Mapshaper reported "Repaired 15 intersections" while simplifying.
5. Node: rename and title-case `NAME` (`DEKALB` becomes `DeKalb`, `McINTOSH` becomes `McIntosh`, `JEFF DAVIS` becomes `Jeff Davis`). Strip `(ext)`/`(orig)` tags. Set the properties listed below. Drop every other field.

## Properties

| Property | Value |
| --- | --- |
| `name` | Title-cased county name, e.g. "Milton", "Campbell", "Fulton" |
| `kind` | `county` (the only kind) |
| `start_date` | `START_DATE` as YYYY-MM-DD, from the AHCB attribute table |
| `end_date` | The day after `END_DATE`, as YYYY-MM-DD. `null` when `END_DATE` is 2000-12-31, the AHCB's coverage end (the version still existed at the end of the dataset) |
| `start` | Year of `start_date` |
| `end` | Year of `end_date`, or `null` |
| `date_quality` | `documented` |
| `date_source` | `Newberry AHCB` |
| `change` | The AHCB `CHANGE` text, truncated to 200 characters (`null` if empty) |

`start` and `end` are set from the AHCB dates, not from a secondary source. Every feature has `date_source: "Newberry AHCB"`.

## Kinds

- `county`: 615 features. Multiple versions per county name, one per boundary change. Parishes (colonial, 1758–1777) and non-county areas fall outside the window and are not in the file.

## Counts and checks

- Output: 615 features, 2,206,609 bytes (under the 3 MB target), bbox -85.6052, 30.3579, -80.8406, 35.0008.
- Geometry: 615 Polygon/MultiPolygon features.
- Valid on 1877-07-01: 137 counties. Valid on 1941-07-01: 159 counties. Both match the expected counts.
- Milton: versions 1859-12-19 to 1860-12-08, 1860-12-08 to 1932-01-01 (end 1932). Campbell: last version 1875-03-02 to 1932-01-01. Both merged into Fulton on 1932-01-01 (AHCB `FULTON gained all of CAMPBELL (extinct) and MILTON (extinct)`, version 7 of Fulton, 1932-01-01 to 1986-12-30). Confirmed.
- Start decades: 1790s 5, 1800s 1, 1810s 3, 1820s 7, 1830s 2, 1840s 6, 1850s 108, 1860s 148, 1870s 217, 1880s 4, 1890s 2, 1900s 43, 1910s 49, 1920s 18, 1930s 2.
- 104 versions have `end_date: null` (still existing at 2000-12-31 in the dataset).

## Known gaps

- Zero-length versions: some versions exist for one day (e.g. Campbell 1872-08-23 to 1872-08-24, where the start and end dates are the same AHCB day). They are kept, so the app draws them only on that day.
- Simplification at 15% produced 15 intersections that mapshaper repaired. Lines look right at state scale. Check at higher zoom before printing.
- The AHCB has known caveats (see its `CHANGE` and `CITATION` fields): some changes are unmappable at compilation scale and are not drawn.
