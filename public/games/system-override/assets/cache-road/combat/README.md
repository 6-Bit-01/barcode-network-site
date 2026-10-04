# Combat chase art

Generated with the built-in `image_gen` tool on October 1, 2026 after the
mechanics checkpoint passed. Anonymous helmeted riders and mechanical hostiles
add no named story character. Existing Cache car and enforcement rig art remain
unchanged. The mechanical comic ink, dirty violet steel, mint hardware and coral
lights follow the inspected road vehicle art.

| Key | Runtime | Grid | Cell |
| --- | --- | --- | --- |
| `cacheCombatBike` | `bike-rider-atlas.webp` | 4 × 2, eight poses | 448 × 512 |
| `cacheCombatHostiles` | `hostile-chassis-atlas.webp` | 4 × 3, twelve poses | 432 × 400 |
| `cacheCombatBikeCrash` | `bike-crash-atlas.webp` | 3 × 2, six components | 576 × 480 |
| `cacheCombatBlast` | `combat-blast-atlas.webp` | 3 × 2, six blast ages | 624 × 528 |

Every exact generated PNG and prompt is retained in `sources/`. The initial
crowded crash sheet is historical review material; its imagegen spacing revision
is selected. Runtime sheets use measured rectangular extraction at transparent
or lowest-alpha gaps and transparent padding; no recoloring, painted compositing,
alpha editing or resampling. Source originals are unchanged. Exact extraction
rectangles, offsets, per-cell anchors/bounds, SHA-256 hashes and alpha counts are
in `atlas-metadata.json`. Every runtime WebP is exact lossless and its decoded
RGBA was compared byte-for-byte with the prepared atlas. Faint edge alpha is
preserved, including the generator's local glow. Complete helmets, limbs,
antennas, blades and wheels take precedence over nominal source grid lines.

The additional decoded total is **28.779296875 MiB** across four shared images.
The 20 MiB optimization target was an aim; preserving original pixels/alpha and
whole silhouettes takes precedence. Only runtime WebPs load, once through the
bounded shared `PresentationAssets` cache. Originals/review images do not load.
Publication registers the exact immutable binary commit with bundled fallback.

`BARCODE.CacheRoadCombatArt.drawBody(ctx, {kind, phase, damage, ageMs, wreck,
flipAngle, lift, riderLift, riderOffset, rider, alpha, x, y, width, height,
reduced})` returns true after painting a body, false when unsupported/missing.
`width`/`height` are projected pixels; `lift`/`riderLift` are controller world
heights, scaled by width/164. Measured tire/road contacts keep live poses attached
to the same physical address. The controller supplies chassis rotation and the
detached rider's lift/offset. Both camera projections consume the same pose.

The bike has neutral/left/right/kick/recovery/impact/damaged/empty-wreck poses.
Its early wreck selects tipped/upside-down/crushed bike components, then the
static empty wreck. Its separate rider selects ejected/tumble/settled components.
The other sheet assigns four cells each to rammer, escort and disruptor:
neutral, committed attack, damaged, wreck. The helper owns no game state,
clock, callbacks, input, audio, loaders, canvases or collision.

`drawBlast(ctx, {x, y, width, height, ageMs, durationMs, alpha, reduced, flashes})`
uses a real takedown's age; normal duration is 1900 ms. Flashes off selects only
smoke/debris cells 3–5. Reduced Motion omits moving blasts and preserves static
body/wreck identities and detached settled rider. Attack/damage information is
not removed. Warnings, shadows, projectiles, HP, collisions, rewards and boss
systems remain production-controller/road responsibilities.

Automated native art/geometry review and real-input combat previews are separate
from owner Makko/controller/fun acceptance; creation alone claims none of those.

## Projectile/contact polish after #169

`cacheCombatFX` is a 1448x1086, 4x3 transparent atlas with twelve 362px cells.
It adds about 6 MiB decoded memory and supplies player/hostile/reflected bullets,
muzzle, sparks/ricochet/smoke, ram pressure/contact and disrupt/residue. Exact
generated PNG/prompt and lossless WebP hashes/grid/alpha bounds are recorded in
`fx-metadata.json`. Pillow verified exact decoded RGBA conversion; native
Canvas checks source alpha (native decoder colour handling is separate).
The immutable asset ancestor is `3500643aeebacedd8c679cb3db54ea842e13be32`.
`drawFX` consumes projected position/angle/frame/alpha only. The road emits
bounded transient contact records from actual actions/hits, and projectile
paint retains actual allegiance/direction. Reduced Motion omits transient
contact paint; Flashes Off selects residue. Projectiles remain visible.
All twelve cells are checked through explicitly staged production front-road
draws, alongside earned complete-race preview evidence. Historical body art
and its provenance are unchanged.
