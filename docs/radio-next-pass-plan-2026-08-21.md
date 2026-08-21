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

## Change-control rule

No pass may silently suppress another system, infer state ownership from event order, or alter queue/Wheel/music behavior outside its acceptance criteria. If a newly discovered dependency would require that expansion, stop that pass and document the dependency before implementation.
