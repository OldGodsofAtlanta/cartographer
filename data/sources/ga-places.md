# ga-places: Georgia cities and towns, 1870–1940

Layer id `ga-places`. Output `data/ga-places.geojson` (327 point features). Rebuilt by `scripts/fetch-ga-places.js`. Raw downloads and Wikipedia API batches are cached in `sources/raw/ga-places/`; delete that folder to re-fetch.

Date fetched: 2026-10-27.

## Sources

| Source | URL | Used for |
| --- | --- | --- |
| US Census Gazetteer, 2023 place file, Georgia (`2023_gaz_place_13.txt`) | https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_gaz_place_13.txt | Candidate list (incorporated places, LSAD 25 city, 43 town, and the consolidated governments); coordinates (INTPTLAT/INTPTLONG) |
| Wikipedia, article "<Name>, Georgia" (followed through redirects) | https://en.wikipedia.org/wiki/<Name>,_Georgia | `{{US Census population}}` counts; infobox `established_title`/`established_date`; `{{coord}}` for towns without a gazetteer point and for the suburbs; annexation sentences |
| Wikipedia, "List of counties in Georgia" | https://en.wikipedia.org/wiki/List_of_counties_in_Georgia | County seats (`{{Countyrow}}` Seat column) |

Wikipedia was read through the MediaWiki API (`action=query`, `prop=revisions`, `rvprop=content`, `redirects=1`), 50 titles per request, 1 s pause between requests, User-Agent `OldGodsCartographer/0.1 (aaboyles@gmail.com)`.

## Licence and attribution

- Census Gazetteer coordinates and census counts: US federal government data, public domain.
- Wikipedia article text (including the population templates and infobox fields as transcribed there): CC BY-SA 4.0. Share-alike applies to derived data; the layer is CC BY-SA compatible with the cartographer's CC-BY-SA-4.0 licence.

Attribution line to print on a map:

> Populations from the US Census via Wikipedia (CC BY-SA); coordinates from the US Census Gazetteer

## Processing

1. Read the gazetteer. Skip CDPs (LSAD 57). Base name: strip ` city`, ` town`, ` village`. The consolidated rows are mapped to the town they contain: Athens-Clarke → Athens, Augusta-Richmond → Augusta, Cusseta-Chattahoochee → Cusseta, Echols County consolidated government → Statenville, Georgetown-Quitman → Georgetown, Macon-Bibb → Macon, Webster County unified government → Preston. For those, the coordinates come from the town's Wikipedia `{{coord}}`, because the gazetteer row is the county centre.
2. Read the county seats from "List of counties in Georgia" (159 counties). Columbia County lists two seats (Appling de jure, Evans de facto), so both are kept. Two former counties are added from the brief: Milton County (seat Alpharetta) and Campbell County (seat Fairburn), both merged into Fulton in 1932. These carry `seat_until: 1932`.
3. Fetch the Wikipedia article for every candidate and every seat town not in the gazetteer list (Statenville, Preston). Buckhead uses "Buckhead, Morgan County, Georgia" (the Morgan County town) to keep it apart from the Atlanta district.
4. Keep a place if it is Atlanta, a county seat (current or the two above), or its census count reached 500 in any census 1870–1940. The result is 327 places.
5. `pop`: the `{{US Census population}}` template, years 1870–1940 only, commas and refs stripped, integers. Values not in the template are left out; nothing is estimated.
6. `start`: from the infobox. Among the `established_title`/`established_date` pairs (numbered pairs included; labels read even when kept in a comment such as `<!-- Incorporated (town) -->`), the first match wins in this order:
   - label contains incorporated, chartered, "city of" or "town of": `documented`
   - label contains established: `documented` (per the brief; see gaps)
   - label contains founded, settled, laid out or platted: `approximate`, with the label in `date_source`
   - no year, or no infobox: `start: null`, `date_quality: "unknown"`
7. Suburbs and towns in the brief's extra list use the same rule. If the infobox gives no date, the article text is searched for "incorporated … in YYYY" (used for Kirkwood and Oakland City only; both `documented`, with the text quoted in `date_source`).
8. `end` for the extra places: the year after "annex" in the sentence that names Atlanta, else the first year 1870–1999 in such a sentence. Kirkwood is overridden: the article says it was annexed "between 1922 and 1924", so 1924 (the later bound) is used and the range is written in `date_source`.
9. Coordinates: rounded to 4 decimals (about 10 m). Gazetteer for candidates; Wikipedia `{{coord}}` for the consolidated towns and the suburbs.
10. Properties are as the data README asks, plus `seat_until` for Alpharetta and Fairburn.

