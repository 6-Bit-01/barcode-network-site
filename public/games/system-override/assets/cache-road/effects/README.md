# Cache Road dirty effects

`impact-grit.webp` and `speed-mist.webp` are optimized from the transparent
PNG sources here. The road renderer changes scale, angle and opacity over an
event while irregular drawn wisps and small flecks continue moving. Hit,
near-pass and Turbo use different placement and timing; Reduced Motion omits
the animated plumes. Full prompts are in `../ART_PROMPTS.md`.

## October 1 — painted wind and passing kit

`wind-whoosh-atlas.png` is the original imagegen output, copied without pixel
edits. It is a 1536 × 1024 RGBA atlas, three columns by two rows, six 512-pixel
cells: three mint/cream wind ribbons, a gold passing crescent, a mint mist
wake and an angular screen-edge slash. Runtime uses the three ribbons,
crescent and slash; the mist wake is retained for later use. All alpha is
preserved. No background removal or recoloring was applied.

The existing raster cache loads it once; four moving peripheral ribbons,
two lower-corner slashes and at most one event whoosh use that atlas. They
are clipped away from the center road/timing line and beneath the HUD.
Reduced Motion or Flashes Off omit this moving layer. Asset delivery is
pinned to its published art commit with a bundled fallback.

## October 1 — owner-rejected curls replaced

`wind-streak-atlas-v2.png` is the original 1536 × 1024 RGBA imagegen output,
copied without pixel editing. Six 512-pixel cells contain thin straight
tapered air-line clusters. Frames 0, 1, 2, 3 and 5 are live; 4 is reserved.
Directional motion replaces the old curls/crescent and permanent corner flare.
The old PNG remains historical; no runtime consumer loads it. Immutable art
revision: `f9c2fad2472f3bebdb9554f13893293d74b8bece`, with identical local fallback.
