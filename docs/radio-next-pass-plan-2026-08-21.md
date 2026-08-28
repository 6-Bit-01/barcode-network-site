# BARCODE Radio next-pass plan — 2026-08-21

## Locked checkpoint

- Production checkpoint: `1ae6fdc8259aba389e3f0a470a9a78b211ceb614`
- Checkpoint PR: `#353` — Restore sequential music visual transitions
- Status when this plan was created: merged, deployed, and accepted as the rollback point.

This checkpoint is the baseline for every pass below. Later work must preserve its loaded-song ownership, sequential music-family fade-out/fade-in, Wheel lifecycle, ten-family shuffle, audio-layer composition, performer-safe window, portal behavior, and 20-person Wheel visual calibration without turning that number into a behavior gate, unless a later requirement explicitly changes one of them.

## Delivery order

Each numbered item is an isolated pull request. A later item does not enter the preceding pull request merely because its code is nearby.

### 1. Windows-volume-neutral audio analysis

Remove the default Windows Speakers endpoint volume from captured loopback samples before RMS, FFT, peak, flux, beat, and band analysis.

Acceptance:

- Changing Windows output volume does not materially change energy, bass, mid, treble, peak, or resulting visual strength for the same passage.
- Quiet and loud passages within the song remain meaningfully different.
- Silence remains silence; normalization must not manufacture activity.
- A failed volume query falls back safely without interrupting capture.
- Browser contracts, queue state, polling, visual gains, and music/Wheel ownership remain unchanged.

Accepted calibration correction:

- Preserve endpoint-volume removal, then apply one fixed -9 dB internal analysis reference before RMS/FFT instead of feeding reconstructed full-scale program audio into the analyzer that was tuned against attenuated samples.
- Mark new helper payloads as `fixed_reference_v1`; keep the v1 signal schema backward compatible and apply the mathematically equivalent compressed-domain reference once to unmarked 1.0.3 payloads so the web deploy improves the running helper immediately without double-correcting 1.0.4.
- Do not change, replace, or remove any of the ten music families, lifecycle forms, modulation passes, perimeter identities, transitions, Wheel behavior, or broadcast FX in this correction.

### 2. Full-screen broadcast FX and evolving music families

Add a deterministic randomized shuffle bag of BARCODE-specific CRT, scan, tear, stutter, code, packet, barcode, dropout, and compression effects. Add subtle time evolution inside each selected music family.

Acceptance:

- The full effect pool is exhausted before a repeat, including no adjacent repeat across bag boundaries.
- Effects may enter the performer window only through bounded, sparse intrusions; manual Lightning and Signal Breach cues keep priority.
- Bass continues to own mass/scale/weight, mids structure/drift, treble shimmer/hue/phase, and all-band tapestry the combined layer.
- Track progress and phrase motion evolve a family without changing its identity mid-song.
- Music transitions, Wheel behavior, 30 FPS cap, Canvas density, and zero-new-polling constraints remain intact.

Accepted additive extension:

- Preserve every existing family renderer, lifecycle form, transition, perimeter identity, and baseline movement.
- Layer family-specific breathing, pulse, glow, line-weight change, inward reach, growth/shrink, and shape deformation over those retained forms.
- Ordinary audio keeps the visuals alive with headroom; real analyser hits earn the strongest compression/expansion, impact motion, glow, and cross-shape response. The BPM clock may pace subtle breathing but cannot fabricate a hard hit.
- The ten families keep distinct modulation profiles so this pass adds visible performance without flattening them into one shared effect.
- Gate persistent additive geometry behind a shaped sustained-structure level so silence and quiet passages cannot begin in a visually maxed state, while loud sustained passages can still build the retained forms.
- Give bass, mid/snare-like, treble, and true all-band arrivals separate short-lived event channels: bass owns pressure and weight, mids own flashes and structural strikes, treble owns sparks and glints, and the combined hit owns the rare coordinated burst. The mid event is a spectral/transient proxy, not semantic drum or stem detection.
- Soften the performer-window cutout with bounded event-only breaches that reuse each family's visual language. These breaches may cross the safe field briefly without replaying the dense family renderer or removing the established center protection.
- Give the retained family renderer, lifecycle form, additive modulation, and perimeter identity one shared quiet-to-loud intensity owner. A quiet opening must reduce all four passes together; no older baseline count, opacity floor, or perimeter minimum may remain visually maxed behind a newer gate.
- Treat the Windows helper's held sample peak as level evidence only, never as a continuous kick, snare, treble, or all-band event. Reset the prior track's smoothed bands and build memory when a new loaded occurrence begins so a quiet opening cannot inherit the previous song's chorus.

