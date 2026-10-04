# Cache Line bridge artwork

Eight still illustrations for the Level 1 → Cache Line comic, rendered by
`src/engine/cache-bridge.js`. Dialogue and controls are drawn at runtime; the
existing eight-page opening in `assets/intro/` remains unchanged.

| Scene | Runtime image | Source PNG | Story beat |
| --- | --- | --- | --- |
| 1 | `bridge-01-district.webp` | `sources/bridge-01-district.png` | The district answers |
| 2 | `bridge-02-uplink.webp` | `sources/bridge-02-uplink.png` | Transit uplink opens |
| 3 | `bridge-03-original.webp` | `sources/bridge-03-original.png` | Original audition |
| 4 | `bridge-04-clean-copy.webp` | `sources/bridge-04-clean-copy.png` | Missing stretches |
| 5 | `bridge-05-keep-it.webp` | `sources/bridge-05-keep-it.png` | Keep both traces |
| 6 | `bridge-06-departure.webp` | `sources/bridge-06-departure.png` | Departure at the studio curb |
| 7 | `bridge-07-ignition.webp` | `sources/bridge-07-ignition.png` | Original loaded |
| 8 | `bridge-08-cache-line.webp` | `sources/bridge-08-cache-line.png` | Cache Line road handoff |

Images were created with built-in `image_gen.imagegen`, using the approved
intro character/studio art and existing vehicle/dashboard views. Selected
PNG outputs are preserved unchanged; runtime WebPs are quality-92 format
conversions without cropping, resizing or repainting. Native dimensions vary
slightly around 2.2:1; runtime uses a full-image fit.

`art-manifest.json` records actual source/runtime dimensions, bytes and SHA-256
hashes plus every prompt/provenance JSON. Preserve all four pair provenance
files and all scene prompt/edit records; they contain full requests,
reference paths and selected output history. Scenes 1, 2 and 8 have selected
ImageGen revisions restoring established costume/vehicle insignia; each edit
record documents its request. The 1/2 pair provenance is explicitly historical
and not selected. These revisions are not manual image transformations.

Cache already owns the protected original. DJ retains both traces; 6 Bit
is on comms in departure/road scenes. Rear car/Cache angles avoid claiming
new front-facing car or complete character model sheets. See
`docs/source-pack/CACHE_LINE_BRIDGE.md` for the exact script, controls and
review limits. The five audible bridge effects are runtime synthesis, not
audio embedded in these images or excerpts of the song.

The sixteen selected PNG/WebP files are published at immutable ancestor
`9881bf126f2a529ccfe5c6262d4c1de98990973f`, used by the runtime image
loader. Prompt/provenance records, this README and the manifest are carried
by the integration descendant rather than that artwork-only commit.
