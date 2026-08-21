# BARCODE queue production capability

`BARCODE_QUEUE_PRODUCTION_ENABLED` is the server-only capability for native BARCODE Radio participation and the outer boundary for queue-derived public/BNL signals. It is necessary but no longer sufficient for BNL queue projection: each queue session also carries explicit purpose and BNL-publication provenance.

## Default-off behavior

The capability is disabled unless the environment variable value is exactly `true`. Unset, empty, `TRUE`, `1`, `yes`, or any other value is treated as disabled.

While disabled, queue sessions and tracks do not affect global live status, public queue CTAs derived from live status, public show mode, BNL read-model queue projections, queue-derived artists, queue-derived operator lanes, dossier recommendations, Source File evidence, public authoring suggestions, or memory-like evidence. No session-level approval can bypass this outer capability.

Operational Radio submission surfaces also remain on the established Auxchord route while disabled. This includes the Radio page, Footer resource and description, Terminal `RADIO` response, and the BARCODE Radio sentence in BNL's public source context. Historical Auxchord database records and dossiers are canon records, not operational routing, and are unchanged by the capability.

## Authorized testing that remains available

Queue testing and admin workflows may continue in their existing authorized surfaces. The gate only blocks promotion of queue data into public/BNL truth surfaces. It does not change queue mechanics, playback, submissions, provider integrations, admin controls, uploads, priority lanes, scheduling, simulations, payments, or routes.

Foreground, Radio Visuals, and Wheel browser sources read private rehearsal state only through permanent, overlay-only capability links issued from authenticated Admin → Live Overlay Receiver → One-Time TikTok Studio Source Setup. The capability cannot authenticate admin APIs, has no show-by-show expiry, and remains stable until `JWT_SECRET` or its configured fallback signing secret is deliberately rotated. The access value stays in the URL fragment and is forwarded only as a Bearer header by the receiver. Bare `/overlay/*` routes do not receive private state. Each generated source URL also carries the stable `?studioSource=v1` query so TikTok Studio performs a full one-time browser-source navigation when replacing the older hash-only links instead of retaining an expired renderer and transform.

The separate Radio Visuals browser source uses the private generated `/overlay/radio-visuals?studioSource=v1#access=…` link. It reuses the queue, live-scene, and player-sync owners and exposes only a display-safe visual projection: show stage, broadcast phase, aggregate queue counts, visible Wheel candidate count, scene mode, anonymous short-lived show-event facts, deterministic visual seeds, active short-lived visual cue, and fresh play/pause/timeline state. Event facts contain only a type, occurrence/expiry time, and one-way numeric composition seed; they never contain artist or track copy, session identifiers, queue-entry identifiers, source or upload URLs, handles, contact fields, notes, legal records, payment fields, checkout state, or player provider IDs. The receiver renders only chroma-keyed effects over `#FF5A00`; there are no readable labels, counters, icons, or foreground UI, while nonsemantic terminal and Matrix-style glyph textures remain permitted visual material. Its browser-source resolution remains intentionally `1080×1080`, matching the square viewport TikTok Studio restores for saved Link sources. Inside that reliable square source, all effects are clipped to a centered `810×1080` (3:4) portrait-safe stage with `135px` keyed side gutters, so the source can fill the taller upper-show placement without losing particles, flashes, lightning, or the Wheel vortex off either side. It keeps a low-frequency standby poll so a browser source already placed in TikTok Studio can detect a new show without a new URL, then switches to the live polling interval while that show is active.

The visual director treats show state as naturally blended layers rather than hard scene swaps. Intake, queue, track, Wheel, sponsor, pressure, final, complete, and system states each gain a distinct procedural signature; intake uses the full portrait canvas because the performer is not visible during submissions. Camera-visible phases feather ordinary effects away from the performer field while preserving active edge detail. Opening a queue session exposes the pre-show source; the authoritative transition into `broadcast_active` emits the show-start event, with an intake-to-live edge retained only for legacy snapshots that carry no broadcast phase. That event renders an unmistakable split-edge/top/bottom ignition outside ordinary performer attenuation while keeping the central performer corridor clear. The enlarged Wheel vortex remains a hollow outer band with faint interior light so names remain readable. Every visible candidate count renders: small Wheels use a thin broken name-safe rim, and larger Wheels use progressively denser bounded outer rings, arcs, and fragments with no candidate-count cutoff. Ready, spinning, re-encrypting, result, and confirmed states use different densities, dash rhythms, direction, and release seals, while integrated phase changes velocity continuously without angular jumps. Track start/skip, Priority sent/confirmed, Wheel gained/launch/spin, sponsor and intake changes, show completion, and stage shifts keep their bounded accents; authoritative timestamped events take precedence, while the permanent receiver infers only missing display-safe state edges. Automatic state-edge events and manual-cue nonces select deterministic but varied compositions, and palette, state, cue, event, and music-response envelopes ease independently to avoid abrupt cuts.

