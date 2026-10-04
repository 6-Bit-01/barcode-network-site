# Background motion asset

The owner requested an animated asset made here from the existing city artwork, without another service account. The result is an eight-second, silent H.264 loop. Only the painted smoke/cloud regions deform; architecture is copied unchanged in the uncompressed frames. H.264 introduces ordinary compression differences. Rain remains a separate game layer so its intensity can be tuned without re-encoding.

## Selection-mask request

Built-in image generation edited the supplied `assets/world-v3/far-background.webp` reference into a motion-selection mask. Prompt intent: production background extraction, white for the existing smoke/cloud shapes and black for sky gaps, buildings, roofs, antennas, chimney bodies, windows and lower city. Preserve the complete wide panorama, precise cloud outlines and antialiased boundaries. Cloud interiors are white regardless of the existing swirl ink. No cropping, letterboxing, labels or replacement game art.

The generated mask incorrectly included some distant skyline silhouettes. `build-background-loop.py` limits that selection to the upper sky and explicitly tapered chimney plumes, then feathers their edges. The original illustration, not the generated mask image, supplies every output color. Earlier owner authorization for Python asset processing applies to this offline bake.

## Bake and registration

Run `python3 tools/build-background-loop.py` with Pillow, NumPy, SciPy and ffmpeg installed. These are offline asset-authoring tools, not game or test dependencies. The script creates 192 frames at 24 fps using periodic horizontal/vertical displacement over exactly eight seconds. It checks the loop endpoint and stationary source pixels before encoding. It creates no camera motion, rain, audio or duplicate endpoint frame.

Source content is 2087×754. Encoding pads one right-hand column to 2088×754 for H.264; the production renderer crops that column and retains the original background aspect ratio and fixed screen-space scale. `manifest.json` records hashes, dimensions, timing and uncompressed checks. Keyframes sample 0, 2, 4 and 6 seconds for review.

The game owns one muted, inline, looping video. Existing pause/reset/stop lifecycle hooks control it. The immutable hosted asset has one bundled-file fallback, followed by the original still if decoding or autoplay is unavailable. Owner Makko review remains necessary for hosted media-policy and visual acceptance.
