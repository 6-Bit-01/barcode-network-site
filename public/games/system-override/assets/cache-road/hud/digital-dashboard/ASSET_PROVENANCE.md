# Cache Road digital dashboard assets

Owner request: replace the text-heavy HUD with a custom 1980s digital dashboard
showing MPH, gear and useful visual game data. Existing rearview blur remains
exactly 2.3 px. Live numbers and controls are composited at runtime.

## Instrument housing

`instrument-bezel.png` is the unmodified RGBA output of the built-in ImageGen
tool, generated September 29, 2026 (owner timezone). No external artist or
dashboard photograph was used. Source dimensions: 2039 × 771. The runtime
source rectangle `[12,120,2018,512]` selects the housing without altering the
saved source. The display is opaque and the exterior is transparent; alpha
above 32 occupies `(16,125)–(2023,626)`.

Exact generation prompt:

> Use case: stylized-concept. Asset type: production game HUD asset, a reusable 1980s digital automobile dashboard instrument housing. Create ONE single very wide horizontal instrument bezel, straight-on orthographic front view, on a truly transparent background. Overall shape approximately 3.6:1 width to height, filling the canvas width. Squared-off rounded rectangle with bevel-cut corners, narrow layered charcoal black ABS and dark gunmetal frame, small inset screwheads, slightly worn graphite material, subtle thin mint/cyan phosphor edge reflection and a few restrained amber detailing marks. The central display must be ONE large perfectly empty near-black smoked-glass rectangle, completely flat and unobstructed, occupying at least 85% of the width and 70% of the height, with straight edges so live game digits can be composited inside. Strong clean silhouette and crisp readable pixel-art-inspired hand-painted 1980s arcade aesthetic, detailed enough to fit a richly painted nighttime cyberpunk racing game, restrained and functional. Do not put any digits, numbers, text, letters, logos, symbols, gauges, bars, dividers, knobs or drawings on the empty display. No steering wheel, no car interior, no scenery, no extra panels, no dramatic perspective, no glossy holographic sci-fi shapes. This is an isolated reusable dashboard frame asset, NOT a screenshot or a complete dashboard. Preserve genuine transparency outside the housing. Keep the dark empty screen opaque.

## Live instrument artwork

`vfd-digits.svg` is a custom static glyph atlas: 12 columns × 3 rows, with
64 × 112 cells. Columns are 0–9, minus, blank. Rows are mint, amber, red.
The glyphs are painted segments with dim unlit elements; the code selects
the current value rather than playing the atlas as an animation.

`instrument-icons.svg` is a custom static icon atlas: 8 columns × 3 rows,
with 64 × 64 cells in the same colors. Columns: car/integrity, countdown
clock, Turbo bolt, Echo pair, Brace shield, Push chevrons, score cassette,
queued-change arrow. These symbols supplement short labels and actual
controller bindings. There are no invented fuel, RPM or temperature values.

Rebuild both vector assets with `python3 tools/build-cache-road-dashboard-assets.py`.
No fonts or external clip art are embedded. All three files are project-owned
assets under the shared PresentationAssets loader, with static frame metadata.
