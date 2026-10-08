# HellcatNZ contest standings

Hellcat's read-only KOTH ladder appears on its own `/contests` page, linked from desktop/mobile navigation, the Footer and the sitemap. It does not appear on Radio. HellcatNZ remains the source of the ranks and official 0–100 scores. The website does not calculate results or connect these entries to BARCODE queue tracks, Archive history, BNL memory, dossiers or identities. The Contests page can host future community contests without making them part of BARCODE Radio.

The page also presents the community information supplied by the owner: weekly KOTH contests every Sunday at **2:45 PM NZST (UTC+12)**, with submissions played on community radio and reviewed by `@reviewcrew`, live feedback and a winner shout-out, daily Community Radio, weekly Artist Features, and rotating Song Creation Challenges. Numbered panels use BARCODE's existing dark palette and green terminal-style accents. The explicit **Join HellcatNZ's Discord** link points to the supplied `https://discord.gg/HellcatNZ` invite; it does not join a server automatically. The contest and these activities remain attributed to HellcatNZ.

The KOTH schedule preserves the owner's explicit NZST offset year-round: Sunday 02:45 UTC. It does not silently reinterpret NZST as seasonal New Zealand daylight time. `HellcatSchedule` follows the existing local-schedule hydration and minute-clock pattern: the canonical time is present in server-rendered HTML, and the next occurrence is converted with the visitor's browser locale/timezone only after hydration. The local label includes its date, weekday and timezone and uses the offset in effect on that occurrence, including the visitor's daylight-saving changes. A local minute timer refreshes the next occurrence without any network request. A scheduled start does not establish live status or change the ladder feed.

The community descriptions also use BARCODE's signal, frequency and circuit language, while preserving HellcatNZ's activities, review-crew attribution, winner shout-out and low-pressure community tone. This is editorial framing, not an additional contest rule or a claim that Hellcat's daily radio is BARCODE Radio.

The shared desktop/mobile main menu places Database immediately after Releases: BNL-01 Hub → Contests → Releases → Database.

## Configuration and rollout

Set these **server-only** environment variables in the intended Vercel environment:

| Variable | Value |
| --- | --- |
| `HELLCAT_LADDER_URL` | Hellcat's current full HTTPS URL ending in `/ladder` |
| `HELLCAT_LADDER_TOKEN` | The bearer token, without the `Bearer ` prefix |

Do not prefix either variable with `NEXT_PUBLIC_`. Enter the token through the deployment platform's secret environment settings, never in GitHub, browser JavaScript, screenshots or PR comments. The owner has the token; no real credential is included or required for fixture tests.

The initial URL supplied on September 23, 2026 was `https://salaries-painted-repair-trust.trycloudflare.com/ladder`. This is an operator-provided endpoint, not a permanent discovery URL. Hellcat said it can change after a radio-server restart; the token remains the same. Update `HELLCAT_LADDER_URL` and redeploy when he supplies a replacement. Only HTTPS and the exact `/ladder` path are accepted; URL credentials, query strings and fragments are rejected.

1. Review this scoped PR and its fixture checks.
2. Configure the two variables for this branch's preview, then redeploy the preview. No queue, BNL, Redis, Blob, cron or payment configuration is needed.
3. Confirm the anonymous public endpoint `/api/hellcat/ladder` returns the expected official rank order and scores. Check null labels, null scores, zero scores and an empty ladder against the real response if present. Do not publish the raw upstream response or token.
4. Review `/contests` and its navigation link on desktop and phone widths, including the global live/submissions badge. The table has its own scroll region for long ladders. All supplied rows are retained.
5. Confirm the browser contacts only the site's public endpoint and sees only rank, title, artist, score, retrieval time and freshness metadata. Check client bundles for the credential value without printing it.
6. After owner merge/activation approval, set the same server variables in Production, merge and verify the production endpoint and page. A redeploy is required for environment changes. Preview success is not production evidence.