### 3. Sponsor-break eligibility

Require both two elapsed broadcast hours and the current moving played-versus-remaining midpoint before the sponsor break can become due.

Acceptance:

- No sponsor suggestion appears before 7,200 elapsed broadcast seconds.
- After two hours, the due point follows the current midpoint of eligible real tracks as the show changes.
- Simulation tracks remain excluded.
- Stale pre-fix `due` state is ignored before two hours.
- Starting the break independently enforces the same eligibility rule.

### 4. Collaborator visibility

Carry the existing collaborator string through the public projection and display it on the relevant public and operator track surfaces.

Acceptance:

- Collaborators survive intake, storage, normalization, and public projection.
- Public queue, Now Playing, Next In Line, operator lanes, and Player Dock show a clear `Featuring` line where relevant.
- Existing privacy boundaries remain intact and no extra polling or storage key is introduced.

### 5. Purchased skips, gifted skips, and operator readability

Make confirmed paid skips and submission notes obvious without rebuilding existing Stripe/gift plumbing.

Acceptance:

- Own purchase is labeled `ARTIST BOUGHT A SKIP` with the artist identity.
- Gift purchase identifies the public supporter when supplied and the beneficiary artist; otherwise the supporter remains `Anonymous` under the existing disclosure.
- Public activity, persistent public cards, foreground moments, operator lanes, Next In Line, and Player Dock agree.
- Confirmed own and gifted skips receive equal bounded foreground priority.
- Submission notes and paid-skip attribution are prominent enough for the host to read without opening collapsed metadata.
- Stripe billing/customer data is never exposed and no redundant buyer record is added.

### 6. Measured usage optimization

Measure a representative four-hour show first, then reduce unnecessary live-read cost without changing queue behavior or recovery guarantees.

Acceptance:

- Establish commands, requests, bytes, and parse cost per live endpoint before changing architecture.
- Reduce repeated whole-store reads and the current three-key polling fan-out.
- Keep personalized submitter state separate from shared public projection where beneficial.
- Preserve durable snapshots, queue semantics, overlay ownership, recovery, and public/private boundaries.
- Every optimization has before/after evidence and a rollback-safe boundary.

### 7. Twenty-family music visual expansion

Implementation base: production commit `a3ff0a5` after PR `#373` (finished-show timing report telemetry).

Repair the two show-tested weak families, then expand the deterministic music deck from ten to twenty without changing the existing source workflow.

Acceptance:

- Matrix Rain uses larger chroma-safe glyphs and readable code banks; Signal Constellation uses visible facets, node plates, packets, anchors, and links that survive keying and stream compression.
- Add CRT Signal Breach, Voxel Megacity, Liquid Chrome, Cellular Takeover, Shattered Broadcast, Barcode Foundry, Recursive Portal, Holographic Terrain, Kinetic Glyph Engine, and Mechanical Iris as ten genuinely different composite families.
- Every loaded-track deck contains all twenty families once before reuse, forbids adjacent repeats across deck boundaries, and preserves loaded-song ownership and the existing previous/current crossfade.
- Every new family retains independent bass, mid, treble, all-band tapestry, lifecycle, and perimeter behavior through the existing audio drive and performer-safe pipeline.
- Add an authenticated Visual Overlays menu with one test button for each of the twenty production families. Each command carries only the selected family plus a short-lived nonce through the existing overlay state; the Show Visuals receiver starts an exact two-second synthetic timeline sample when it first observes that nonce, never plays media or uses live audio for the test, and then resumes the real show state.
- Move the five existing manual visual-moment controls into that Visual Overlays menu. Keep the combined live video/Wheel controls in their own Wheel Overlay menu.
- Do not change Audio Bridge capture, the combined live video/Wheel source behavior, queue or timing behavior, playback ownership, Redis polling cadence, the 30 FPS cap, or Canvas density. The permanent source URL and existing `preview=1` surface remain unchanged.

