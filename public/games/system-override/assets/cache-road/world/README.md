# Cache Road world art

The `props/` folder contains 15 **individual** pedestrian cutouts and five
street objects. Ten people have side, rear or three-quarter action poses:
walking a bicycle, sweeping, playing handheld and board games, watering,
repairing, waving, skating, carrying a crate and cooking. The first five
standing people are retained as additional variants. Each has a separate PNG
source in `sources/` for later animation work. Procedural world-address
groups choose one to five distinct people without replacement; props are
selected by the adjacent area's purpose. No paired pedestrian image is active.

Current September 26 review: `bridge-free-distance.webp` and
`bridge-free-outskirts.webp` are the two opaque-looking city depths behind
the shallow city boundary. `ground-cluster-left-01..03.webp` and
`ground-cluster-right-01..03.webp` are complete, fully opaque ground-layer
neighborhoods; no more than one per bank owns a visible gap. The six smaller
paintings (`neighborhood-repair-shop`, `greenhouse-workshop`,
`outskirts-homes`, `outskirts-workshops`, `transit-service-nook` and
`utility-service-corner`) now fill selected other gaps, with small branch
streets and street life supplied by the renderer. Their PNG sources remain
under `sources/`. See `docs/source-pack/CACHE_ROAD_INHABITED_GROUND.md`.

`street-vendor-people.webp` is an active market/diner frontage with its PNG
under `sources/`. `service-bus-stop.webp` and its source are retained but
inactive; the current world has no coherent bus route.

The earlier panorama and city description below documents retained sources
and previous visual experiments.

`panorama-distance.webp`, `panorama-skyline.webp` and
`panorama-frontage.webp` are the current three individually painted
transparent city layers. Their PNG sources are under `sources/`. The
renderer draws each wider than the viewport at its natural aspect ratio,
with no horizontal fattening, then pans all three from one road bearing at
increasing depth ratios. Their lower facades tuck behind the city horizon.
The earlier `distant-city.webp`, `skyline.webp` and `mid-city.webp` remain
here as the previous art sources for comparison, but are not preloaded.

Historically, `skyline.webp` was prepared from the saved transparent
`Rain-Soaked Retro-Futurist Skyline.png`. `distant-city.webp` and
`mid-city.webp` are separate generated transparent paintings, with their PNG
sources under `sources/`. They move at increasing speeds behind the road:
distant small buildings, recovered far skyline, then near industrial facades.
The sky's color, ribbons and haze move with the shared music beat, active part
count and Turbo; Reduced Motion holds their geometry. Level 1's animated
`ship-1.webp` and `ship-3.webp` fly through this layer at varied apparent
depths and angles without collision behavior.

The road keeps Level 1's `assets/wet-street/rain-blacktop.webp`, subdued over
dark asphalt. Its perspective bands now sample adjoining texels, blend the one
vertical wrap, and no longer draw artificial wet seams. Section lines remain
faint, with part markings above the texture. Roadside art is documented in
`../roadside/README.md`. This is production draw code, not the old composite.
