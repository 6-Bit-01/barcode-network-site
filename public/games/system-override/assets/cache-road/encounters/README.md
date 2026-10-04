# Cache encounter sprites

Four production sprites for the authored highway encounter pass. The ability
sprites contain no baked vehicle, so the existing animated Cache and rival
sprites remain the source of vehicle identity and motion.

| Runtime asset | Suggested presentation key | Native size | Normalized anchor | Use |
| --- | --- | --- | --- | --- |
| `push-arc.webp` | `cachePushArc` | 1774 × 887 | `(0.50, 0.78)` | Cyan kinetic reaction at the displaced traffic contact |
| `brace-halo.webp` | `cacheBraceHalo` | 1942 × 809 | `(0.50, 0.75)` | Amber segmented shield around the car base on an absorbed hit |
| `echo-ribbons.webp` | `cacheEchoRibbons` | 1535 × 1025 | `(0.50, 0.78)` | Magenta/cyan interference wake beneath the active Echo vehicle |
| `delivery-beacon.webp` | `cacheDeliveryBeacon` | 1024 × 1536 | `(0.50, 0.96)` | Grounded final-delivery signal pillar |

Anchors are compositing origins within the full uncropped image. Apply width
and the native aspect ratio together. Keep VFX modest enough to preserve the
lane paint, vehicle silhouette, and approach cues. The runtime may animate
scale, opacity, and position over the physical event; it must not move traffic
only in the illustration while leaving collision or mirror coordinates behind.
Reduced Motion can retain a brief low-opacity confirmation without an expanding
flash. These images are single sprites, not animation sheets.

The delivery beacon is a compact solid prop, not a road-spanning gate. Use a
reserved shoulder footprint or the existing authored gate footprint and sort
it by the same grounded perspective as nearby props. Do not add it to random
placement beside an occupied building footprint. Its mint lamps communicate
the final safe route without additional prose on screen.

`sources/` preserves the original generated PNG bytes. Runtime WebP files are
lossless format conversions at the same dimensions. Alpha bytes and all
visible RGBA pixels were verified identical after conversion. No pixel edits,
cropping, background removal, or generated replacement of approved vehicle
art was performed. Transparent margins and partially transparent glow belong
to the source art. Each file's dimensions, alpha bounds, byte count, SHA-256,
and conversion checks are recorded in `manifest.json`.

All four assets were generated with the built-in `image_gen.imagegen` tool.
`ART_PROMPTS.md` records the exact prompts, source output paths, and the existing
local images inspected for style context. The renderer's production asset
registry owns immutable hosted URLs; this folder does not claim a deployment
or a browser acceptance result.