The Level 1 music-response path uses the authoritative player clock when available. Each track occurrence selects one of ten deterministic visual families—edge spectrum, oscilloscope ribbons, tape feedback, Matrix rain, ASCII terminal, pixel-sort storm, lightning switchyard, laser lattice, particle pressure, and signal constellation—plus a repeatable rhythm personality. Waveform and meter geometry remain confined to their two music families; the other eight retain distinct motion languages and silhouettes. Every family assigns bass, mids, and treble different structural roles. Broadband body supplies visible mass without flattening the bands, short-lived band onsets create transient hits, and four-bar phrase position plus track progress—or a deterministic multi-minute fallback anchored to the current track occurrence when duration is unavailable—add and release geometry through fast-attack, gradual-release build memory. Scenes therefore change counts, topology, depth, density, and secondary layers rather than only opacity or speed. The common between-song transmission bed recedes as track activity rises so its bars and tracking lines do not make the ten families look alike, while each selected scene takes over at a stronger floor. External players with no usable playback or audio signal automatically receive that synthetic response, with no host prompt or control. The private same-origin MP3/WAV player may additionally publish bounded aggregate energy and band values through its existing 1 Hz player-sync heartbeat. The public visual projection still receives no samples, media URL, track identity, or source identifier, adds no Redis polling path, and cannot mutate queue, Wheel, skip, Priority, payment, or playback state.

The optional BARCODE Audio Bridge adds direct show-computer response without changing that server contract. It is a current-user Windows tray helper that captures only the default Speakers render endpoint through WASAPI loopback, reduces that signal locally to bounded energy, bass, mid, treble, peak, beat, tempo, and confidence values, and serves those values only from `127.0.0.1:43120`. The permanent Show Visuals Link polls that loopback endpoint automatically while an active queue session exists; the helper starts Speakers capture on those requests and stops it a few seconds after they stop. Chrome and Windows Media Player therefore drive the visuals when they play through the default Speakers device, while the separately sourced microphone is excluded unless Windows itself is deliberately configured to monitor it into Speakers. No audio samples or analysis frames are uploaded, and the bridge creates no Redis or Vercel traffic. Missing, blocked, restarting, or silent bridge data immediately leaves the six-profile synthetic response in control, with no operator capture button.

The private generated `/overlay/wheel?studioSource=v1#access=…` link is the permanent `1080×1080` square Live Overlay + Wheel source. It replaces the formerly shared live-overlay window while retaining the existing live scene resolver, player sync, Wheel candidate order, winner, animation phases, and audio files. Opening a queue session exposes the pre-show live scene immediately; `Start Broadcast` changes show state without waking a previously hidden source. Launching the Wheel makes the existing ceremony take over the source with audio, and completing the ceremony returns to the live scene. Ending or archiving the session returns the source entirely to `#FF5A00` so it keys out. The receiver polls every 15 seconds without a current session, every 2 seconds while a current session is waiting or broadcasting, and every second while the Wheel is visible. TikTok Studio must keep that saved source active with sound enabled. No alternate state owner, ceremony-only gate, or fallback display path is used.

Foreground, Radio Visuals, and Live Overlay + Wheel are all intentionally native `1080×1080` Link pages. This accepts TikTok Studio's restored square browser viewport as the source contract instead of relying on custom non-square dimensions that TikTok does not persist. The Foreground strip sits near the bottom of its keyed square so the square source can be positioned once with only the strip visible; Show Visuals uses its keyed 3:4 internal safe stage; the calibration canvas remains `1080×1920` for full-scene placement reference only.

All `/overlay/*` pages bypass the animated public-site shell and the global live/BNL pollers. This keeps fixed-position browser sources bound to their isolated square surface, prevents public-site and preview UI from leaking into the keyed surface, and avoids unrelated polling in permanent Studio sources.

## Blocked from public and BNL consumption

When disabled, the global live-status provider does not poll `/api/queue`, cached queue snapshots are cleared, and `/api/bnl/read-model` returns an explicit unavailable queue contract with `capabilities.queueProduction=false` instead of live sessions, queue tracks, now-playing, up-next, queue counts, queue-derived artists, recap candidates, queue-derived copy candidates, or queue-derived dossier suggestions. Queue-lane recommendation ingest such as `queue_context` is rejected before it can create approved BNL/Source File evidence.

Manual and scheduled TikTok live status remains independent. A legitimate manual or scheduled live state may still produce broadcast-live public show mode.

## Native submission presentation

When the capability is enabled, one server-side presentation contract moves the operational Radio submission surfaces to `/queue`, changes the link from external to internal, and uses native-queue wording. The contract does not expose the environment variable to client code and does not change queue/session storage, ordering, Wheel or Priority behavior, playback, payment handling, uploads, provider resolution, or BNL write authority.

