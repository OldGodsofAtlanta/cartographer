# ga-counties-modern

`georgia-counties.json` was already in `cartographer/data/` when Cartographer was built (2026-10-27); where it was downloaded from wasn't recorded.

- TopoJSON, one object (`georgia-counties`), 159 county polygons.
- Its properties (STATEFP, COUNTYFP, GEOID, NAMELSAD, MTFCC G4020, ALAND, AWATER, INTPTLAT/INTPTLON) are the US Census Bureau's TIGER/Line county fields, so it is almost certainly a TIGER/Line or cartographic-boundary county file converted to TopoJSON: public domain.
- The catalog draws it only from 1932, when Milton and Campbell counties were merged into Fulton and Georgia reached its present 159 counties. Lines have moved slightly since then; for any date, prefer `ga-counties-historical`.
