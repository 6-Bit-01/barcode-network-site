# BNL read-model projection performance — September 23, 2026

## Observed production state

Bot PR #568 restored feed reads by allowing a 15-second socket wait inside its
unchanged 20-second freshness window. After deploying commit `4eca4f8`, two VPS
requests completed in 12.373 and 8.536 seconds for 2,255,090 bytes. The first
show-ledger sync wrote four shows; the second found all four unchanged. Both
reported zero projection errors. Most request time was before response headers.
These measurements do not attribute all delay to a particular server dependency.

## Projection cost and change

A local fixture with four archived shows, 192 tracks, and 976 events reproduced
repeated full-show normalization in per-track sequence and playback lookups.
The same events were cleaned and sorted again for roster, artist, personal-history,
archive, and artist-memory representations. A scaling regression observed 43
normalization calls for one track and 1,265 for 48 tracks over the same event log.

`publicStatsRecordsForSession` now normalizes the existing show log once per call
and groups its events by track. Its internal records share those arrays with the
existing readers. Each new projection still reads current source data; there is
no cache across requests, new store, altered authority, or persisted index.
Malformed/duplicate-event handling, latest event sequence, earliest recorded play,
explicit played-at precedence, and playback-versus-host-finish meanings are retained.
The internal arrays never enter public payloads or source digests.

Across three local Node 24 runs, combined BNL projection and Ballad-show catalog
work fell from about 1.9–2.4 seconds to 0.17–0.30 seconds. Full synthetic public,
private, no-current-access, played-archive, and Ballad-show outputs were compared
byte for byte before and after the change and matched. These are CPU measurements,
not a prediction of production HTTP latency.

## Production timing

The existing read-model route adds a `Server-Timing` header only for a valid BNL
service credential. It contains fixed phase names and milliseconds:

- `queue_snapshot`: existing queue storage/recovery read and normalization;
- `live_queue`: current queue projection, overlay timing, and show-log read;
- `projections`: archive, independent public history, and artist memory;
- `ballads`: public-show selection and published-song reads;
- `render`: remaining content construction and JSON response serialization;
- `total`: time inside the request handler, excluding cold initialization and transit.

Existing authenticated `no-store` and `Vary: x-api-key` behavior remains. Anonymous
and invalid-key responses receive no timings. No source contents, identifiers,
credentials, or error messages are included. Request ordering is unchanged.

## Verification and deployment

Focused regressions cover bounded normalization work, event lookup semantics,
source corrections between reads, privacy, independent public history, single-store
reads, and authenticated timing on successful and unavailable responses. Run
`npm ci`, `npm run check`, and `npm run build` before publishing.

Deploy through the normal website PR/Vercel path. No VPS restart, bot change,
environment change, migration, or data cleanup is required. After deployment,
capture authenticated response timing headers from the VPS and confirm the next
two normal feed/show-ledger syncs. Use those measurements to distinguish remaining
storage, overlay, projection, or published-song latency before another optimization.
Reverting the code and redeploying requires no data rollback.

Untouched: queue mutation and payment behavior, publication/production gates,
read-model JSON schema, source digests, BNL memory policy, Journal, Relay,
submission UX, and the earlier one-queue-read-per-request correction.