The native form accepts supported SoundCloud, Spotify, YouTube, and TikTok links plus direct MP3/WAV uploads. New Apple Music queue submissions are rejected because BARCODE Radio cannot reliably access the full track; release, catalog, dossier, historical, and archived Apple Music links elsewhere remain unaffected. Amazon Music, Suno, and Bandcamp continue through the form's existing external-link path.

## Atomic acceptance and 44-slot contract

The default session capacity is 44 accepted show slots. The accepted count is the unique set of non-simulation tracks in queued/playing, Next In Line, loaded/Now Playing, and completed/played state. Removed tracks, simulation tracks, rejected duplicates, rejected limit/cooldown attempts, and submissions that did not persist are excluded. Playing or finishing a track does not free its show slot; removing one does.

Capacity closure is distinct from a manual close, ended broadcast, or archive. Reaching capacity closes intake with `submissionClosureReason=capacity` while the active session remains open for show operations. Removing a counted track reopens only a capacity-closed session. A manually closed, ended, or archived session stays closed after removal. Public status and admin/session summaries expose both `activeCount` for current queue depth and `acceptedCount` for capacity, plus the closure reason.

Capacity governs admission, not upgrades: reaching 44 blocks a 45th song but does not block an eligible accepted track from starting or completing Priority Signal checkout. Manual closure, broadcast end, archive, and ordinary Priority eligibility rules still block checkout.

Every persisted queue change—submission, admin action, session/settings update, upload cleanup metadata, Priority checkout/payment transition, and legacy queue helper—uses the same serialized mutation boundary. Redis-backed mutations acquire a bounded lease and commit the complete state with a fencing token and monotonic revision; in-process mutations use the same contract. Provider metadata lookup happens before admission enters the critical section, then the current session, capacity, duplicate identity, artist limit, and cooldown are re-read and revalidated inside it. Concurrent workers therefore cannot both claim the final slot or overwrite one another.

Public and admin snapshot reads are non-persistent: polling may derive the current display state, but it does not write the queue or advance its revision. Apple Music host rejection, including terminal-dot host variants such as `music.apple.com.`, occurs before any queue snapshot read.

## Rolling show timing contract

The submission window is outside the show clock. `Start Broadcast` records `broadcastStartedAt`; from that moment the shared timing owner combines elapsed show time with the actual remaining queue workload. The target is five hours and the six-hour boundary is an operational redline only: it raises pressure but never stops playback or ends the session.

Unknown tracks reserve 5:00 until an exact detected/provider/upload duration replaces that estimate. Target host setup plus reaction/transition time is 1:00 per remaining track (`0:30` before and `0:30` after); the pressure model also tests the remaining workload at a 2:00-per-track planning allowance. It reserves 12:00 for the commercial until completion while leaving the existing 10:30 commercial countdown unchanged, and adds 2:00 only for each Wheel spin currently owed. No hypothetical or fixed-count Wheel reserve exists.

The current projection uses observed broadcast pace after subtracting known music playback, the commercial, and resolved Wheel ceremonies. Queue submissions, exact duration locks, Finish/Skip/Remove outcomes, Wheel obligations, commercial state, player progress, and live talk/transition drift all recalculate the same snapshot. Admin pressure, public projected timing/waits, and existing timing-driven public motion use that owner; capacity pressure is not substituted for show-time pressure.

The permanent admin/public layout is unchanged. The only new presentation is one transient admin-only time-bank popup for material changes. It lasts 4.8 seconds, never replays on initial load or across session changes, combines rapid changes into one popup, and has no persistent history or dashboard control.

## Playback lifecycle and diagnostics

Loading a track, media readiness, playback start/resume, pause, stall, seek, natural end, media error, and the operator's final outcome are distinct events. A browser/player `ended`, `stalled`, or `error` event never advances the queue by itself. The loaded track stays in place until the operator explicitly chooses one of these outcomes:

- **Finish** records a completed/played track. A natural media end or near-EOF finish is retained as such; a materially early finish is identified as an early cutoff when reliable position and duration evidence exist.
- **Skip** records a completed/played early cutoff and advances lane routing like Finish.
- **Remove** records a removal, does not count as completed, does not consume the owed non-priority turn, and frees an accepted show slot.
- **Undo Load** returns the track without recording a completed or removed outcome.

Uploaded MP3/WAV playback is admin-authenticated and private. The delivery route accepts only one syntactically valid byte range, preserves correct `206`/`Content-Range` behavior for seeking and near-EOF reads, sends private no-store/nosniff headers, and fails closed on malformed ranges or invalid partial responses. Interrupted, malformed, unavailable, or provider-error playback remains an operator-visible error rather than an automatic Finish or Skip.

