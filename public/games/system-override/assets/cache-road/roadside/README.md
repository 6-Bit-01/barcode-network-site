# Cache Road roadside art

Current September 26 review: `continuous-ground-panel.svg` is the single
projected bank material. `rolling-ground-grain.webp` overlays it in adjacent
world-distance strips sampled from one painted source. The same world-depth
projection moves this grain, sidewalk, narrow infill streets, buildings and
lamps. The six infill settings live under `../world/`, while painted
individual pedestrians and contextual furniture are procedurally assembled
at world addresses. See
`docs/source-pack/CACHE_ROAD_INHABITED_GROUND.md`. The historical exterior
tiles below remain in the folder for comparison but are not the active bank.

`sidewalk-slab.svg` is the current wet paver/curb tile. The three exterior
tiles, `outer-ground-panel.svg`, `green-ground-panel.svg` and
`service-ground-panel.svg`, fill the bank behind it and continue through
site gaps. Every tile maps to a projected world-distance quad, so its
seams, curb and ground travel with the road, individual places and lamps.
Green/service materials cluster near matching locations; the default wet
ground fills the intervals. The left and right low filler rows also use
different world phases so they do not arrive in mirrored pairs.

`parapet.webp` and `service-pylon.webp` are optimized from the transparent PNGs
in `sources/`. The parapet is drawn as consecutive projected wall segments
following the road bend. Service pylons and cantilever lamps sit at world
distances, get larger as they pass, and mirror across the road. Their amber
light and chipped steel remain separate from lane indicators. Full prompts
and reference roles are in `../ART_PROMPTS.md`.

`places/` contains the current ten independent transparent buildings, lots,
parks and service parcels. The road places each whole prop at its own seeded
world coordinate, with distinct spacing and size. Brief world-fixed filler
elements occupy the gaps behind them. See `places/README.md` for the source
inventory. The rejected horizontal and long diagonal strips remain in Git
history only; `DIAGONAL_PROMPTS.md` records that earlier art experiment.