Implementation, merge and live configuration remain separate steps. Until configured, the section reports that standings are temporarily unavailable; it never displays fixture songs or treats a failed connection as an empty ladder. Roll back the connection by removing its variables and redeploying. Revert the PR if the section itself should be removed.

## Read and cache contract

- The server sends `GET` with `Authorization: Bearer <token>` and `Accept: application/json`. Browsers never receive or forward that token. Visitor headers and query parameters cannot choose credentials or an upstream URL.
- The upstream request refuses redirects, times out after eight seconds and reads at most 512 KiB. The parser accepts at most 1,000 tracks and 1,000 characters per title/artist. Oversized or malformed results fail as a whole; there is no silently truncated or renumbered ranking.
- The first rank must be 1; subsequent ranks must be positive safe integers in increasing order. Gaps are preserved. Title and artist are strings or null; score is a finite number from 0 through 100 or null. Scores are never used to sort. Unknown response fields are discarded. API errors, including a 200 response containing `error`, are unavailable results.
- Only the sanitized snapshot (or a failed-read `null`) enters Next's Data Cache. Revalidation is three minutes and traffic-driven, not a scheduled job. A hash of the configured URL and token partitions cache entries; neither raw value is a cache argument/key or public metadata. Changing either value selects a new entry.
- Concurrent cold requests and background refreshes share one upstream request per server instance. The Data Cache persists across requests; the in-process map only coalesces reads. Different cold instances may each make an initial request.
- Next may serve a previous snapshot while refreshing it. Responses at least three minutes old are explicitly marked stale; at ten minutes the server withholds all rows even if the framework still retains them. When an expired snapshot or cached outage has a refresh already in flight, the request waits for that bounded refresh so the first visitor can recover immediately. A failed refresh replaces the cached snapshot with unavailable. Both success and failure are briefly cached to avoid per-view upstream requests.
- The public endpoint returns only `status`, `snapshot` (tracks and `fetchedAt`) and, when available, server-calculated `ageMs`. Its response is `Cache-Control: no-store`, so a CDN/browser cannot extend the snapshot's lifetime. Unavailable results use HTTP 503 and `snapshot: null`; a valid empty ladder is HTTP 200 with `tracks: []`.
- The page uses the existing visibility-aware polling helper at a three-minute cadence. It cancels on unmount, bounds browser requests to twelve seconds, clears failed reads and ages displayed results using server age rather than the visitor's wall clock. A loaded tab marks old standings as refresh-pending and removes them at the age limit.
- The server logs only fixed failure reason codes and, when relevant, a numeric upstream HTTP status under `[hellcat-ladder]`. It never logs original errors, response bodies, endpoint values or credentials. These diagnostics stay in private runtime logs; public responses deliberately do not distinguish auth failure from other upstream failures. Cached failed reads do not emit another upstream warning until a fresh request is attempted.

## Diagnosing a configured preview

Open `/contests` on the intended branch preview and inspect that deployment's runtime logs for `/api/hellcat/ladder`, searching for `[hellcat-ladder]`. An upstream failure can be cached for three minutes, so an immediate repeat may not produce a new warning. Use logs from the deployed request; an unauthenticated probe from a different environment does not establish why Vercel's authenticated request failed.

| Private reason code | What it establishes / next check |
| --- | --- |
| `configuration_missing` | At least one variable is absent or blank in this deployment. Check Preview/branch scope and redeploy after saving. |
| `configuration_invalid` | Both values exist but fail validation. Check the exact HTTPS `/ladder` URL and a raw token without `Bearer `, quotes or internal whitespace. |
| `upstream_unauthorized` | HTTP 401/403 or Hellcat's `unauthorized` JSON response. Recheck the saved token through the platform's private settings. |
| `upstream_http_error` | The deployed server received another non-success HTTP status. The log includes its number; a 502 here is evidence from Vercel's request. |
| `upstream_timeout` / `upstream_network_error` | The request timed out or failed in transport. Verify the current tunnel URL and server availability with Hellcat; a network error alone does not identify which side failed. |
| `upstream_empty_response` / `upstream_invalid_json` / `upstream_invalid_tracks` / `upstream_body_too_large` | The response did not meet the bounded JSON ladder contract. Inspect it only in the protected operator environment. |
| `cache_error` | The site's cache operation failed. Investigate the deployment runtime. |

