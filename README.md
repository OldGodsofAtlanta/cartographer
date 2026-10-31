# Cartographer

A map maker for Old Gods of Atlanta. It draws dated vector layers (counties, railroads, rivers, lakes, towns, Atlanta's streets and city limits) as an old printed map, for any date between about 1870 and 1945, and exports the sheet for the book.

Every feature carries the years it existed, so one map can be drawn as it stood in 1877 (Lot Stake) and again in 1941 (Drain Tile): counties split and merge on the day the legislature said, railroads appear the year they opened, reservoirs fill when their dams closed, and the city limits widen.

## Running it

```sh
cd cartographer
npm install          # once: d3, topojson-client, and mapshaper for the fetch scripts
npm start            # http://localhost:5177
```

The map layers built from external sources (and their downloads) are not committed. On a fresh checkout run `scripts/fetch-data.sh` first; `data/README.md` says what it fetches and what is committed.

The server binds to localhost only. It serves the app, the data, and the design system's fonts from `../design/vendor/fonts/`, and saves maps to `projects/`.

## Making a map

1. **Map**: name it, or open a saved one. *Set date from a chapter* takes the year and first date from that adventure's `_chapter.yml`.
2. **Date**: the slider or the year box. Month and day matter for county lines, which change on a date (city limits change by year).
3. **View**: *Georgia*, *Atlanta region*, *Atlanta* and *Downtown* frame the usual areas. Drag to pan; scroll to zoom. Or type a scale (1:24,000 is "Scale 2,000 Feet to One Inch").
4. **Paper**: full page at the books' trim (8⅜ × 10⅞ in), the text block, half page, spread, or custom. The margin holds the graticule figures and the credits.
5. **Style**: *Yellowed survey* (default), *Sanborn wash*, *Plain atlas ink*, or *Blueprint*. Every ink can be changed, and the age, grain, foxing, ink spread and folds can be turned up or down.
6. **Title and furniture**: title cartouche, scale bar, compass rose, references (legend), border, graticule, and the credits line.
7. **Layers**: switch layers on and off. Each layer draws only at sensible scales unless you tick *any scale*. *undated* shows features whose date is unknown (hidden by default, so a modern street doesn't appear in 1877).
8. **Notes on the map**: add labels, markers, and lines or areas (hatched, outlined, dashed or tinted). Drag them to move them.
9. **Inspect**: click any feature to see its data and dates. *Hide on this map* and *Rename on this map* fix a feature for this map only, without touching the data. Use them for anachronistic names.
10. **Export**: PNG or JPEG at 150, 300 or 600 dpi (the resolution is written into the file), or SVG with the fonts embedded.

Book images go in `chapters/<id>/art/` and are listed under `### Images` in the chapter's sources, like the period maps already there.

### From the command line

```sh
node scripts/render.js lot-stake-1877                        # exports/lot-stake-1877.png at 300 dpi
node scripts/render.js lot-stake-1877 --year 1941            # the same map as of 1941
node scripts/render.js drain-tile-1941 --type svg --out ../chapters/1941-drain-tile/art/map.svg
node scripts/render.js lot-stake-1877 --screenshot shot.png  # the whole editor, for checking
```

It uses the book's Playwright (`npm run setup` at the repo root). Set `CHROMIUM_PATH` to use an installed Chrome.

### Places in the adventures

The *Places in the adventures* layer draws the sites `canon/places.yml` names, so a map for a chapter can show where its story happens. Set the map's chapter (*Set date from a chapter*, or `chapter` in the project) and the layer shows the sites that appear in that chapter; with no chapter it shows those whose years include the map year. A square is a located point, an open ring a district or park (located by its centre), a dotted ring a town.

`data/sites-sources.json` says how each site was located, and `npm run build-sites` rebuilds the layer and lists the sites still unlocated (49 of 117, among them every invented site, which stays unplaced). Add one by tracing it from a period map (see below), giving `lonlat`, the sheet, and what you read it from.

### Black neighborhoods

The *Black neighborhoods* layer labels twelve neighborhoods and districts at their centres, by the years a source gives (Shermantown, Wheat Street and Auburn Avenue, Summerhill, Pittsburg, Vine City, Beaver Slide, Atlanta University, Brownsville and the rest). It draws **no boundaries**, because none of the sources gives a period boundary; do not read a label's extent as the neighborhood's. Each place's dates, citation, location and caveats are in the inspector and in `data/neighborhoods-sources.json`; `npm run build-neighborhoods` rebuilds the layer. The layer is off by default. Read `data/sources/black-neighborhoods.md` before using it in the book: it lists the weak dates, the places left out, and a conflict with the canon over where Shermantown was.

### Backdrops: tracing from period maps

A *backdrop* is a scan of a period map fitted to the ground, laid under the drawing or used as a guide (shown on screen, left out of the export). `data/backdrops.json` lists them; there are fifteen: the 1917 Sanborn key plan, which outlines the burned district for Hot Ash (`projects/hot-ash-1917.json`), and every other Sanborn sheet and plan in the chapters' `art/` folders that is a plan (Ponce de Leon Park, the pencil factory, the Fulton Bag mills and the earlier Fulton Cotton Spinning sheet, Auburn Avenue, the depot and courthouse block, Marietta's square, Decatur's jail and courthouse, the 1895 Exposition plan, the 1911 key map and the 1911 atlas page), each with the accuracy of its fit recorded in `data/sources/backdrops.md`. The medical colleges sheet needed the whole sheet from the Library of Congress, since the book's copy is a crop with its street names cut off; that is recorded there. In the editor: *Backdrops* in the panel.

A sheet with a north arrow and a printed scale can be fitted from one or two crossings (`fit: {bearingRight, metresPerPixel?}`: 90 for a north-up sheet, any other bearing for a turned one, and the scale is fitted if left out). Otherwise find three or more street crossings that you can read on the scan and that exist in the street layer (`street_intersection` in the MCP server, or `lib/geo.js`), and record each as the pixel on the image and its coordinates. Spread them across the sheet; an affine fit takes care of a turned or skewed sheet. Check the residuals: the entry's RMS is printed by `list_backdrops` (17 m for the 1917 sheet, read by eye against 1928 streets). Images already in `chapters/*/art/` can be used in place (`src` is relative to `chapters/`); the credit and rights basis are the chapter's `### Images` entry.

Accuracy is only as good as that fit and your reading of the pixels. Say so when a site is traced from a backdrop.

### For agents: the MCP server

`mcp-server.js` lets an agent make maps over the Model Context Protocol (stdio). It's registered for Claude Code in the repository's `.mcp.json`, so a session started at the repo root offers it (Claude Code asks once before enabling a project server). Elsewhere: `node cartographer/mcp-server.js`.

| Tool | What it does |
| --- | --- |
| `project_format` | The map JSON, its defaults, and every allowed value. Read first |
| `list_layers` | Layers with how they're dated, feature counts, year ranges, scales, attribution and source note |
| `list_chapters` | The adventures and their eras and dates |
| `list_projects`, `get_project`, `save_project` | Saved maps in `projects/` (saving won't replace a map without `overwrite`) |
| `find_features` | Search by name, kind, year, chapter, box or distance; returns keys (for `hidden`/`rename`), dates and their sources, and coordinates |
| `street_intersection` | Where two streets meet, for a note at a corner ("Mitchell" and "Haynes"). Names are 1928's (or present-day, for OpenStreetMap); `data/street-renames.json` gives the few dated earlier names |
| `list_backdrops`, `pixel_to_lonlat` | The georeferenced period maps, and conversion between image pixels and coordinates, for tracing a site off a sheet |
| `render_map` | Draws a saved map, a spec, or a spec merged over a saved map, in any year; writes PNG, JPEG or SVG and returns a preview image and what was drawn |

A spec can be partial and can frame the map with `view: {preset: 'georgia' | 'region' | 'city' | 'downtown'}` or `view: {bounds: [west, south, east, north]}`. Output goes to `exports/` unless `out` names a path in the repository; it refuses `context/`, `design/vendor/` and `node_modules/`, and won't replace a file outside `exports/` without `overwrite`. The first render starts a headless browser (a few seconds); later ones take a second or two.

## Layers

`data/catalog.json` lists them; `data/README.md` is the data contract (properties, how dates work, snapshots); `data/sources/<layer>.md` says where each came from and what's wrong with it. `npm run check` validates the lot.

| Layer | Dated by | Source |
| --- | --- | --- |
| States | — | US Census cartographic boundaries |
| Counties on the map date | day each county version began and ended | Newberry Library, Atlas of Historical County Boundaries |
| Counties, present-day lines | from 1932 | US Census TIGER |
| Railroads, statewide | year each segment opened (to 1911) | Jeremy Atack, Historical GIS Database of U.S. Railroads |
| Railroads and yards, Atlanta | OSM `start_date`, or matched to Atack's segments | OpenStreetMap |
| Cities and towns | incorporation year; census populations 1870–1940 size the lettering | US Census, via Wikipedia |
| Atlanta city limits | year of each annexation, 1847–1945: 25 versions | Emory ECDS AtlantaAnnexations (licence unconfirmed); checked against Wikipedia's acreages and the 1911 atlas's own limit line |
| Streets, 1878, 1911 or 1928 survey | nearest survey to the map year; the 1911 grid is the 1928 streets that also appear on the 1911 atlas page (image-matched, about 80% recall); a small table of dated renamings gives period names (Wheat Street, North Collins Street...), and the 1903 newspaper list of about 225 renamed streets (233 entries, undated) is on each street as `former_names_1903` | Emory ECDS OpenWorld Atlanta; `scripts/derive-atlanta-streets-1878.js`; `scripts/build-streets-1911.sh`; `data/street-renames.json` |
| Streets, OpenStreetMap | mostly undated; off by default | OpenStreetMap |
| City blocks, 1878 survey | drawn within 25 years of 1878 | Emory ECDS, Atlanta 1878 |
| Horsecar lines, 1878; Streetcar lines, 1924 | drawn within 5 years of their survey | Emory ECDS |
| Places in the adventures | not dated: shown for the chapters and years `canon/places.yml` lists them under | The book's canon, located from OpenStreetMap, street corners and the Census Gazetteer (68 of 117 sites so far) |
| Contours (statewide, region, city) | undated (natural): 200, 20 and 10 ft intervals, drawn at their own scales | USGS 3D Elevation Program. **Modern ground**: quarries, cuts and fills since 1945 are in it (see `data/sources/terrain.md`) |
| Black neighborhoods | the years a source states, each cited; two have no year and show only with "undated" on | The book's Setting Guide and the pages it cites; Wikipedia, as a secondary source; 12 places, labelled at their centres with no outlines (see `data/sources/black-neighborhoods.md`) |
| Lakes and reservoirs | year the dam closed | OpenStreetMap; USACE National Inventory of Dams |
| Rivers and creeks | natural; stretches culverted today are dashed, since the line is the pipe's course rather than the old channel | OpenStreetMap |

To add a layer: write it to the contract, add a `scripts/fetch-<layer>.*` that rebuilds it, a `data/sources/<layer>.md`, and an entry in `catalog.json`; then `npm run check`.

## Before anything goes in the book

The book is CC BY-SA 4.0. Several sources aren't cleared for that yet:

- **Newberry county boundaries**: their readme says CC BY-NC-SA; their download pages say "any lawful purpose". Get it confirmed before printing county lines in a sold book.
- **Atack's railroads** and **Emory ECDS's streets, blocks and streetcars**: no licence stated. Ask.
- **OpenStreetMap** (ODbL): a map image is a "produced work"; credit "© OpenStreetMap contributors".

The credits line under the border names the sources of whatever layers are drawn. Keep it, or move the credit into the figure caption and the chapter's sources.

## Files

| Path | What it holds |
| --- | --- |
| `server.js` | Local server: app, data, fonts, chapter presets, project save/load |
| `mcp-server.js` | The MCP server for agents |
| `lib/headless.js` | Renders maps in headless Chromium; used by `scripts/render.js` and the MCP server |
| `index.html`, `app/` | The editor. `project.js` is the map format and its presets; `render.js` draws a sheet; `labels.js` places lettering; `furniture.js` the cartouche, scale, rose and references; `paper.js` the ageing; `annotations.js` notes on the map; `export.js` SVG/PNG/JPEG |
| `data/` | Layers, `catalog.json`, the contract, source notes |
| `scripts/` | Fetch and build scripts per layer; `check-data.js`; `render.js` |
| `projects/` | Saved maps (JSON) |
| `sources/raw/`, `exports/` | Downloads and exports. Not committed |
