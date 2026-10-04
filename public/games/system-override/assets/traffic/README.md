# Existing traffic animation exports

These three lossless WebP atlases derive from the original Ship1/2/3 GIFs, preserving all 81/122/122 frames and their 40 ms durations. Each uses one common transparent crop across its frames and a maximum 320px frame dimension, with nearest-neighbor sampling for the pixel artwork. Metadata preserves the full original canvas/trim proportions so existing ship sizes, padding, flipping and travel positions are retained.

The three atlases together decode to less than 50 MiB and transfer at about 3 MiB. They are shared by all active vehicles. Canvas drawing selects a source rectangle from the existing game-clock animation age; it never decodes or allocates frames while drawing. Pause/reset/dispose retain the existing lifecycle. Original remote GIFs remain optional fallback art if an atlas cannot load; the normal successful path loads only the compact atlases.

`manifest.json` records original URLs/SHA-256, derived SHA-256, dimensions, trim and frame timing. Rebuild with `python3 tools/build-traffic-sheets.py /path/to/original-gifs` (Pillow needed only for this optional art conversion). The directory must contain the three unchanged `Ship1.gif`, `Ship2.gif`, `Ship3.gif` source exports. CI and game playback require no new package.

Makko acceptance must confirm `spaceShipSystem.getDiagnostics().animatedTypes === 3`, visible exhaust motion, unchanged travel framing and a stable pause/resume. Logic/Canvas checks cannot establish live-host delivery or hardware performance.
