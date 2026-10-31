# Backdrops (data/backdrops.json)

Georeferenced scans of period maps, laid under a map or used for tracing (see README, "Backdrops"). Fifteen scans, thirteen of them images already in the book's `chapters/*/art/` (the fourteenth, sheet 49, is the full sheet the book's crop came from) (public domain; each chapter's `### Images` entry holds the rights basis). Georeferenced 2026-10-27.

| Backdrop | Year | Method | Accuracy |
| --- | --- | --- | --- |
| `sanborn-key-plan-1917` (Atlanta, burned district) | 1917 | Affine fit to 8 street crossings read by eye, matched to the 1928 layer | RMS 17 m, worst 23 m; 2.3 m per pixel |
| `sanborn-ponce-de-leon-park-1911` (sheet 231) | 1911 | North-up, scale from the printed bar, two crossings on Ponce de Leon Avenue (Lake View, the Belt Line) | The two anchors agree to 4.7 m; the OSM streets fall on the sheet's own (checked by overlay) |
| `sanborn-national-pencil-company-1911` (sheet 9) | 1911 | Turned sheet (north to the right, Forsyth 33°); scale from the 56 ft street width; one anchor, Hunter × Forsyth | No residual with one anchor; the Forsyth and Hunter lines fall on the sheet's streets within about 15 px (1 m) |
| `sanborn-fulton-bag-mills-1899` (sheet 61) | 1899 | North-up, scale from the printed bar; one anchor, Decatur × Boulevard | The 1928 Boulevard line runs about 10 m west of the sheet's along its length |

| `sanborn-auburn-avenue-1899` (sheet 46) | 1899 | Affine fit to 7 crossings (Auburn, Edgewood, Irwin with Bell, Fort, Hilliard) | RMS 2.6 m, worst 4.3 m |
| `sanborn-depot-courthouse-1886` | 1886 | Affine fit to 4 crossings (Pryor, Central with Alabama, Hunter); a rotated block | Residual 0.6 m; rotation 33° agrees with the compass rose |
| `sanborn-fulton-cotton-spinning-1886` (sheet 29) | 1886 | Rotation fixed at Decatur Street's bearing, scale fitted from four crossings on Decatur | RMS 2.2 m along the street; the one off-line check is 16 m off. The 1899 bag-mills sheet places a different building of the same works 64 m away |
| `sanborn-marietta-square-1885` (sheet 1) | 1885 | North-up, scale from three corners of the ring road matched to OpenStreetMap (Marietta is outside the Atlanta layers) | RMS 1.5 m; the withheld fourth corner is within 3 m |
| `sanborn-expo-plan-1895` (sheet 1) | 1895 | North-up, scale from the 12th, 13th and 14th Street gates on Piedmont Avenue | RMS 4.8 m, but all three lie on one street, so rotation is assumed; expect 20–40 m across the park. The printed "50 ft to an inch" does not fit the sheet's size |
| `sanborn-decatur-jail-1911` (sheet 5) | 1911 | North-up, scale from 5 crossings matched to the 1928 layer | RMS 5.9 m |
| `sanborn-decatur-courthouse-1911` (sheet 2) | 1911 | North-up, scale from 4 crossings | RMS 3.3 m |
| `atlas-atlanta-1911` | 1911 | Affine fit to 9 crossings read by eye from gridded crops | RMS 33 m, at 4.4 m per pixel: city-scale context only. Provenance is thinner than the Sanborn sheets (see the chapter's sources) |
| `sanborn-medical-colleges-1899` (sheet 49, full sheet) | 1899 | Affine fit to 5 crossings, matched to the 1928 layer using the 1903 street-name list | Residual 0.3 m; three crossings outside the fit within 1–4 m |
| `hals-ga-7-brick-site-plan` (NPS HALS GA-7, Figure 2) | 1907 | North-up, scale from the printed bar (0.625 m/px), one anchor at the site entrance (Google's pin for the company) | The plan's CSX track lies on the OSM rail line and its river bank on the OSM river, both unused in the fit; its boundary centre is 31 m from the report's stated centre |
| `sanborn-key-map-vol2-1911` | 1911 | Affine fit to 21 block-number labels matched to the same labels on the 1917 key plan | RMS 21 m, and no better than the 1917 sheet's 17 m, since each point is borrowed from it |

## Fitted from the full sheet

- **`sanborn-medical-colleges-1899`** (sheet 49): the book's copy (`chapters/1879-dead-freight/art/sanborn-medical-colleges-1899.jpg`) is a crop of one block with its street names cut off, so it could not be fitted. The fit uses the whole sheet, downloaded from the Library of Congress at 25% (`backdrops/sanborn-1899-sheet-49.jpg`, 1,680 × 1,979 px; same public-domain item, `sanborn01378_005`, the 59th image), which letters the streets: N. Butler, N. Piedmont, Pratt, Bowie, College and "Jenkins or Armstrong". The 1903 *Atlanta Constitution* list identified them in the layers (Jenkins is Armstrong Street, College is Coca Cola Place, Bowie is Boaz Street). Affine fit to five crossings, residual 0.3 m; three crossings not in the fit are within 1–4 m. The sheet is turned about 41° (image-up is north-east), as its compass rose shows. It is a different file from the chapter's image, so a figure of the chapter's crop would be placed by cropping this sheet's coordinates; both are the same Library of Congress item.
- Two images in `chapters/*/art/` are bird's-eye views, not plans (`birdseye-expo-1895.jpg`, `harpers-expo-birdseye-1895.jpg`), and cannot be georeferenced as maps.

## Not a Sanborn sheet

`hals-ga-7-site-plan-1907-1961.png` is a figure cropped from the National Park Service's Historic American Landscapes Survey report on the Chattahoochee Brick Company (HALS No. GA-7, July 2021; the Library of Congress calls the record HAER/HALS ga1190), which the user supplied as `sources/master-pnp-habshaer-ga-ga1100-ga1190-data-ga1190data.pdf` (the PDF is not committed to the project's published files; `sources/` is the repository's own source folder). It is a modern drawing (Sarah Kuehn Spencer, 2021) of the 1907 layout and later features, not a period map; the figure is for tracing the yard's layout, with that credit. Its rights statement should be confirmed on the Library of Congress record before it is reproduced in the book.

## A mislabelled file

`chapters/1907-excelsior/art/sanborn-dupre-excelsior-1911.jpg` is cited in that chapter as sheet 250 with the DuPre inset, but the image is the **key map of volume 2** (the block-number index of northeast Atlanta). The file was fitted as such (`sanborn-key-map-vol2-1911`). The DuPre mill is in the blocks numbered 250 on it; the inset itself is not in the file. Correct the chapter's sources entry, or replace the image with the sheet it names, before print.

## Known problems

- Sheets fitted from one or two anchors have no independent check besides the overlay with modern street lines, which are themselves 1928 or later. A street moved or widened since the sheet is a real offset, not an error in the fit: expect 10–15 m.
- Scale comes from a printed bar or a labelled street width, read by eye; 3–5% scale error is likely, which is a few metres at the edge of a sheet this size.
- Where a sheet shows a modern name or lacks a street the layers have (the company-village streets Tennille, Wyman and Reinhardt are not in the 1928 layer), the layers can't be used to cross-check it.