Rollback and deployment boundary:

- Ship the visual expansion and its optional short-lived preview command fields as one self-contained pull request with no data migration. If it misbehaves, revert only that merge commit between shows.
- Keep the future 6 Bit camera CRT/hologram overlay in a separate pull request, route, and file set with no dependency on this expansion. Either PR must be independently revertible without reverting the other.
- Deploy each PR between shows and re-open the saved Studio source before the rehearsal check; do not combine both changes into one live-show rollout.

### 8. Thirty-family music visual expansion — 2026-08-28

Implementation base: production commit `bd45853` after PR `#404` (live visual dynamics and sponsor preflight). Item 7 remains the historical twenty-family checkpoint; this pass extends that accepted system without replacing its renderers or reaction core.

Add Spectral Cathedral, Ferrofluid Field, Orbital Relay, Data Loom, Monolith Array, Plasma Tendrils, Signal Bloom, Vector Swarm, Moiré Engine, and Eclipse Corona as ten genuinely different composite families.

Acceptance:

- Extend the deterministic loaded-track deck from twenty to thirty families while preserving one appearance per family before reuse, adjacent-repeat prevention across deck boundaries, occurrence-stable selection, loaded-song ownership, and the existing previous/current crossfade.
- Give every new family a distinct Canvas renderer, three-act lifecycle, perimeter motif, and exact two-second authenticated silent preview using the production code path.
- Preserve independent sustained and transient bass, mid, and treble ownership. The coordinated tapestry layer must still require all three bands, and lifecycle or tempo may change morphology but may not manufacture audio density.
- Keep all work bounded to the existing portrait-safe Canvas stage, performer-safe field, 30 FPS cap, chroma-safe palette, music-only output gain, and browser-local render loop.
- Preserve the PR #374 render boundary and the PR #404 reaction, crossfade, dynamics, and sponsor-player preflight behavior with explicit source-level regression checks.
- Do not change the 40 Hz Audio Bridge poll, bridge calibration or payload, the commercial player on port `43121`, sponsor ownership, overlay access, queue/Wheel/payment/playback ownership, Redis polling, or production capability gates.

Rollback and deployment boundary:

- Ship this as one independently revertible pull request with no migration or production configuration change.
- Re-open the saved Show Visuals source and rehearse all ten new preview buttons plus live music before any between-show merge or deployment decision.

### 9. Forty-family music visual expansion — 2026-08-28

Implementation base: production commit `79ba395` after PR `#405` (thirty-family music visual expansion). Item 8 remains the accepted thirty-family checkpoint; this pass adds ten selected-only Canvas renderers without replacing or layering over the prior thirty.

Add Möbius Relay, Pendulum Choir, Chladni Forge, Tesseract Fold, Kintsugi Mainframe, Sonic Calligraphy, Rube Signalworks, Shadow Zoetrope, Prism Labyrinth, and Helix Sequencer as ten genuinely different composite families. Their dominant grammars are respectively a twisting closed band, hanging phase oscillators, resonant nodal grains, a projected hypercube, repaired structural plates, inertial nonsemantic brushwork, a linked mechanical reaction, a slotted animation drum, refracted ray paths, and depth-sorted twin strands.

Acceptance:

- Extend the deterministic loaded-track deck from thirty to forty families while preserving one appearance per family before reuse, adjacent-repeat prevention across deck boundaries, occurrence-stable selection, loaded-song ownership, and the existing previous/current crossfade.
- Give every new family a distinct Canvas renderer, three-act lifecycle, perimeter motif, and exact two-second authenticated silent preview using the production code path.
- Preserve independent sustained and transient bass, mid, and treble ownership. The coordinated tapestry layer must still require all three bands, and lifecycle or tempo may change morphology but may not manufacture audio density.
- Keep each renderer bounded to its tested layer plan and run only the selected family per frame; do not introduce another render loop, polling path, audio path, storage path, or always-on parallel visual stack.
- Keep all work inside the existing portrait-safe Canvas stage, performer-safe field, 30 FPS cap, chroma-safe palette, music-only output gain, and browser-local render loop.
- Preserve the accepted PR `#374` render modules, PR `#404` reaction path, and PR `#405` thirty-family renderer byte-for-byte with explicit checkpoint regressions.
- Do not change the 40 Hz Audio Bridge poll, bridge calibration or payload, the commercial player on port `43121`, sponsor ownership, overlay access, queue/Wheel/payment/playback ownership, Redis polling, or production capability gates.

