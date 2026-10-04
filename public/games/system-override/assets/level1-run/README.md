# 6 Bit grounded run

This is a new clip alongside the original canonical model assets. The source was
created with the built-in image generation tool from the existing grounded,
right-facing 6 Bit walking reference. The art request preserved the 6 Bit cap,
glasses, long brown hair, black shirt/gloves, cargo trousers, boots and inked
shading, with twelve stronger running poses in a transparent four-by-three grid.

`6_bit_run_source.png` is the unmodified generated source. Its SHA-256 is
`18a4cf5f80556bdc6f9f737e06484e67c5111472efca91b4dff3f9be89cb24e5`.
`tools/prepare-level1-run.py` assigns transparent edge pixels to the nearest
opaque character silhouette, then uses integer cropping and padding only.
It neither resamples nor redraws the artwork. The lossless atlas has twelve
512×512 cells, a registered hip at x=240 and ground at y=448. Deliberate flight
phases retain their authored lift. The calibration matches the old walking
clip's median visible body height: 200.090909 world pixels.

Each cel lasts 50 ms (600 ms per gait). Grounded running is 450 units/second;
ordinary walking remains 300. Existing hitboxes, jumping and entrance walking
are preserved. The manifest points to the separate immutable art commit;
the initializer loads the separate immutable manifest commit. All original
manifest records and canonical raster bytes remain unchanged.

The native check decodes all twelve distinct poses, checks source/atlas hashes,
registration, pause and input locks, controller remaps, road control isolation,
and locomotion at 30/60/120 Hz. Native comparison captures and final publication
results are recorded separately by the source export evidence.