The token setting contains only the raw token because the server adds `Bearer ` when constructing the `Authorization` header. Never share token values or raw upstream bodies to diagnose a failure; the reason code and numeric status are sufficient for the first check.

## Verification and remaining evidence

`tests/hellcat-ladder.test.mjs` covers the data projection, official ordering, nullable values, malformed/auth/error/oversized responses, credential and redirect boundaries, cache partitioning and reuse, concurrent reads, age limits, public route behavior, table escaping and browser lifecycle.

Required repository gates are `npm ci`, `npm run check` and `npm run build`. The actual bearer-authenticated Hellcat connection and final placement acceptance require the configured preview. Fixture success alone does not establish live availability or validate the temporary tunnel URL.

## Community radio now playing

The October 6, 2026 `NOW_PLAYING_FOR_WEBSITE.md` contract and Hellcat's screenshot
add an on-air window to this same ladder. The matching song gets a green dot,
a subtle row highlight and a speaker toggle beside its title/artist. All other
rows retain their usual standings with no audio-unavailable label. There is
one persistent, initially paused `<audio preload="none">` for the entire table;
the page neither rebroadcasts nor downloads individual songs.

### Receiver and existing configuration

Hellcat's radio bot sends **POST `/api/now-playing`** on this site's HTTPS host,
with `Authorization: Bearer <existing HELLCAT_LADDER_TOKEN>` and
`Content-Type: application/json`. James can keep the default `NOW_PLAYING_PATH`.
There is no additional listener credential or stream setting to enter: the
public HTTPS MP3 `stream_url` arrives in each valid live payload. The document's
`radio.example.com` is an example, not the actual station address.

| Payload field | Accepted / displayed behavior |
| --- | --- |
| `live` | Boolean. Only `true` represents a fallback ladder track on air. |
| `track_id` | Bounded, nonempty string for a live update. Stored as supplied; it does not create a BARCODE identity. |
| `title`, `artist` | Strings up to 1,000 characters or null; trim and normalize empty strings to null. |
| `started_at` | Valid timestamp with timezone for live updates. Track-start metadata only; never used for heartbeat freshness. |
| `stream_url` | Public HTTPS hostname, at most 2,048 characters, without URL credentials, query parameters or fragment. Local/IP addresses and non-HTTPS schemes are rejected. |
| Unknown fields | Discarded, including sender-supplied receive times, Discord IDs and file paths. |

`live:false` accepts an idle/manual/startup/shutdown update and clears all track
and stream metadata before storage. Unauthorized requests return **401 before
reading the body**. Invalid updates return 400, oversized bodies 413, incorrect
media types 415 and a stalled upload 408. JSON reads are bounded to 16 KiB and
three seconds. An accepted update returns `{"ok":true}` only after shared
persistence succeeds; missing storage/configuration or write failure returns
503. Responses never echo the token or raw request body.

