# Coordinate video starts after the playback recovery

The owner confirmed that #429 restored visible YouTube and Short playback, then
clarified that the host still began playing while the Studio overlay caught up.
Initial playback success does not pass synchronized startup/resume. C3 transport
acceptance remains open; preserve all previously passed queue/Wheel tests.

## Cause and repair

#429 deliberately removed the client start gates while recovering the working
provider mount/transport. The remaining host callbacks therefore published
`playing` only after the host had started. The older #424 delay also had no
receiver readiness acknowledgement: waiting three seconds alone could not tell
whether a cold overlay had loaded media.

Keep the recovered mounts and ordinary drift correction. On a deliberate native
Play or resume, hold the host muted and paused at its observed position. Publish
a paused preparation token in the existing transient player-sync packet. The
Studio receiver warms that video muted, waits for actual provider playing and
paused events, then acknowledges that token. An API-ready/cued event alone is
insufficient. Only after that acknowledgement does the host request the existing
server-stamped start three seconds ahead. Both clients use the server clock;
media time does not advance through the preparation window.

The host shows preparation/ready status and Cancel start. A missing overlay or
failed response leaves the host held with a visible retry message. Timers retain
their browser receiver, repeated snapshots cannot re-arm a start, and cancellation
invalidates delayed callbacks and serializes a paused write after a late start
response. Replaced players invalidate their callbacks and queued writes. Normal
host sync writes share a serialized transport across provider remounts. TikTok's
old delayed play callbacks also check the current state/token before playing.

## Storage and authority

There is one additional transient readiness key with a 30-second TTL, not another
queue or playback service. The Studio bearer capability can acknowledge only the
current paused preparation token; it cannot select tracks or schedule playback.
Admin authentication remains required for readiness checks and start scheduling.
Readiness checks use one Redis GET at most once a second, for up to 15 seconds
(16 checks), then stop; each request also has a five-second timeout. An overlay
acknowledgement uses one GET and one SET, with at most two attempts per receiver.
The scheduled write checks the matching receipt once before its existing SET.
There are no queue snapshot reads on these paths. Ordinary one-second heartbeats
still use one SET, and existing receiver polling intervals are unchanged.

## Validation and acceptance

Final local verification: `npm ci`, `npm run check` (1,144 tests passed,
zero errors, 36 existing lint warnings), `npm run build`, and
`git diff --check` passed.

Production host/receiver callback tests cover YouTube and TikTok readiness,
held starts, provider origin/frame checks, repeated snapshots, timers, cancellation,
late replies, replacement, timeout, token normalization, and API authorization.
Storage tests use fake Redis and fail on queue reads/mutations. No production
Redis traffic is used by these checks. Provider methods/states were checked
against [YouTube's IFrame API](https://developers.google.com/youtube/iframe_api_reference)
and [TikTok's Embed Player API](https://developers.tiktok.com/docs/en/embed-player).

Local fake-provider tests establish orchestration, not identical decoding latency
in separate browsers. TikTok Studio acceptance remains required. A provider stall
or loss of connectivity after readiness can still delay a receiver; ordinary
transport correction remains available. This patch does not claim frame-accurate
synchronization or coordinated buffering recovery.

After the usual PR merge and Vercel deployment, refresh one host and its existing
Studio source together. Resume the current rehearsal without resetting data.
Test the current loaded video: Play once, confirm the host holds during preparation,
then confirm visible video and host audio start together; Pause and resume once.
Test Cancel start once: it must remain stopped. Check one YouTube/Short and one
TikTok start/resume before marking coordinated startup passed. The full commercial,
BNL, and final private archive checks remain pending.

Queue entries, Wheel/priority/counts/credits, commercials, privacy, archives,
BNL/bot/VPS, the corrected live clock, and persisted rehearsal data are unchanged.
No environment changes, helper update, or database migration are required.