Rollback and deployment boundary:

- Ship this as one independently revertible pull request with no migration or production configuration change.
- Re-open the saved Show Visuals source and rehearse all ten new preview buttons plus live music before any between-show merge or deployment decision.

### 10. Perceptual audio signal foundation — 2026-08-28

Implementation base: production commit `05514be` after PR `#406` (forty-family music visual expansion). This is a measurement and contract pass only; it must not change the accepted renderer output.

Add one backward-compatible optional feature block to the existing local Audio Bridge payload. Preserve `barcode_audio_signal_v1`, every required legacy field, and the permanent `/v1/signal` endpoint so old and new helper/site combinations continue to operate during the manual Windows upgrade.

Acceptance:

- Publish eight non-overlapping perceptual levels (`subBass`, `bass`, `lowMid`, `mid`, `highMid`, `presence`, `brilliance`, `air`) and one separately decaying onset envelope for each band.
- Publish normalized spectral centroid, brightness, crest-based dynamic contrast, recent transient density, stereo width, signed stereo balance, and sixteen bounded waveform-shape samples.
- Preserve the volume-neutral -9 dB program reference and one shared adaptive gain. Perceptual levels must remain comparable across Windows endpoint volume changes without independently normalizing every band toward the same value.
- Keep silence at zero across the optional feature block and never record, persist, transmit, or expose raw audio samples.
- Accept installed helpers without the optional feature block. Reject a present but malformed block rather than partially trusting it.
- Add an explicit PowerShell numeric-trace capture and a local replay report that runs those frames through the production browser signal/reaction functions. Trace files remain ignored by Git.
- Do not consume the new features in any of the forty renderers in this pass. Do not change render modules, scene selection, transitions, lifecycle, Canvas density, the 30 FPS cap, the existing 40 Hz local poll, Wheel/commercial/queue/playback ownership, Redis, Vercel, or production gates.

Rollback and deployment boundary:

- The site contract may deploy before or after the helper because the feature block is optional and the schema remains v1. Install Audio Bridge 1.2.0 only after CI publishes the self-contained artifact.
- Compare at least two real song traces before a later pilot PR maps these features into selected renderer families.

### 11. Perceptual renderer and fullness rollout — 2026-08-28

Implementation base: production commit `a5974ad` after PR `#407` (perceptual audio signal foundation). Item 10 remains the accepted optional bridge contract. The initial five-family pilot was broadened before merge because the production show deals a shuffled forty-family deck and cannot practically target five named scenes for live evaluation.

Acceptance:

- Route validated `perceptual_audio_v1` frames through the existing music signal and reaction objects without changing the schema, local endpoint, 40 Hz poll, 30 FPS render cap, selected-family ownership, lifecycle, crossfade, or performer-safe field.
- Route all forty shuffled families through a scene-specific semantic adapter when the optional feature frame is present. Preserve every existing renderer implementation and keep every old-helper, analyser, and synthetic fallback path on the accepted legacy mapping.
- Give every family a distinct weighted interpretation of sub-bass/bass, low-mid/mid, high-mid/presence, brilliance/air, and their independent onset envelopes. Dynamics, brightness, and stereo width must alter the semantic drive; waveform and directional stereo controls remain direct geometry inputs in the specialist families where they have literal visual meaning.
- Give all forty richer-signal paths a bounded fullness ceiling comparable to the existing dense families. Lift sparse ceilings to a minimum complete authored composition while preserving higher existing ceilings, calibrate sustained activation to the bridge's observed musical range so a strong full-spectrum passage is materially filled without a pulse, and retain headroom above that passage.
- Do not use transient density as a primitive count or hit trigger. It may contribute only a small term gated by actual musical level; a saturated transient-density value with zero feature levels must resolve to zero motion and zero geometry.
- Add numeric regressions proving that all forty families distinguish equal-legacy-loudness songs, own forty distinct profiles, reach their calibrated full ceilings, remain empty during silence, and preserve the exact legacy object and mapping when the optional frame is absent.
- Do not change Audio Bridge capture or installers, the commercial player on port `43121`, queue/Wheel/sponsor/payment/playback ownership, Redis or Vercel behavior, overlay access, public payloads, or production capability gates.

