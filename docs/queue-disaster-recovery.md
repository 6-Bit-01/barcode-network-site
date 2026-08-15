# BARCODE Radio queue disaster recovery

## Failure this prevents

The August 2026 incident was an Upstash command-quota lock:

```text
ERR max requests limit exceeded. Limit: 500000
```

The queue had been stored as one Redis value (`radioQueue:v2:sessions`). Public, admin, and OBS polling repeatedly read the same shared database. Once the monthly request allowance was exhausted, fresh server processes had no in-memory copy and queue endpoints returned HTTP 500 even though the queue value itself had not been deleted.

## Permanent storage contract

- Redis is the serialized mutation authority.
- `QUEUE_REDIS_REST_URL` and `QUEUE_REDIS_REST_TOKEN` select a queue-only Redis database. During migration only, the code falls back to the shared `UPSTASH_REDIS_REST_*` pair.
- Every committed queue revision is stored privately in Vercel Blob at `barcode-radio-queue-state/v1/revisions/` and promoted to `barcode-radio-queue-state/v1/current.json`.
- Snapshot envelopes contain the complete private queue store, revision, timestamp, and SHA-256 checksum.
- Public/admin polling reads the durable Blob model first and does not consume Redis commands.
- When Redis is unavailable or quota-locked, a fresh process returns the last verified durable revision. Mutations fail closed.
- If a durable write fails, the fenced Redis mutation is rolled back before the caller receives an error.
- Uploaded audio is never deleted from an unarchived session. Archived audio is retained for at least 30 days, and cleanup refuses to run in production without first saving the complete queue snapshot.

## Required production configuration

1. Keep the existing private `BLOB_READ_WRITE_TOKEN` connected to the Vercel project.
2. Create a queue-only Redis database under an account with two verified administrators and recorded billing ownership.
3. Set `QUEUE_REDIS_REST_URL` and `QUEUE_REDIS_REST_TOKEN` for Production, Preview, and Development. Never configure only one of the pair.
4. Use a paid or auto-upgrading database plan. Provider backup is additional protection; it does not replace the independent Blob snapshots.
5. Preserve the shared `UPSTASH_REDIS_REST_*` variables for BNL/overlay migration, but do not point the dedicated queue variables at the same database.

## Deployment and migration order

1. Deploy this change while the old queue variables still point at the existing database.
2. On the first successful Redis read, verify that the private `current.json` and a matching immutable revision appear in Blob. Do not remove the old Redis variables before this evidence exists.
3. Create the owned queue-only Redis database and configure the two `QUEUE_REDIS_REST_*` variables.
4. Call authenticated `GET /api/admin/queue/recovery` and verify `alignment`, both revisions, the active session ID, and record counts. Then call `POST /api/admin/queue/recovery` with `{"action":"restoreDurableSnapshot","dryRun":true}`. Review the dry-run result before repeating with `dryRun:false` and the exact `requiredConfirmation` string from the GET response.
5. Redeploy, perform the focused tests below, and then leave the old database read-only until the recovery window closes.

If the old database is quota-locked before the first durable snapshot exists, no application code can bypass the provider lock. Preserve the database and wait for its quota reset or restore provider access; do not create an empty queue over it. Uploaded files alone cannot reconstruct link submissions or all submitter metadata.

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
- a corrupted current pointer recovers from immutable revision history;
- a failed durable write causes a fenced Redis rollback.

## Post-deploy evidence

1. Submit one controlled link track and one controlled uploaded-audio track in a private rehearsal session.
2. Record the queue revision, session ID, ordered track IDs, and lane values from the authenticated admin response.
3. Verify private Blob `current.json` and the same revision under `revisions/` exist.
4. Temporarily point a Preview deployment at a Redis credential that returns the quota error, or use the automated exact-error test; confirm `/api/queue` remains HTTP 200 with the recorded queue and admin mutations fail.
5. Confirm an hour of public/admin/OBS polling does not increase queue Redis GET count.
6. Archive the rehearsal, run cleanup before 30 days, and confirm its uploaded audio still exists.
