# Level 1 presentation assets

Owner-requested art after merged PR #44. Studio Rats is BARCODE slang for cats; the depicted character is a tuxedo cat. This is one recurring cameo, not another playable character.

| File | Use | Frames / anchor |
| --- | --- | --- |
| studio-cat.webp | Street inspection and panel-margin walk | 4, 2 × 2 atlas; each 256 × 256 cell has feet at (128, 240) |
| direction-arrow.webp | Reusable right-pointing objective marker, rotated by its caller | 1, 320 × 196; centered |
| boss-pulse.webp | Mirrored ground pulse in both travel directions | 4, 2 × 2 atlas; crop (10, 95, 236, 145) within each cell, bottom-center anchor |

Created with the built-in image generation tool. Full prompts, original source hashes, exact transparent crops/packing, runtime hashes and byte sizes are recorded in `prompts.json` and `manifest.json`. `tools/build-presentation-assets.py` performs only alpha-preserving packing and scaling of the original generated PNGs; no existing boss sheet is redrawn. Original generation outputs remain separate from runtime atlases.

The shared runtime cache loads these three images once from an immutable repository revision, with one bundled relative fallback per image. Failed delivery retains the caller's lightweight vector fallback. It creates no canvas, event loop, audio source or timer. The direction marker can be reused through `BARCODE.PresentationAssets.draw('directionArrow', ctx, options)`.

The pulse's cropped draw window fills the existing 64 × 56 hazard box. A steady bright leading edge remains on that box; the warning, travel speed, damage and musical boundaries are unchanged. The four frames advance from existing pulse travel, so pause needs no new clock.

New art and tuning await owner Makko review. Native diagnostic rendering is evidence of source/frame integration, not host animation or playtest acceptance.
