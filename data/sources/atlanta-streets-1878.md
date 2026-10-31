# atlanta-streets-1878

Derived, not downloaded: the 1928 street centrelines (`atlanta-streets-1928.geojson`, see `atlanta-streets-1928.md`) kept only where they run in the gaps between the 1878 city blocks (`atlanta-blocks-1878.geojson`, see `atlanta-1878.md`).

- Built by `scripts/derive-atlanta-streets-1878.js` (no download; rerun it whenever either input changes).
- Method: each 1928 street is sampled every 12 m. A sample counts if it is within 32 m of an 1878 block edge and not inside any 1878 block. Runs of counting samples at least 50 m long are kept.
- Result (2026-10-27): 432 streets; about 6% of the 1928 street length lies in the 1878 grid.
- `date_quality: "snapshot"` throughout.

## Known problems

- **Names are the 1928 dataset's, not 1878's**, and those names are 1928's with modern quadrant suffixes (see `street-renames.json` for the few dated renamings applied). Wheat Street, for one, was renamed Auburn Avenue in 1893. The catalog therefore turns this snapshot's lettering off; turn it on per map and rename anything anachronistic with the inspector, from a period source such as the 1878 city directory.
- A street that existed in 1878 but was gone, moved or renamed by 1928 is missing; the blocks still show its line as a gap.
- The test is geometric. A 1928 street laid along an 1878 block edge (a widening, a later alley) can pass.

## Attribution

"Streets: Emory Center for Digital Scholarship, OpenWorld Atlanta (1928) and Atlanta 1878." Licence not stated; see `atlanta-streets-1928.md`.