The feature reuses the site's existing shared
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` configuration. Each
heartbeat writes one ephemeral, sanitized snapshot with a 90-second Redis TTL
and the server's own receive timestamp. There is no in-process-only fallback,
cron, upstream radio-server poll, event archive or second ladder store. Keys
are isolated by credential, shared Redis URL, deployment environment and
branch/deployment hostname, so a preview cannot update Production's indicator.
Changing the ladder token immediately stops authenticating the old token and
selects an empty radio scope until a fresh authorized update arrives.

Anonymous **GET `/api/now-playing`** returns `{live:false}` or the sanitized live
payload with server-calculated `ageMs`. It never reveals receive-clock records,
storage keys or credentials, and sends `Cache-Control: no-store`. Next's
server Data Cache shares reads for five seconds; an accepted POST expires that
radio scope's cache immediately. Receive age is recomputed outside the cache
on every request, so even a framework-held snapshot cannot extend the
90-second on-air window. Storage/read failures fail closed to `{live:false}`.
Private diagnostics contain only fixed reason codes under
`[hellcat-now-playing]`.

### Row matching and listener lifecycle

The existing `/ladder` projection remains exactly `rank`, `title`, `artist`,
`score`, with its original ranking and refresh cadence. Match title and artist
after trimming and case-insensitive comparison. Both labels must be present;
two identical title/artist rows both receive the dot, as Hellcat's contract
describes. The matcher already honors `track_id` if both sides have one and
refuses a name fallback when their IDs differ; this change does not add IDs
to the upstream ladder contract.

The visible page checks its own public now-playing endpoint every ten seconds.
Hidden non-listening tabs pause those checks; opted-in listeners keep checking
in the background so a tab switch does not falsely age out their stream. A
separate local expiry timer uses server age minus conservative request elapsed
time, not the visitor's wall clock or `started_at`. Failed reads, idle state,
expiry or an unavailable/unmatched ladder pause playback and hide live-row
controls. Unmount cancels requests/timers/listeners and releases the audio.

Clicking Listen starts the stream; Pause withdraws listening intent. A new
ladder song on the same stream URL keeps the same element playing, with no
reload. Idle/manual/stale state pauses audio while retaining a prior opt-in;
the next eligible live track attempts to resume. If the browser blocks play,
the live row again offers Listen and a short instruction. A stream error also
offers retry. Waiting/stalled playback can recover through the existing stream
without a forced reload. Late play promises cannot restore an inactive stream
or update an unmounted component.

Hellcat reports Icecast capacity of approximately 30 simultaneous listeners.
Capacity refusals use the same honest stream-unavailable/retry state. Tests do
not establish the actual listener limit, station uptime or stream audio.

### Deployment and focused evidence

After this scoped PR is merged, the normal website deployment is Vercel's
automatic build from `main`; **do not run the BNL VPS deployment commands**.
Use the Vercel deployment associated with the verified merge SHA. This change
requires no BNL, native queue, overlay, payment, moderation, cron, Radio Mode or
future community-fusion configuration.

1. Confirm the intended deployment has the existing ladder token and shared
   Redis settings. Redeploy only if an authorized environment change is needed.
2. Give James the intended HTTPS host and `/api/now-playing` path. He points the
   sender at that host using his existing ladder token. A protected preview
   must also be reachable by his sender; it must not silently target Production
   for a preview test.
3. Verify an authorized real heartbeat returns 200. Anonymous/wrong-token POSTs
   must return 401. Inspect only fixed diagnostic codes when a write fails.
4. With a fallback ladder track on air, verify one matching green dot, its
   accessible Listen/Pause toggle and audible stream on desktop and phone.
   Check that the browser's GET and stream URL carry no ladder token.
5. Leave playback on through the next fallback song: the control/dot should
   move, without another `audio.src` assignment or `load()` for an unchanged
   stream URL. Pause should remain paused across later heartbeats.
6. Check a real manual request or stop produces `live:false`, removes all dots
   and buttons, and pauses playback. Check the next fallback resumes only for
   an already opted-in listener, or presents Listen if the browser blocks it.
7. In an authorized isolated sender test, cease updates for at least 90 seconds
   and verify the browser clears the dot and pauses, including with a pending
   network request. Restart updates and verify clean recovery. Check a hidden
   listening tab continues tracking the sender.

`tests/hellcat-now-playing.test.mjs` covers authentication-before-body-read,
bounded validation, sanitization, cross-instance persistence, cache invalidation,
deployment/credential isolation, receive-time expiry, row matching, single
stream playback, opt-in/resume/error handling and browser lifecycle. The
existing ladder tests remain authoritative for ranking and schedule behavior.
Real sender wiring and audible Icecast behavior require the deployed station;
fixture tests are not that evidence.

Roll back by reverting this scoped PR through the usual website PR/Vercel
deployment path. The unchanged ladder continues working, and abandoned radio
snapshots expire on their own within 90 seconds. Do not remove or rotate the
shared ladder credential merely to disable this feature.