## Kinds

| kind | Meaning | Count |
| --- | --- | --- |
| `capital` | Atlanta (state capital; also the seat of Fulton County) | 1 |
| `county-seat` | Seat of a county, now or Milton/Campbell before 1932 (`seat_of` names the county) | 161 |
| `town` | Any other place kept because its census count reached 500, plus Oakland City (extra list) | 160 |
| `suburb` | West End, Edgewood, Kirkwood, Inman Park, Buckhead (extra list) | 5 |

Note: 161 seats = 159 counties, plus Columbia's second seat (Evans), plus Milton and Campbell, less Atlanta (kind `capital`).

## Counts and coverage

- Features: 327. File size about 108 KB. Bounding box: lon −85.5096 to −80.8559, lat 30.7031 to 34.9820.
- Start year set: 83 (72 `documented`, 11 `approximate`). `start` null: 244 (`unknown`).
- Start decades (non-null): 1730s 2; 1780s 2; 1800s 7; 1810s 3; 1820s 9; 1830s 5; 1840s 5; 1850s 11; 1860s 4; 1870s 6; 1880s 11; 1890s 10; 1900s 4; 1910s 2; 1930s 1; 1950s 1.
- Places with a 1880 count: 180. With a 1930 count: 312. With any census count: 316. No counts at all: 11 (Appling, Buckhead, Edgewood, Evans, Georgetown, Inman Park, Kirkwood, McRae-Helena, Oakland City, Statenville, West End).

Sanity values (from the file):

| Place | 1870 | 1880 | 1930 | 1940 |
| --- | --- | --- | --- | --- |
| Atlanta | 21,789 | 37,409 | 270,366 | 302,288 |
| Savannah | 28,235 | 30,709 | 85,024 | 95,996 |
| Augusta | 15,389 | 21,891 | 60,342 | 65,919 |
| Macon | 10,810 | 12,749 | 53,829 | 57,865 |
| Columbus | 7,401 | 10,123 | 43,131 | 53,280 |

Atlanta 1870 and 1940 match the brief.

## Known gaps and errors

- **Start dates are sparse.** 244 places have no incorporation year in their infobox, so they have `start: null`. Many small towns have an empty `established_date` field.
- **"Established" can be a founding date.** Per the brief, `established` labels count as `documented`. Savannah (1733) and Augusta (1736) are founding dates, not incorporation dates, and so are not the legal incorporation years. Check these before using `start` for a legal date.
- **Atlanta's start.** The infobox labels the 1847 date "(City of Atlanta)" and the 1837 date "Founded (Terminus)". The 1847 date is used as `documented` because it is the city charter year; the 1837 founding is not used.
- **Candidate list is the 2023 gazetteer.** Places incorporated in 1870–1945 and dissolved or merged before 2023 are missing unless their county-seat status or census count was enough to keep them and they still appear in the 2023 file. Statenville and Preston appear only through their consolidated-government rows. Gazetteer counts 531 city/town rows plus 7 consolidated rows, against Wikipedia's 535 municipalities; not reconciled line by line.
- **Historical county seats** were taken from the current county list, plus Milton and Campbell from the brief. Seats moved or changed in 1870–1945 were not checked.
- **Battle Hill**: no Wikipedia article ("Battle Hill, Atlanta" is missing), so it is omitted. Not documented, per the brief.
- **Buckhead (Morgan County)**: the Morgan County town is not kept; its maximum census count is 273. The layer's "Buckhead" is the Atlanta district, as the brief asks.
- **Inman Park**: no infobox and no annexation sentence; `start` and `end` are null.
- **Kirkwood end year** is a range ("between 1922 and 1924"); 1924 is the later bound.
- **Buckhead end year 1952** is the Atlanta annexation year from the article. It is after 1945 but is recorded as the brief asks; the layer will still draw Buckhead as a separate suburb through 1945.
- **Census values** are as transcribed in Wikipedia's templates. They have not been checked against the census volumes. Values that did not parse as integers were skipped with a warning; the build reported no warnings.
- **Wikipedia's text may be stale**: articles were fetched 2026-10-27; later edits are not reflected.
