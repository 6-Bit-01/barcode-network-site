# Queue historical evidence ledger repository

## Status and boundary

This is an implementation-only, admin-only foundation for preserving verified
historical queue evidence. It is deliberately unconfigured by default. It does
not provision a Blob store, stage raw evidence, choose the first/root import,
perform a production append, restore QueueStore state, or alter the live queue.

The repository must use a dedicated **private** Vercel Blob store token supplied
only as:

```text
QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN
```

There is no fallback to `BLOB_READ_WRITE_TOKEN`, OIDC, a queue upload store, or
any Redis credential. Do not connect the store or set this variable until the
owner has separately approved the storage authority, admin authority, first
root bundle, root ordering, and raw-evidence staging process. No environment
setup or first append was performed as part of this implementation.

## Immutable layout

The private store reserves one namespace:

```text
barcode-radio-queue-historical-evidence/v1/chain/root.json
barcode-radio-queue-historical-evidence/v1/chain/<previousBundleDigest>.json
```

`root.json` may contain only a ledger whose `previousBundleDigest` is `null`.
Every later object's filename is the exact lowercase SHA-256 digest of the
bundle it follows, and its body must declare that same predecessor. Therefore a
predecessor has exactly one possible storage key. There is no mutable head
object.

Writes use canonical UTF-8 JSON and exactly these Blob options:

```text
access: private
addRandomSuffix: false
allowOverwrite: false
contentType: application/json
cacheControlMaxAge: 60
```

The create-only key is the concurrency primitive. A write never overwrites,
deletes, rolls back, or repairs an object. An uncertain write is reconciled by
re-auditing the immutable chain. If the exact canonical bundle is present, the
request is an idempotent retry; a different successor is a conflict; an
unreadable result remains `historical_evidence_append_outcome_unknown`.

## Read and integrity rules

Every read lists the entire reserved prefix with bounded, cursor-checked
pagination and reads private objects with the dedicated token and cache bypass.
The declared `@vercel/blob` minimum is 2.6.1 because this repository requires
`get(..., { useCache: false })` to read current private origin state.
The audit fails closed on:

- missing or partial configuration;
- unavailable, malformed, repeated, or non-terminating list pages;
- unexpected or duplicate pathnames;
- objects larger than 1 MiB, invalid UTF-8/JSON, or noncanonical bytes;
- a ledger that fails the v1 schema or bundle-digest validation;
- a pathname/body predecessor mismatch;
- repeated bundle digests, a fork, a gap, or an unreachable object; or
- a chain longer than 256 bundles.

An integrity/storage failure returns `503`; it is never treated as an empty
repository. The repository does not import or call Redis, QueueStore, the live
queue, `fetch`, Blob delete, or Blob overwrite operations.

## Admin API

All responses, including errors, use `Cache-Control: private, no-store` and do
not expose provider errors. Admin-cookie verification occurs before request-body
parsing and before any Blob access.

### `GET /api/admin/queue/historical-evidence`

Returns a validated chain summary. Bundle digests, predecessor digests, show
dates, counts, completeness, and aggregate coverage are included. Raw ledgers,
source/evidence identifiers, source hashes and locators, session identifiers,
track fields, source URLs, private Blob pathnames, and candidate details are not
returned.

### `POST /api/admin/queue/historical-evidence/dry-run`

The exact JSON body is:

```json
{
  "ledger": {},
  "operatorAttestedEvidenceSha256ById": {}
}
```

The digest map must contain exactly one operator-attested lowercase SHA-256
value for every ledger source whose `sha256` is non-null. It must not contain
entries for unhashed sources. The server checks that this attested map exactly
matches the ledger declarations, but it does **not** receive or hash the raw
evidence. Dry-run validates the ledger and attested matches, audits the current
chain, and performs no write.

The response schema is
`barcode_queue_historical_evidence_import_plan_v1`. It reports `canApply`,
`alreadyPresent`, the submitted and observed predecessor/head digests, the show
date, operator-attested hashed-source count, unhashed source identifiers, and
an exact confirmation phrase:

```text
APPEND QUEUE HISTORICAL EVIDENCE <date> <bundleDigest> AFTER <ROOT|previousBundleDigest>
```

An identical bundle is a safe replay. A later evidence-backed refinement for
the same show date is allowed only as a new bundle behind the currently audited
head, so the earlier evidence state remains immutable and reviewable. A new
bundle can apply only when its declared predecessor equals that head.

### `POST /api/admin/queue/historical-evidence/apply`

The exact JSON body is the dry-run body plus `confirmation`. Apply does not
trust a prior plan: it rebuilds the plan, checks the exact phrase, then
revalidates the request and re-reads the complete chain immediately before its
single create-only write. It returns `201` for a newly verified append, `200`
for an identical retry, `409` for stale/concurrent/conflicting state, `400` for
validation/hash/confirmation failures, `413` for an oversized request, and
`503` for configuration, storage, integrity, or ambiguous-outcome failures.

## Before any future production use

The owner must explicitly approve and record all of the following outside this
implementation:

1. Creation and connection of a dedicated private Blob store.
2. Which admin role is allowed to execute the first and later appends.
3. The canonical root bundle and chronological/root ordering.
4. A private workflow for staging and hashing raw evidence before an operator
   attests those digests in the request. Server-side raw-evidence hashing is a
   separate future authority decision.
5. A reviewed dry-run response and its exact confirmation phrase.

Production use must begin with a read-only summary and dry-run. Never test this
foundation by writing to an existing Blob store or by borrowing another token.
