# Locked repair plan

Approved: 2026-09-13. Owner: **6 Bit**.

## Working rules

Treat show notes as hypotheses until code, tests, or runtime evidence supports them. Keep confirmed defects, reproduced mechanisms, policy choices, and unresolved incidents distinct. Use current owner decisions, current runtime evidence, and current code in that order; dated checkpoints supply historical context. Extend the existing queue, overlay, commercial player, archive and BNL owners.

Work in manageable slices. Each slice must identify affected producers and consumers, add meaningful behavioral regression coverage, pass required repository checks, and leave a concrete reviewable handoff. Carry forward all unfinished items. Do not claim production repair from a local test or an open PR.

Preserve Priority/payment idempotency, Free/Wheel alternation, exact displacement/restoration, Finish-versus-Remove semantics, upload cleanup, public/private boundaries and existing gates. Preserve raw show history. Submitted identity is not verified creator identity. Do not invent anti-repeat odds, replacement submission allowances, identity merges, or historical facts.

## Package 1 — Queue and Wheel integrity

**1A, first implementation slice:**

- W01: Every new spin moves clockwise at least one full revolution and lands on the selected segment, including consecutive spins and repeat winners. Preserve winner probability and stable overlay mounting.
- W02: Wheel winners wait in win order, independent of submission age. Preserve Priority interruptions, displaced entries and Free/Wheel turns. Persist ordering for reload/recovery; define compatible behavior for older entries without new metadata.
- W03: Winner Not Here removes only that entrant's earliest currently eligible track. Keep their remaining tracks eligible and preserve the owed spin. A stale result must not remove a different entrant's track.
- W04: Resolve transitive connections among the existing submitter identity keys into a single eligible entrant. Preserve track order and private identity boundaries. Repeated winners alone do not prove bias; do not add recent-winner weighting.

**1B, next slice within the same package:**

- Q01: Make creator and song credits consistent across queue, Wheel, foreground/video overlays, Deck and BNL live reads. Correct the confirmed filename-derived metadata precedence problem. Keep submitted labels, provider metadata, conflicts and durable artist identity separate and inspect every affected consumer. Wheel movement has not been shown to mutate stored titles.
- Q02: Show active, played and removed counts truthfully across personal queue status and Deck. Distinguish cumulative submissions from songs waiting. Preserve the existing three-submission allowance unless 6 Bit changes that policy.
- Q03: Continue the September 11 WittyF0x Priority/resolver incident investigation with a focused private show-log export. Normal local Priority interruption/restoration passes; do not rewrite the resolver based only on the reported incident.

## Package 2 — Video preparation and synchronization

V01: Coordinate initial host/overlay preparation and a delayed common start, handle buffering as a real shared state, and avoid repeated disruptive seeks while a player is stalled. Preserve existing player mount stability and supported provider boundaries. Review the historical synchronized TikTok first-start barrier as evidence, not a wholesale rollback target. Test cold first video, buffering/resume, pauses/seeks, consecutive media and real TikTok Studio capture before claiming live playback fixed.

## Package 3 — Commercial launch and local-player evidence

C01: Diagnose installed Commercial Player version, log and Active/Inactive folder contents. Current source reads only top-level MP4s in Sponsors/Active and freezes a playlist snapshot per break; inactive-file playback is not yet reproduced. Fix the confirmed queue Start Sponsor weakness: validate/acknowledge local playlist startup and show the actual failure reason before reporting a successful break. Account for the website timer, local port 43121, legacy player conflicts and Studio receiver. Do not launch a real commercial break during diagnosis.

## Package 4 — Submission, show and archive rules

- R01: Enforce the six-minute track limit at authoritative intake, including known upload/provider durations and honest handling of unknown duration. Make submission rules clear. Verify <=360 seconds, >360 seconds, and unknown/recovery paths; estimates are not proof of duration.
- R02: Automatically title shows `BARCODE Radio [MM-DD-YYYY]` using the correct Pacific show date, e.g. `BARCODE Radio [09-11-2026]`. Account for both server and admin defaults, legacy-default recognition and deliberate custom titles. Do not rename existing archives incidentally.
- R03: Exclude never-played artists and songs from the public Broadcast Archive's played catalog and counts. Preserve full underlying show events and BNL chronology. Define actual-start/partial-play/finished handling explicitly; do not equate mere submission or loading with broadcast playback.

## Package 5 — BNL expression and songwriting

- B01: Put glitch guidance on the prompt path actually used by ordinary packet responses. Use varied corrupted symbols, fragments, redactions and similar readable visual effects; avoid phonetic pretend glitches such as bzzt. Preserve names, quoted evidence and factual clarity. Do not add extra generation calls or reopen shared-brain architecture.
- B02: When no contrary instruction is given, Suno output has (1) Lyrics, at least 1,400 characters, with clear structure labels; (2) Style, a year or short range between 1970 and 2010 and a mixture of two to four genres that normally do not go together. Broaden experimentation beyond an automatic hip-hop default. Explicit lyric tasks must work with generic brevity settings and Discord message splitting. Ground show lyrics in actual show evidence.
- B03: Improve through the existing governed feedback/approved-output mechanisms. Generated lyrics must not become self-validating historical evidence.

**Later separate enhancement, after expression/songwriting:** host approved show songs on the existing site and link reviewed mentions to existing show, artist and track identifiers. Reuse the release/catalog systems; avoid a competing identity or music database. Do not bundle this feature into a repair PR.

## Acceptance and stopping points

Each slice ends at a tested draft PR and updated source-pack checkpoint. Record exact tested source, changes, regressions, remaining risks and post-deploy checks. A merge or deployment is a distinct state and must not be inferred. Move to the next slice using this ledger, retaining unresolved evidence requests. Do not silently change the order or scope of these five packages.