Playback lifecycle history is bounded per queue session and uses the existing serialized queue mutation owner. The admin diagnostic export is built from an explicit safe projection: it can include queue/session identifiers, submitted artist/title, media category, durations, lifecycle events, and explicit outcomes, but excludes raw source/upload URLs, contact fields, legal acceptance text, admin notes, payment state/identifiers, and private storage locations. Playback diagnostics are not part of the public queue snapshot or BNL queue projection.

## Gifted Priority attribution

When a viewer starts Priority Signal checkout for somebody else’s track, the queue modal offers one prominent optional public-name field. Blank means `Anonymous`; Stripe customer, billing, email, or payment identity is never used as a substitute. The server sanitizes and versions the chosen supporter name, snapshots the recipient artist, binds both values to the created Stripe checkout, and preserves the first confirmed attribution across webhook retries.

Resuming a pending checkout requires the opaque browser capability that initiated that exact session. Other viewers cannot receive the stored Stripe URL or pay through a checkout carrying somebody else’s gift attribution while that checkout is pending.

Gift attribution remains admin-only while checkout is pending. After the verified webhook confirms payment, the existing public track projection exposes only the safe `from`/`for` display values. Queue cards, Now Playing/Next In Line, and host player surfaces use that same stored attribution. Manual Priority moves and ordinary self-upgrades do not create gift attribution.

The foreground owner may replace its action row with the confirmed `from`/`for` thank-you for exactly three seconds using absolute server timestamps. It then resumes the live action rail; polling, refresh, and reconnect cannot restart the full interval. The safe public attribution is not added to the BNL queue projection, memory, dossiers, payment read models, or any new publication path.

## Session provenance and BNL publication

Native queue visibility, payment, playback, and operator controls remain independent from BNL publication. Every session has:

- `purpose`: `rehearsal`, `live_broadcast`, `simulation`, `internal_test`, or the normalized safe legacy value `unknown`;
- `bnlPublicationStatus`: `private`, `runtime_only`, `recap_approved`, or `public_copy_approved`;
- `provenanceRevision`: `0` for normalized legacy state, `1` at explicit session creation, then incremented by each explicit admin change;
- `provenanceUpdatedAt`: the timestamp of the latest explicit admin provenance action, or `null` for legacy/unknown state.

New sessions default to `rehearsal` + `private`. Stored sessions without provenance normalize to `unknown` + `private`. Rehearsal, simulation, internal-test, and unknown sessions are quarantined from every queue-derived BNL lane regardless of native queue visibility or any malformed stored publication value.

Only `live_broadcast` sessions can use the publication levels:

| BNL publication status | Sanitized runtime context | Completed recap candidates | Generic queue public-copy candidates |
| --- | --- | --- | --- |
| `private` | No | No | No |
| `runtime_only` | Yes | No | No |
| `recap_approved` | Yes | Yes | No |
| `public_copy_approved` | Yes | Yes | Yes |

Broadcast Memory and dossier-seed lanes remain empty and independently controlled at every level. Session approval never enables bot memory, bot queue observation, Source File creation, dossier publication, payment identity, Discord identity linking, queue mutation, or any bot/public gate. Public dossier summaries in the read model remain an independent website source and are not evidence that an unpublished queue session was projected.

Admin Show Management records the purpose and BNL publication level at creation and permits an explicit later change, including for an archive. Reading or archiving a session does not upgrade it. Existing rehearsal rows are not silently approved or rewritten into broadcast provenance.

## Vercel rollout procedure

1. Leave production disabled until the owner explicitly declares the queue ready for production use.
2. In Vercel, add `BARCODE_QUEUE_PRODUCTION_ENABLED` to the intended environment only.
3. Set the value to exactly `true` when the owner approves production queue signals.
4. Redeploy the site so server-only code reads the new environment value.
5. Confirm `/api/admin/live` and `/api/bnl/read-model` report `capabilities.queueProduction=true`.
6. Confirm a rehearsal/private session reports queue projection unavailable with no queue-derived artist, runtime, recap, or public-copy lane items while `/queue` remains usable.
7. If the owner explicitly approves a live-broadcast publication level, confirm `/api/bnl/read-model` exposes only the mapped sanitized lanes.
8. Confirm `/radio`, the Footer, and Terminal `RADIO` route submission to `/queue` as internal links.
9. Confirm `/queue` shows an honest closed/waiting state when no session is open and the active session when one is open.
10. Keep the bot's separate queue-production gate disabled until the site cutover is verified and the owner explicitly approves sanitized bot context.

## Rollback

Unset `BARCODE_QUEUE_PRODUCTION_ENABLED` or set it to anything other than exact `true`, then redeploy. The default-off behavior resumes, operational submission links return to Auxchord, and queue testing data is quarantined from public and BNL signals. The bot's separate queue-production gate must remain disabled during rollback.
