# BARCODE Radio queue disaster recovery

## Failure this prevents

The August 2026 incident was an Upstash command-quota lock:

```text
ERR max requests limit exceeded. Limit: 500000
```

The queue had been stored as one Redis value (`radioQueue:v2:sessions`). Public, admin, and OBS polling repeatedly read the same shared database. Once the monthly request allowance was exhausted, fresh server processes had no in-memory copy and queue endpoints returned HTTP 500 because Redis rejected commands. The quota error did not prove whether the stored queue value still existed; that requires a successful authenticated logical read of the original database.

## August 7 / August 14 source identity correction

The August 7 Pacific live broadcast must not be selected by stored `showDate` alone. Its verified source session is `session_msjmzqjk_w1rkj`, but the legacy source stored `showDate=2026-08-08` because the date was derived in UTC. The owner export binds that identity with SHA-256 `49c950556a9662f98fa402beb84a7e579120afff8da9cc5c70077f4b46cd6c2e` and a lifecycle of 40 completed tracks plus the one removed `MagicSZN — HighFive` record.

The corrected source capture records both the immutable source date/status and the canonical Pacific date. The import retains the raw source response checksum and writes private recovery provenance into the recovered Redis and Blob session. It deliberately normalizes both recovered sessions to closed, archived history. After the revision-one import is verified, use the normal authenticated admin workflow to create a new prepared session; the historical import itself does not reopen submissions.

## Permanent storage contract

- Redis is the serialized mutation authority.
- `QUEUE_REDIS_REST_URL` and `QUEUE_REDIS_REST_TOKEN` select a queue-only Redis database. Production queue reads and ordinary mutations never fall back to the shared `UPSTASH_REDIS_REST_*` pair. Missing, partial, invalid, or same-endpoint queue credentials fail closed unless a previously verified durable queue snapshot can safely satisfy a read.
- Every proposed queue revision is stored privately in Vercel Blob at `barcode-radio-queue-state/v1/revisions/`. It becomes recoverable only after the matching append-only marker exists under `barcode-radio-queue-state/v1/commits/`.
- `current.json` and `committed.json` are conditionally updated bounded heads, not commit authority. `pending.json` publishes the exact predecessor/target intent before Redis or a protocol migration can advance. An unmarked newer current or unresolved intent makes ordinary reads fail closed; full append-only marker scanning is reserved for explicit recovery/audit.
- Snapshot envelopes contain the complete private queue store, revision, timestamp, and SHA-256 checksum.
- Public/admin polling reads the durable Blob model first and does not consume Redis commands.
- When Redis is unavailable or quota-locked, a fresh process returns the last verified durable revision. Mutations fail closed.
- The immutable target and pending intent are prepared before Redis commits. A preparation failure leaves Redis unchanged. A lost Redis acknowledgement is called refused only when one Lua operation proves the exact predecessor and revokes the token; otherwise the result stays explicitly ambiguous until exact recovery.
- Uploaded audio is never deleted from an unarchived session. Archived audio is retained for at least 30 days, and cleanup refuses to run in production unless the current queue exactly matches a committed durable snapshot; cleanup itself never performs an unfenced snapshot promotion.

## Required production configuration

1. Keep the existing private `BLOB_READ_WRITE_TOKEN` connected to the Vercel project.
2. Create a queue-only Redis database under an account with two verified administrators and recorded billing ownership.
3. Set `QUEUE_REDIS_REST_URL` and `QUEUE_REDIS_REST_TOKEN` together. Production must use the owned queue-only database. Preview and Development must use separate non-production Redis and Blob resources; do not share Production credentials and do not run mutating Preview workflows until that isolation exists.
4. Use a paid or auto-upgrading database plan. Provider backup is additional protection; it does not replace the independent Blob snapshots.
5. Preserve the shared `UPSTASH_REDIS_REST_*` variables for BNL/overlay, Journal, and dossier projection/control, but do not point the dedicated queue variables at the same database. Canonical BNL memory remains in the bot's owned SQLite database; it is not queue Redis data.