Rollback and deployment boundary:

- Ship the forty profiles, shared semantic adapter, bounded fullness ceilings, tests, and documentation as one independently revertible pull request with no migration or configuration change.
- Re-open the saved Show Visuals source after deployment and let the ordinary shuffled deck run. Compare several spectrally different songs across whichever families are dealt; no named-scene targeting or production selector is required.

### 12. Dynamic song tapestry and rendered-visibility correction — 2026-08-28

Implementation base: production commit `8d4485e` after PR `#408` (all-forty perceptual renderer rollout). The owner rehearsal found that five consecutive families driven by the same real song produced two acceptable compositions and three scenes that were too light to remain legible. The prior regression measured requested primitive totals under an evenly balanced synthetic spectrum; it did not measure uneven mastered-song spectra or the resulting pixels after stroke width, alpha, chroma keying, and performer-center attenuation.

Acceptance:

- Replace the evenly balanced fullness assumption with a bounded real-song visibility reserve. A representative low/body-led mastered spectrum must retain at least 23 primitives in every family before correction, while silence remains zero and no absent all-band tapestry is manufactured.
- Isolate music rendering in one reusable offscreen layer. Retain one half-resolution previous-frame buffer and apply exactly one bounded family-specific feedback transform before the current renderer, providing the persistent visual memory used by classic modular visualizers without adding another animation loop or renderer stack.
- Learn a browser-local rolling fingerprint from low/body/voice/high balance, brightness, dynamic contrast, transient density, stereo image, and waveform roughness. Reset it on loaded-track change; never store, transmit, publish, or add it to the overlay payload.
- Give every family a distinct feedback grammar and let the rolling fingerprint control persistence, drift, rotation, scale, ripple, echo, mirroring, and restrained sonic tint. Current band onsets remain authoritative and the fingerprint cannot manufacture bass, mid, treble, or tapestry hits.
- Detect bounded sparse, flow, build, dense, and release states from fast-versus-slow song energy. Use them only to steer persistent morphology; do not claim verse, chorus, stems, vocals, or semantic song structure.
- Downsample the actual unmasked music layer to `54×72` no more than once every 450 ms, estimate the accepted performer attenuation, and adapt a bounded visibility reserve only when rendered coverage is weak. Reinforce the selected family's own layer plan, perimeter count, reach, thickness, and opacity; do not draw a shared generic rescue overlay.
- Keep the 30 FPS cap, 40 Hz Audio Bridge poll, `perceptual_audio_v1` contract, forty-card shuffle, loaded-track ownership, sequential crossfade, 20% performer-center retention, permanent source URL, and every queue/Wheel/commercial/payment/playback boundary unchanged.
- Preserve the exact legacy path for helpers or fallback sources without the optional perceptual block. Feedback history and adaptive visibility must remain off there.

Rollback and deployment boundary:

- Ship the song-memory chain, measured visibility correction, tests, and documentation as one independently revertible pull request with no Audio Bridge reinstall, migration, or configuration change.
- Re-open the saved Show Visuals source after deployment and run the ordinary shuffled deck. Acceptance is deck-wide: no family may become a near-invisible ghost during ordinary audible music, and contrasting songs must produce visibly different persistence, flow, color balance, section motion, and internal consequences without requiring the operator to identify a family name.

## Change-control rule

No pass may silently suppress another system, infer state ownership from event order, or alter queue/Wheel/music behavior outside its acceptance criteria. If a newly discovered dependency would require that expansion, stop that pass and document the dependency before implementation.
