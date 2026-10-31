# railroads-historical

Layer id `railroads-historical`. Built by `scripts/fetch-railroads-historical.sh` (with `scripts/build-railroads-historical.js`). Fetched 2026-10-27.

## Source

- Jeremy Atack, *Historical Geographic Information Systems (GIS) database of U.S. Railroads, 1826–1911* (shapefile, last revised 31 Oct 2023). Vanderbilt University, data downloads page: https://my.vanderbilt.edu/jeremyatack/data-downloads/
- Zip used: https://cdn.vanderbilt.edu/t2-my/my-prd/wp-content/uploads/sites/133/2024/09/RR1826-1911Modified103123.zip (16.3 MB; SHA not recorded)
- Suggested citation on the download page: Jeremy Atack, "Historical Geographic Information Systems (GIS) database of U.S. Railroads for [selected years based on value of .dbf field "InOpBy" or "Exact"]" (May 2016; revised [latest date]). The layer's `date_source` is "Atack 2016, InOpBy".
- Licence: not stated on the download page as checked. Confirm the terms with the author before publishing. Do not treat this as open data until confirmed.

Attribution line (proposed; check against the licence): "Railroad data: Jeremy Atack, Historical GIS Database of U.S. Railroads 1826–1911, Vanderbilt University (2016, rev. 2023)."

## Processing

1. Unzip the archive (excluding `__MACOSX`) into `sources/raw/railroads-historical/unz/`.
2. Source projection is USA Contiguous Albers Equal Area (NAD83). `npx mapshaper -proj wgs84`.
3. `-clip bbox=-86.0,30.2,-80.5,35.3` (xmin, ymin, xmax, ymax).
4. Drop segments with `InOpBy` ≤ 0 (none in the bbox). Segments that fall wholly outside the bbox after clipping are dropped (43 empty geometries).
5. Keep only `kind`, `start`, `end`, `date_quality`, `date_source`, and `name` (from `RRname`, trimmed; omitted when empty).
6. Coordinates written at 4 decimals.

`Gauge` (0 for most of the bbox; 60 and 56.5 inches elsewhere) was not used: most segments have no gauge, so the layer stays one `kind`. `track`, `VxCount`, `Miles`, `ExactDate` and `STATENAM` were dropped.

## Kinds

- `railroad`: every segment (the source has no line-type field used here).

## Dates

- `start` = `InOpBy` (year first in operation, per Atack). `end` = null (the source has no closing year; lines closed before 1911 are still present in the dataset, not removed).
- `date_quality` = `documented`. `date_source` = `Atack 2016, InOpBy`.
- Note: `InOpBy` is the year the segment was first in operation per Atack's dataset. Atack's year assignments are his own; cross-check important lines against a chronology before relying on them in the text.

## Counts

Features: 2,831 (76,849 in the full dataset; 2,874 clipped to the bbox, 43 of those empty).

By start decade: 1830s 17, 1840s 191, 1850s 539, 1860s 310, 1870s 465, 1880s 575, 1890s 456, 1900s 105, 1910s 173.

## Checks

- Western & Atlantic: 79 segments dated 1840–1850, so the Atlanta–Chattanooga line is present by 1850.
- Atlanta by 1860, from the segments within 6 km of downtown (fetched check, not a generated output):
  - NW: Western & Atlantic (1840)
  - E: Georgia Railroad (1845 and 1850 segments)
  - S/SW/W: Macon & Western (1850, 1.2–1.8 km from centre; ring bearings unreliable at this scale)
  - **Gap:** the Atlanta & West Point (1852) segments in the Atack data start 9–10 km from downtown (near Hapeville/East Point), so the W&A's Atlanta end and the West Point line's Atlanta end are not in this layer. Four clear directions by 1860 are not confirmed here; the Atlanta-area layer (`railroads-atlanta`) is the detailed source.
- Known data limits: Atack's network is a best-effort reconstruction at 1:100,000 scale. Positions can be tens of metres off, and short spurs and yards are often absent.
