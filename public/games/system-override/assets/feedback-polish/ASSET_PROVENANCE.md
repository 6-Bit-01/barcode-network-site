# Tutorial / environment feedback art — September 17, 2026

The owner requested reactive 6 Bit portrait expressions and varied, correctly fastened platforms. After seeing the first three designs, the owner explicitly kept all three and requested two additional side-braced variants for platforms projecting from building sides.

Generated with the built-in image generation tool; prepared as WebP at runtime sizes. Generated alpha is preserved. Existing neutral portrait, Level 1 buildings and broadcast terminal supply the identity/material references. No whole-body actor sprites or animation frames change.

## Prompts and intent

- `hud-expressions.webp`: identity-preserving six-expression atlas, three columns/two rows. Reading order: neutral, hurt grimace without blood, confident grin, focused charging, worried low health, relieved/victory smile. Front-facing composition and the 6 Bit hat/green brim, angular clear glasses, white face paint/black eye mask, long brown hair and gritty ink style stay fixed. Pure black background, no labels/gutters, same scale in each frame. Source 1536×1024, prepared 768×512.
- `platform-facades.webp`: three equal cells across one transparent atlas: perforated maintenance grate, battered mint service shelf with vented fascia/amber indicator, dark I-beam walkway. Shallow top/right perspective, worn muted blue-green steel, dark ink, rivets, restrained purple edge light. Thin walking deck and two wall-mounted brackets, no railings or obstacles above. Source 2172×724, prepared 1536×512.
- `platform-side-left.webp`: side-mounted grate extending RIGHT from a LEFT-only bolted vertical plate. One rigid diagonal triangular brace returns the outer deck load to the base of that plate. No legs or mount beneath the middle/right end. Same perspective and materials, transparent background, prepared 512×512.
- `platform-side-right.webp`: distinct battered mint shelf extending LEFT from a RIGHT-only plate, with vented fascia and three muted amber lights. Closely paired diagonal struts return the outer left deck load to the right plate. No left/middle vertical support. Same perspective/materials, transparent background, prepared 512×512.

`PLATFORM_MOUNTS` in Sector1Progression assigns all five designs to credible mounts. Facade variants may attach to roof-anchored tension straps across glazing; side variants never use the old pair of unsupported legs. Native evidence and gameplay checks are documented in the completed pass report.
