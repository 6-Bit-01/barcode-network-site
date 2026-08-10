# BNL Journal Control Snapshot v1

The website remains authoritative for each Journal entry's independent public
visibility and memory-reuse controls. The existing authenticated
`GET /api/bnl/journal/control` response exposes a content-free snapshot so the
bot can fail closed before selecting or reusing a canonical publication.

The response keeps its existing automation `contractVersion: 1` fields and adds:

- `controlSnapshotVersion: 1`;
- `controlRevision`, the latest valid entry-control `updatedAt` value, or the
  Unix epoch when no overrides exist;
- `controlDigest`, a SHA-256 digest over entry ID, visibility, reuse eligibility,
  and update time in deterministic entry-ID order;
- `controlObservedAt`, `controlFreshUntil`, and
  `controlFreshForSeconds: 120` for bounded consumer revalidation;
- `publicExcludedEntryIds`; and
- `memoryExcludedEntryIds`.

The two exclusion lists are independent. A public entry may remain exactly
retrievable while being excluded from broader memory synthesis. A hidden entry
is not public-retrievable even if the bot previously accepted or cached its
publication. Missing, malformed, stale, or unavailable control state must fail
closed in the consumer.

The endpoint remains API-key authenticated, Redis-required, and `no-store`.
It does not expose the full control records, administrator identity, Journal
content, run details beyond the existing contract, or a new publication store.
Changing these fields does not publish, hide, amend, regenerate, or schedule a
Journal entry; it only reports the current site-owned controls.
