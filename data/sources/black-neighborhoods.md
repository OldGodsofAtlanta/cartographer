# black-neighborhoods

Twelve Black neighborhoods and districts of Atlanta, 1865–1945, as named labels at a centre point. Built by `scripts/build-neighborhoods.js` from `data/neighborhoods-sources.json`, which holds each place's dates, the citation for them, where the point comes from, and a note.

## What it does and doesn't claim

- **A centre, not a boundary.** Nothing here has an outline. The sources give a centre, a description ("around Wheat Street") or boundary streets for a modern neighborhood, none of which is a period boundary, so the layer draws a letter-spaced label and stops. Do not read the label's extent as the neighborhood's.
- **Years are only what a source states.** `date_quality` is `documented` where a source gives the year for the thing, `approximate` where the year is rounded, inferred from a word like "after the Civil War", or tied to an institution rather than the neighborhood, and `unknown` where no source gives one. Unknown-date places (Darktown, Buttermilk Bottom) draw only when "undated" is switched on.
- **Sources.** The first is the book's own Setting Guide (`chapters/0003-atlanta-setting-guide/05-neighborhoods.md`), which carries its citations; each entry's `date_source` names the Setting Guide's source and, separately, anything I checked directly: Wikipedia pages (a secondary source, and several give no inline source for the dates used), a search for the Georgia Historical Society's University Homes marker, and Wikipedia's coordinates. The Georgia Encyclopedia's Auburn Avenue page returned 404 when I tried to read it directly, so the Auburn dates rest on the Setting Guide and canon/timeline.yml, which cite it.
- **Locations.** Stated coordinates (Wikipedia or an OpenStreetMap place node) where those exist; for Shermantown, Auburn Avenue and Darktown, street crossings in the 1928 layer, from the sources' descriptions. Each entry's `basis` says which.

## Places and what each rests on

| Place | Years | Rests on |
| --- | --- | --- |
| Shermantown | from 1865 (approx.) | Setting Guide: named for Sherman, "a year earlier" than the burning; 2,486 people by 1870 |
| Wheat Street / Auburn Avenue | from 1869 (approx.); renamed 1893 | Wheat Street Baptist founded 1869; the 1893 rename per the Georgia Encyclopedia (canon/timeline.yml) |
| Darktown | no years | Wikipedia's location from Calt; a 1930s description |
| Summerhill | from 1865 | Wikipedia; AUC Woodruff Library exhibit, via the Setting Guide |
| Mechanicsville | from 1870 (approx.), mixed | Wikipedia (no inline source); Setting Guide "about 1870" |
| Pittsburg | from 1883 | Saporta Report; Pittsburgh Yards; Wikipedia citing Ferguson 2007 |
| Vine City | from 1900 (approx.) | Wikipedia: "the end of the 1800s", no year and no inline source; Herndon's home 1910 |
| Beaver Slide | 1882 to 1935 (approx.) | "documented as early as 1882" (Wikipedia); cleared 1934 (canon, Ickes); the end is when the ground stood cleared |
| Atlanta University | from 1865 | Westside Future Fund, via the Setting Guide |
| Brownsville | from 1877 (approx.) | Haven's land purchase 1877; Clark there 1883; 1887 suburb; EJI marker via the Setting Guide |
| Reynoldstown | from 1865 (approx.) | Wikipedia's infobox "Built 1865"; the settlement sentence is tagged "citation needed" |
| Buttermilk Bottom | no years | Wikipedia: razed in the 1960s; no formation date |

## Left out, and why

- **Tech Flats / Tanyard Bottom.** The canon calls its size and makeup unsettled (1,611 families, 28 percent Black, or "nearly a thousand white families"), and I found no start year. It isn't a Black neighborhood on the evidence in hand.
- **West End, Peoplestown, English Avenue, Mozley Park, Collier Heights.** Became or grew Black mostly after 1945, or the sources I read give no earlier dates. West End is in `ga-places` as a suburb.
- **The Old Fourth Ward** as a whole (a political ward, majority Black "for many decades" per a source I could not date).
- **Individual streets and institutions** (Wheat Street Baptist, Big Bethel, Morris Brown, Gammon): they are canon sites, not neighborhoods. Locate them with the sites layer.

## Things to check before print

- **Shermantown's location conflicts with the canon.** `canon/places.yml` puts Shermantown "East of Oakland Cemetery". The Setting Guide, citing the Atlanta History Center, puts it in the Fourth Ward around Wheat Street, and the layer follows the Setting Guide. The canon entry (or the Setting Guide) should be reconciled. (Wikipedia's "Shermantown (Atlanta)" article is about a place at Stone Mountain village and has no sources: do not use it.)
- **Several start years are rounded or secondary.** Vine City's 1900, Reynoldstown's 1865 and Mechanicsville's 1870 rest on Wikipedia text that gives no inline source. Primary sources (city directories, the 1870 census, Neighborhood Union surveys, Du Bois's Atlanta University studies) would settle them.
- **"Darktown" is the book's term, and an outsiders' one.** The canon uses it for Houston Street. The sources describe it as an African-American neighborhood and quote a 1930s observer's insult; none says what residents called it. The layer hides it by default and notes this. Whether to show it at all is an editorial call for the book.
- **Names.** "Sweet Auburn" is not used on any map year, because no source gives when the name began. The layer labels the street Wheat Street to 1893 and Auburn Avenue after.
- **Rights.** Facts and short quotations here are cited; no text is copied beyond phrases quoted in `neighborhoods-sources.json`.
