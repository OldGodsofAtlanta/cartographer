# Atlanta city limits (layer `atlanta-limits`)

The city's limits as they stood after each annexation from 1847 to 1945: 25 versions, each valid from its year until the next. Built by `scripts/build-atlanta-limits.js` from Emory's annexation dataset (`scripts/fetch-atlanta-limits.sh` downloads it). Replaces the earlier three-circle layer.

## Source

- **Emory Center for Digital Scholarship, OpenWorld Atlanta, GeoServer layer `AtlantaAnnexations:annexations_1847-1945`** (https://geoserver.ecds.emory.edu/wfs), fetched 2026-10-28: 84 polygons, native WGS84. For each year the boundary changed it has one `boundary` polygon (the cumulative limits after that year's annexations) and one or more `annexation` polygons (the area added). Each version here is the year's `boundary` polygon; `annexed_acres` and `annexed_parts` come from its `annexation` polygons.
- **Licence: not stated.** The server lists no constraints, as with the other ECDS layers (see `atlanta-streets-1928.md`); confirm reuse with ECDS before print.
- Attribution line: "City limits: Emory Center for Digital Scholarship, OpenWorld Atlanta."

## Dates

Years only: the dataset gives a year per annexation, not a day. A version holds from its year to the next version's year (so a map of 1909 shows the 1909 limits). The days known from other sources (1847-12-29; the 1894 date) are not used. Versions: 1847, 1854, 1863, 1866, 1889, 1894, 1895, 1904, 1909, 1910, 1913, 1914, 1915, 1916, 1922, 1923, 1925, 1926, 1928, 1930, 1932, 1934, 1940, 1943, 1945. `end` of the last is 1946.

## Checks

- **Areas match independent figures.** 1847: 2,002 acres, for a one-mile-radius circle (2,011). 1866: 4,822 (a 1.5-mile circle, 4,524). 1889: 6,362 (a 1.75-mile circle, 6,158), with +1,540 acres that year against Wikipedia's 1,547. 1910: +5,582 acres in four parts, against Wikipedia's 5,606.
- **The 1911 atlas page's own limit line agrees.** Its dash-dot line, read at nine points on the north, west and south-east edges and run through the atlas's georeference, lies within 25 m of the 1910 polygon (the atlas fit's own error is about 33 m).
- **The Setting Guide's facts hold.** West End inside from 1894; Piedmont Park and Ponce de Leon Park inside from the 1904 annexation, outside before; Buckhead outside throughout. `node scripts/check-atlanta-limits.js` confirms exactly one version for every year 1870–1945.

## What changed from the circle layer

- **1866 settles the 1.5-mile limit.** The old layer used the Zero Mile Post marker's 1874 charter date. Emory's data (and Wikipedia citing Garrett) put the 1.5-mile limit in 1866, so 1866 is used and the 1874 circle is gone.
- **Nothing after 1889 is a circle now.** The old 1.75-mile circle held through 1945, which put Piedmont Park outside the city until the 1940s.
- **No gaps in the record, but the shapes are the dataset's.** I have not checked the polygons against the ordinances or Garrett.

## Known problems

- **Years, not days.** Two annexations in a year are one version; a map dated early in a year shows that year's limits already.
- **Brownsville.** From the 1910 version Brownsville (South Atlanta) is inside the limits. The Setting Guide calls it "outside the city limits" without a date; that holds in 1906 and not after 1910 (check `chapters/0003-atlanta-setting-guide/05-neighborhoods.md`, "Brownsville").
- **Federal penitentiary, Fort McPherson, Candler Field and Decatur** are outside the limits in every year, 1847–1945. Plausible, but not verified here.
- Polygons have small gaps and slivers where annexations met (it is a digitised dataset); the layer draws outlines only, so none show.
- The Georgia State University / Atlanta-Fulton Public Library "Annexation Map of Atlanta" (1952; `dlg.usg.edu/record/gsu_planatl_155`) is "In Copyright - Educational Use Permitted", personal, educational and non-commercial only, so it was **not used**.
