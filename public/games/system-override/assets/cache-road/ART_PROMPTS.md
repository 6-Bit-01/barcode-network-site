# New Cache Road art prompts

Built-in image generation was used. The recovered
`world/sources/skyline.png` served as a **style reference**, not an edit target,
for the first four assets. Every source PNG retains real transparency.

## `world/sources/mid-city.png`

Transparent midground panorama of dense low industrial rooftops and facades
along a retro-futurist music-city viaduct. Side elevation, nearly orthographic;
varied recording studios, concrete service buildings, rail ribs, conduits,
warm windows, abstract glyph signs and weathering. Dark continuous lower edge,
clear alpha sky, restrained cyan/rose/amber lights. Match the saved rainy
skyline's painterly pixel-influenced treatment. No road, characters, vehicles,
legible text or HUD.

## `roadside/sources/service-pylon.png`

One isolated battered industrial service pylon on a short concrete plinth:
asymmetric cantilever with two warm amber lamps, a cyan status light, wiring,
rivets, rain streaks and chipped hazard paint. Side elevation with feet at the
bottom, strong silhouette at 60–160px, dark navy steel and restrained color.
Transparent background; no scenery, text, vehicles or generic clean bollard.

## `roadside/sources/parapet.png`

One horizontally repeatable expressway parapet segment in side elevation:
weathered concrete, art-deco steel rail, service panels, drainage grates,
chipped hazard trim, conduits and a few warm marker lamps. Square-cut ends,
clear alpha, painterly game-art style. No perspective vanishing point, road,
skyline, text or giant glowing bars.

## `world/sources/distant-city.png`

Many small night-city buildings across a distant valley, tiny antennas,
bridge spans and restrained cyan/amber/magenta window pinpricks. A low,
continuous atmospheric skyline with a clear transparent sky above; no large
foreground towers, road, vehicles, text or HUD. Soft, lower contrast than the
saved skyline and painterly pixel-influenced in style.

## `effects/sources/impact-grit.png`

One asymmetric transparent collision burst of tire spray, soot, asphalt grit
and torn smoke, low and outward from an empty center. Rough hand-inked edges,
muted amber, gray and cyan, droplets and charcoal flecks. No radial starburst,
geometric spokes, neon triangles, vehicle, backdrop or text.

## `effects/sources/speed-mist.png`

One transparent diagonal acceleration plume: dirty mist, exhaust heat and tire
spray curling back, with broken amber glints, cyan/gray translucent wisps and
soot flecks. Graphic-novel/game-art treatment, asymmetric taper, narrow origin
and wide tail. No flames, clean triangles, uniform glow, vehicle, road or text.

## October 1 — wind/whoosh atlas

Built-in imagegen, transparent background requested. One 1536 × 1024 atlas
in a 3-column × 2-row grid, each 512 × 512 cell. Top row: three isolated
icy-mint/warm-cream wind ribbons, upper-left to lower-right, tapered tips.
Bottom row: gold passing crescent, mint wind mist wake, angular mint/cream
peripheral speed slash with small gold accents. Gritty painted late-1980s
cyberpunk comic brushwork, ragged ink/dry-brush grain, generous transparent
gutters. No lettering, labels, car, scenery, frames or opaque background.
The generated RGBA bytes are preserved as `effects/wind-whoosh-atlas.png`.

## October 1 — thin air streak replacement (built-in imagegen)

Transparent 1536 × 1024, 3 × 2 atlas of six 512-pixel cells. Sparse clusters
of 5–8 very thin straight tapered parallel air streaks from upper left toward
lower right. White/off-white, subtle mint, transparent gaps, small brighter
tips, no filled ribbons. Three varied top clusters, longer passing cluster,
quiet reserved cluster, fine corner cluster. No curls, spirals, smoke, debris,
brush blobs, outlines, colored halos, background, text or environment. Original
RGBA output copied unchanged as `effects/wind-streak-atlas-v2.png`. Runtime
uses stretched directional clusters and no permanent corner flare.
