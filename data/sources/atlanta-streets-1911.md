# atlanta-streets-1911, and street renamings (`data/street-renames.json`)

## The 1911 grid

1,118 of the 2,271 streets in the 1928 layer that fall on the 1911 atlas page, found by testing each against the page. It is the middle snapshot of the `atlanta-streets` layer (1878, 1911, 1928): a map of 1895–1919 draws it, so streets laid out between 1911 and 1928 no longer appear on maps of 1906.

**Method** (`scripts/build-streets-1911.sh`, `scripts/match-atlas-streets.py`):
1. The atlas page (`chapters/1911-coal-oil/art/atlas-atlanta-1911.jpg`, georeferenced to about 33 m; see `backdrops.md`) is turned to black ink on white (pixels darker than 140).
2. Its georeference is too loose to test a single street (7 pixels), so the page is aligned to the 1928 streets **cell by cell** (220 px squares): the shift of up to 16 px that puts the most street points on ink. The median shift was (-1, -1) px and the median cell match 0.67.
3. Each 1928 street entirely on the page, longer than 6 sample points, is scored by the fraction of its length within 2 px of ink after its cell's shift. **Streets scoring 0.75 or more are kept.** The scores are not cleanly split (a street drawn only partly, or against text, scores in the middle), so the cut is a judgement; `--report` writes `sources/raw/atlas/overlay.png` (kept green, 0.5–0.75 orange, dropped red) to look at it.

**Checks.** Overlaid on the atlas, the kept streets follow the printed ones; the dropped ones are mostly short stubs, cul-de-sacs, park drives and the interiors of blocks that the 1911 page leaves empty. Against the 1899 Sanborn sheet of the Auburn Avenue blocks (sheet 46), the layer has 9 of that sheet's 11 named streets (Auburn, Edgewood, Houston, Irwin, Old Wheat, Raspberry, Fort, Bell, Hilliard) and misses Green Street (the 1928 layer's "Greene St") and West Grace Street (which the sheet marks as arbitrary). Roughly 80% recall on that sample; no streets in it were wrongly kept.

## What it does not tell you

- **It undercounts.** Short streets, alleys and anything the page draws too faintly are dropped; the 1911 page may itself leave streets out. Do not read a missing street as "not there in 1911".
- **Only the area of the page.** About -84.442 to -84.337, 33.724 to 33.788. Beyond it the 1911 snapshot draws nothing, even though streets existed: set the layer's snapshot years aside or use the 1928 layer there.
- **Geometry and names are 1928's**, only the *presence* is 1911's. A street realigned or renamed between 1911 and 1928 appears as it was in 1928 (the renaming table covers some, see below).
- **The scan is thinly sourced**: "scanned from a rather brittle Atlas published in 1911" (Wikimedia Commons; the atlas and mapmaker are not recorded). See `backdrops.md` and the chapter sources.
- Same licence question as the other ECDS street data (`atlanta-streets-1928.md`), plus the atlas's own provenance.

## Street renamings

`data/street-renames.json` gives period names for seven Atlanta streets, applied by `scripts/apply-street-renames.js` as `names` spans on the 1878, 1911 and 1928 layers, so a map of 1877 labels "Wheat Street" and "North Collins Street" and a map of 1906 labels "Auburn Avenue" and "Courtland Street". Each entry has its source:

| Old name | Current (1928) | Used until | Quality |
| --- | --- | --- | --- |
| Wheat Street | Auburn Avenue | 1893 | documented (Georgia Encyclopedia; Garrett) |
| North Collins Street | Courtland Street | 1886 | documented (Garrett, via Wikipedia) |
| McDonough Boulevard | Capitol Avenue | 1885 | documented, not independently checked |
| Foster Street | Edgewood Avenue | 1879 | approximate: the name on the 1878 map; the change date isn't given |
| Mayson Avenue | Lindbergh Drive | 1927 | documented (Garrett p. 833) |
| Carolina Avenue | Camilla Street | 1912 | approximate: the name on the 1911 Sanborn map |
| Grove Street | Maiden Lane | 1918 | approximate: the name on the 1917 Sanborn map |

The source for nearly all of this is Wikipedia's "List of former Atlanta street names", which gives most renamings **without a year**, so only these have a date that can be used. The file's `not_applied` list records what was left out and why (entries dated only to "the 1890s", several-name histories, and renamings after 1945, which the 1928 layer's names already predate). **The 1903 list.** The same count is the *Atlanta Constitution* article of Oct. 17, 1903, "Many Streets Get New Names": a list Forrest Adair gave the council's street committee, of "about 225" streets with the names each carried then and the names each had before. It is transcribed in full (233 entries, 417 former names) in `sources/street-names-1903.txt` and `data/street-names-1903.json`, and attached to the street layers as `former_names_1903` (180 features of the 1878 layer, 219 of the 1911, 467 of the 1928; shown in the inspector and by `find_features`). **It dates nothing**: it says only that the former names were out of use by October 1903, most streets list several former names in no order, and the article gives no years. It therefore cannot support labelling a street with an old name in a particular year, and the labels use only the dated renamings above. What it does show:
- 206 of the 233 streets' 1903 names are also in the 1928 layer, so most 1903 names survived to 1928; the other 27 were renamed or dropped between 1903 and 1928 (Drew, Raine, Rossmer, Granger, Burckel, Benjamin, West End Avenue, Cloverdale, Meredith, Kolb, Gaskell, Factory, Price, Earl, Burnham Road, Merretts, Glennwood, Nemo, East and West Peachtree Terrace, D'Alvigny...) or I mis-read them.
- Names are reused for different streets (Irwin Street was York Avenue's old name, and a different Irwin Street exists), so a former name matching a layer street is not evidence that street was renamed.
- Several 1903 entries swap names (Abbott Street was D'Alvigny; D'Alvigny Street was Abbott), which the transcription keeps as printed.
- Some entries repeat for different stretches (Smith, Hunter, North, Peachtree, Edgewood, Auburn, Bell); those features get `former_names_ambiguous`.
- **Armstrong Street was Walnut and Jenkins Streets** and **College Street was Coca-Cola Place**. Jenkins Street is the street the Atlanta Medical College stood on, so the medical colleges sheet (`sanborn-medical-colleges-1899`) has Armstrong as its south edge, not a street missing from the layers; the sheet as cropped doesn't show the street names, so fitting it needs the full sheet (Library of Congress, `sanborn01378_005`, image 59).

Transcribed by eye from a scan on 2026-10-28; read the transcription notes in the JSON before relying on one entry. Two lines were partly unreadable (Loomis Avenue's former name; Gartrell Street's, "Chamberlin") and one is ambiguous ("Boulevard Factory street").

## Known gaps

- The 1928 layer is also not a 1911 grid: wherever a street was renamed between 1911 and 1928 without a dated source, the 1911 snapshot uses its 1928 name.
- Dedicated work would need the city directories (1870s–1920s), which list streets and their changes by year, to do this properly.
