# BARCODE Radio measured live-read pass — 2026-08-21

> Historical measurement note: the figures below describe the four-source topology and payloads as measured on 2026-08-21. The later post-show lane-isolation repair removes live player sync from the Wheel source and returns no Wheel scene outside an active ceremony. Re-measure before using these Wheel request/byte figures as the current baseline.

## Scope

This pass changes storage reads only. It does not change capture, polling cadence, response schemas, player heartbeats, visual gains, music-family selection, transitions, Wheel ownership, sponsor timing, or queue behavior.

The four permanent live surfaces remain independent:

| Surface | Active cadence |
|---|---:|
| Live + Wheel (historical live lane) | 650 ms |
| Foreground | 1,500 ms |
| Music visuals | 1,000 ms |
| Wheel source (historical combined lane) | 1,000 ms |

## Representative four-hour measurement

Run with:

```bash
npm run measure:radio-live-usage
```

The deterministic fixture represents one active 44-slot show plus three archived 44-slot shows. Stored-value byte counts exclude HTTP headers. Local JSON parse figures use 250 iterations and are directional; command, request, cadence, and byte counts are deterministic.

Measured on 2026-08-21:

- Full queue store: 326,828 bytes.
- Current-session projection: 78,070 bytes.
- Queue value reduction: 76.1%.
- Four-hour requests: 60,554 before and after; cadence is unchanged.
- Redis commands / REST reads: 181,662 → 121,108, a 33.3% reduction.
- Stored-value read volume: 18,896.0 MiB → 4,530.9 MiB, a 76.0% reduction for the representative fixture.
- Estimated server JSON parse time: 44,470 ms → 10,267 ms in the recorded local run, a 76.9% reduction.

| Endpoint | 4h requests | Commands before → after | Read MiB before → after | Response bytes |
|---|---:|---:|---:|---:|
| Live + Wheel (historical live lane) | 22,154 | 66,462 → 44,308 | 6,913.2 → 1,657.7 | 2,183 |
| Foreground | 9,600 | 28,800 → 19,200 | 2,995.7 → 718.3 | 533 |
| Music visuals | 14,400 | 43,200 → 28,800 | 4,493.6 → 1,077.5 | 637 |
| Wheel source (historical combined lane) | 14,400 | 43,200 → 28,800 | 4,493.6 → 1,077.5 | 2,204 |

Response bytes and browser response parsing are unchanged because the public contracts are unchanged.

## Implementation boundary

Before this pass, every active visual poll read:

1. the full queue store, including archived sessions;
2. the live-overlay state key;
3. the player-sync key.

After this pass, every active visual poll reads:

1. one `MGET` for `radioQueue:v2:live-session` plus the mutation revision, containing only the authoritative current session and a same-round-trip freshness check;
2. one `MGET` for live-overlay state plus player sync.

The live projection is written inside the same fenced Lua commit as the full queue store and mutation revision. Required durable rollback and reviewed durable restore update the projection in that same atomic boundary. The existing full store remains authoritative and is still the only durable snapshot payload.

An older deployment, stale rolling-deployment revision, or missing/corrupt projection safely falls back to the established full-store read. Ending or archiving the show atomically writes an empty live projection so permanent sources return to standby without scanning archives.

The public queue’s submitter-specific state remains on its existing public snapshot path and was not copied into the shared visual projection. No new polling, write heartbeat, buyer record, or personalized shared cache was introduced.

## Verification requirements

- Compact and full queue reads must agree on every field consumed by live, foreground, music, and Wheel resolvers.
- One live queue poll must issue one compact projection/revision `MGET`.
- One shared overlay read must issue one `MGET`.
- Idle sessions must continue to skip shared overlay reads.
- Queue fencing, durable recovery, historical import, music/Wheel lifecycle, and production build suites must remain green.

## Rollback

The boundary is additive and rollback-safe. Reverting readers to `getRadioQueueState()` and the two individual overlay getters immediately restores the previous path. The extra live projection key is ignored by older code; the full Redis store and durable Blob snapshots are unchanged.