## Deployment and migration order

1. Before deploying this hardening change, verify the currently authoritative queue. Ordinary reads never migrate storage. The first serialized mutation seeds the exact legacy `current.json` (or the exactly captured legacy Redis value) into the committed-marker protocol while holding and renewing the Redis fence. If no verified Blob snapshot exists and the legacy Redis value is unavailable, stop; the application cannot reconstruct missing state.
2. Create the owned queue-only Redis database and configure both `QUEUE_REDIS_REST_*` variables for the intended environment. Do not point them at the shared database.
3. Deploy the hardening change. Production now fails closed when the queue pair is absent, partial, invalid, or not isolated from shared Redis.
4. Call authenticated `GET /api/admin/queue/recovery` and verify `alignment`, both revisions, the active session ID, and record counts. If Redis is unavailable, use its redacted `failureReason`, `failureStage`, and `failureDetail` to distinguish quota, credential, configuration, network, and provider failures without issuing any write. Then call `POST /api/admin/queue/recovery` with `{"action":"restoreDurableSnapshot","dryRun":true}`. Review the dry-run result before repeating with `dryRun:false` and the exact `requiredConfirmation` string from the GET response.
5. Redeploy if environment configuration changed, perform the focused tests below, and then leave the old database read-only until the recovery window closes.

If the old database is quota-locked before the first durable snapshot exists, no application code can bypass the provider lock. Preserve the database and wait for its quota reset or restore provider access; do not create an empty queue over it. Uploaded files alone cannot reconstruct link submissions or all submitter metadata.

When the historical database becomes readable, run only the checksum-pinned corrected capture. It issues read-only `viewSession` actions, binds the known August 7 session by ID, displays every eligible August 14 candidate for exact operator selection, and checkpoints each accepted response without automatic retries. Preserve the final capture artifact and checksum in at least one encrypted, versioned off-host backup before importing.

## Focused proof

Run:

```bash
node --test tests/queue-redis-mutation.test.mjs
node --test tests/queue-playback.test.mjs
npm run typecheck
npm run build
```

The quota-lock test seeds a real mixed queue, starts a completely fresh queue module, forces every Redis GET to throw the exact production `Limit: 500000` error, and proves:

- the same revision and session are returned;
- the same queue IDs and order are returned;
- healthy polling performs zero Redis GETs;
- mutations are rejected without altering the durable state;
- an orphan immutable revision is ineligible, while an unmarked newer current pointer or unresolved `pending.json` intent makes reads fail closed instead of silently rolling back;
- a regressed mutable pointer cannot outrank the newest append-only commit marker;
- Redis-ahead state is either reconciled from an exact prepared snapshot or rejected;
- lost Redis commit acknowledgements are classified only after an atomic exact-byte observation; a proven refusal resolves only its exact pending intent, while an ambiguous outcome remains visibly pending;
- a slow durable write renews and rechecks the Redis fencing lease;
- the immutable revision and bounded pending intent are prepared before Redis commits, so a preparation failure leaves Redis unchanged and a post-commit crash is exactly recoverable.

## Post-deploy evidence

1. Submit one controlled link track and one controlled uploaded-audio track in a private rehearsal session.
2. Record the queue revision, session ID, ordered track IDs, and lane values from the authenticated admin response.
3. Verify private Blob `current.json`, `committed.json`, the resolved `pending.json`, the same checksummed revision under `revisions/`, and its exact marker under `commits/` exist.
4. Temporarily point a Preview deployment at a Redis credential that returns the quota error, or use the automated exact-error test; confirm `/api/queue` remains HTTP 200 with the recorded queue and admin mutations fail.
5. Confirm an hour of public/admin/OBS polling does not increase queue Redis GET count.
6. Archive the rehearsal, run cleanup before 30 days, and confirm its uploaded audio still exists.
