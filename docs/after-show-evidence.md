# Automatic private after-show evidence

The host ends/archives normally. A separate VPS timer checks every five minutes,
waits at least 20 minutes after the actual archive event, captures the two website
reports and the bounded BNL evidence, and sends one private email with three
UTF-8 text attachments. It waits up to two hours for the exact session's finalized
BNL v2 ledger, then sends an explicitly partial packet if evidence is missing.
There is no fixed Friday/midnight cutoff and no recording transfer.

The website change is inert without its dedicated server secret. The VPS timer
is not installed by a website deployment or by the setup script. Nothing calls
BNL models, changes its database, restarts it, changes submissions/payments or
enables submitter editing/Discord features.

## Export and scope

`GET /api/ops/after-show`, authenticated with
`Authorization: Bearer <BARCODE_AFTER_SHOW_EXPORT_TOKEN>`, returns an index;
`?sessionId=EXACT_ID` returns that show's Show Log and Playback Diagnostics from
one queue-store read. It requires the existing production capability and a
separate token of at least 32 characters. Admin cookies and BNL credentials are
not accepted by this route. Every response is private/no-store/noindex.

Only archived, explicitly public `live_broadcast` sessions with a recorded start,
at/after the existing history boundary, qualify. Simulations and private sessions
are excluded. Missing IDs never fall back to the active show. Existing DTO
builders exclude contact/payment/admin-note fields and uploaded media locations.
The worker additionally redacts URLs, emails and credential-like free text.

The exports retain their existing limits: Show Log 2,048 events; Playback
Diagnostics 80 lifecycle events/64 tracks. The BNL reader keeps public-eligible
chat, source metadata, exact-session ledger/projection counts, allowlisted service
log metadata and the hash-pinned existing health reader. It uses read-only SQLite,
row/time bounds and explicit unavailable/truncated markers. It never copies the
database, configuration, private chat or raw service messages.

Collector version `bounded_ledger_projection_2026_10_03` projects ledger metadata
inside SQLite instead of transferring and decoding the entire ledger in Python.
Its 8 MiB limit applies to `length(CAST(ledger_json AS BLOB))`, the database's
storage bytes; this is not a character count or an assumed UTF-8 byte count.
Type and size guards run before JSON parsing. Exact guild, show date (when the
column exists), and requested table `show_key` filters run before the row limit.
The stored and nested v2 schemas and nested `showKey` must match; a date or legacy
`show:<hash>` key never establishes session binding. Malformed JSON, raw NULs,
decoded top-level keys containing NUL, duplicate projected keys, schema/key
mismatches and oversized JSON keep an explicit unavailable projection on the
requested row rather than disappearing. The decoded-key guard runs before
metadata path lookups because SQLite can interpret a NUL-containing key as an
alias for a shorter key. It checks decoded keys and raw top-level `fullkey`
tokens, preserving escaped-backslash parity for older SQLite versions that
truncate decoded keys. A literal backslash followed by `u0000` remains allowed.
The failure returns only `invalid_ledger_metadata_keys`, never the offending
keys. A multipath JSON array checks the two binding values before older SQLite
can truncate their decoded strings; a NUL in those values reports only
`invalid_ledger_metadata_values`. Escaped NULs inside nested source keys or values
remain allowed when outside the projected metadata; their contents are not exported.

The projection exports only array counts and existing table metadata, including
the unchanged `source_digest`. It does not export or truncate the original JSON,
alter records, or claim that `source_digest` is a hash of the JSON file. Missing
or non-array fields retain `null` counts and unavailable `countCoverage`, not
invented zeroes. A valid finalized ledger can release collection even if count
coverage is partial; the packet still reports that gap. Original source evidence,
attachment hashing and the independent public-chat/privacy filters are preserved.
Without a bound exact-session ledger, `episodeProjections` is unavailable rather
than presenting unchecked projection counts as zero.


Collector version `canonical_projection_lookup_2026_10_03` retains that bounded
ledger projection and counts only **current canonical native projection rows**.
It derives finite episode/participant source keys internally from the same
validated, finalized exact-session ledger and its matching current native
`sourceDigest` / `source_digest` revision. Identity fallback, 240 Unicode
codepoint truncation, hashing and surface separation follow the native writer.
These counts exclude older revisions and unrelated source rows; they are not the
previous broad diagnostic totals for every historical row sharing a show event.

The reader checks and forces the existing nonpartial `idx_mle_source` index,
batches at most 400 source keys per query, and retains guild, source table,
session event, public eligibility and active lifecycle filters. Episode and
participation predicates must match their canonical key types. A missing or
incompatible index makes this section explicitly unavailable; it never falls
back to a broad predicate scan or creates an index. The shared read deadline
and source transaction remain unchanged.

Both native participant arrays must be supported arrays, with at most 5,000
items combined, independent of the packet's exported chat row limit. Each
internal identity JSON projection is limited to 64 KiB. Non-object items,
unsupported identity types, duplicate identity keys, escaped immediate key
spellings, decoded NUL keys/values, digest mismatch, malformed encoding and
unsupported metadata make the section
unavailable with no counts. Multipath JSON preserves identity values before
older SQLite versions can truncate decoded NULs; literal backslash-`u0000`
text remains supported. Identity strings and derived participant keys stay
internal; only counts, the expected canonical row count and scope are exported.
Any section query failure discards its counts and retains safe stage/category
metadata alongside earlier captured sections.

Before the unchanged two-hour deadline, failed collection/database/ledger reads
or rejected projections report `waiting_for_bnl_evidence`; projection failures
include allowlisted `ledgerProjectionReasons`. A readable missing or active
ledger still reports `waiting_for_bnl_finalization`. Neither status forces
finalization or sends early. At the deadline, the existing routine may send an
explicitly partial packet. Packet staging, retry identity and the accepted-send
ledger remain unchanged; this repair grants no resend authority.

Discord capture follows the current conversations schema: the three existing
public channel policies are mandatory; `public_usable` and `visibility` are
additional restrictions when those optional columns exist. It does not require
the source-archive table's `public_usable` column on conversations. Text attachments
are base64-encoded from the exact UTF-8 bytes recorded in the manifest and local
ZIP, so SMTP newline conversion cannot invalidate their byte counts or hashes.

The collector preserves `post_show_observation_2026_09_26`'s capture of BNL's actual
`model` conversation rows as well as human `user` rows and legacy `assistant`
rows. BNL's stored `user_id` identifies an addressed member, not the speaker;
model rows therefore use a stable bot `speakerKey` and a separate hashed
`addressedSpeakerKey` when one exists. Public-policy, guild, time, redaction and
row limits apply equally to both sides. `deliveryVerified=false` remains explicit.

`sharedBrainReceipts` retains packet/run IDs, route and authority metadata,
selected/rendered lane counts, final response hash, candidate/live flags,
source/frame checks, final guard, fallback reason and corrective-call counts.
`intelligencePacketReceipts` exports the corresponding packet-run metadata and
selection/validation counters. Counts are an allowlisted projection; unknown
keys, malformed counters and missing schema fields are reported as unavailable
coverage, never silently treated as zero. Neither section exports prompts,
member identities, private facts or source text. They show selection and
application, not whether the resulting response understood the source well.

Join synthesis to packet receipts by `packet_run_id`/`run_id` and `packet_id`.
A public model row's `responseReceiptHash` uses the existing synthesis digest
encoding and can match `final_response_hash` for exact stored response text.
Do not guess a join from nearby timestamps: splitting, grouping, persistence
failures or later redaction can prevent a one-row match. The hash is computed
before redaction; the attachment is not the original Discord message.

Read `source_revalidation_status` alongside `guard_status`, `fallback_reason`,
`corrective_call_count`, `candidate_selected` and `live_applied`. A rejected
source basis can remain recorded after a successful source-neutral rewrite.
Thus `subject_ambiguous` plus `response_sent=1` alone proves neither that the
bad packet was sent nor that the repair was useful. The final prose is needed.

The health reader remains hash-pinned. The reviewed shared-input reader at bot
revision `48a225f` (unchanged at `ca52801`) is now accepted alongside the original
reader, and the export identifies its hash/version. Unknown revisions still
remain unavailable. Only its read-only `inspect()` entry point runs; no bot
import, process environment read, provider call or runtime gate change occurs.

## Later operator observations

Normal scheduled packets retain the original noon-to-next-noon Pacific show
window. A manual `after_show.py --test` additionally captures a separate
`operatorObservation` for the most recent two hours, with its own start/end
timestamps and `operatorObservationWindow` in the manifest. It uses the same
public-policy reader, exact session reference and allowlisted logs, with at most
1,000 rows per database section. These recent comments are observation activity;
they must not be attributed to the archived show's live chat. Delivery size
limits and omitted-row counts apply to both windows. TEST mode still does not
consume normal delivery state.

To recover a specific earlier test without repeating its questions, TEST mode
accepts `--observation-start TIMESTAMP_WITH_TIMEZONE`. It captures from that
start to the earlier of capture time or two hours later. Future/naive starts
and use outside TEST mode are rejected. This explicit window remains subject
to existing source retention and public eligibility.

This repairs the September 26 20:01:11 UTC TEST packet
`ce7bfbfd4b2971bfb0b874679de54670df76baea5f29f25aefa66c5e1f86e541`'s
observation gap. Its BNL evidence stopped at 19:00 UTC, before the supplied
19:55/19:56 UTC questions. Its repository was clean on bot merge revision
`1aa775dc2b8409c0cf5ba22c7db7a6c59c411ceb`, and the service start was 19:54:50 UTC.
Both evidence attachment hashes/byte counts verified, but the database and
health reader each returned only `OperationalError`. The packet cannot settle
whether the follow-ups were received, answered, blocked or timed out. It does
not prove that the show ledger or conversation data is absent.

SQLite failures now report an allowlisted category and stage, plus a numeric
SQLite result code when the interpreter supplies it. Python 3.9 also receives
the category. Lock contention, open failures, readonly errors, interruption and
schema failures can be distinguished without exporting exception messages,
SQL, paths or private data. This is diagnostic coverage; it does not claim to
repair the VPS error whose cause was absent from that packet.

The log projection also keeps BNL's `response_stage_timing` numeric fields and
the known `message_capture` / `show_source_read` stages. Raw log text, arbitrary
stage strings and prompts remain excluded. Missing timing records do not prove
that a stage never ran.

## Updating an existing installation

A website deployment does not update the VPS copy in
`~/.local/share/barcode-after-show/`. For this canonical-query follow-up, replace only
`bnl_after_show_capture.py` there with the verified file; `after_show.py` remains
unchanged from the bounded-ledger repair. The capture module remains compatible
with the existing worker. Keep the
existing configuration, timer and `state.json`. Do not rerun setup or
erase accepted-delivery state. No BNL restart is required. The PR handoff includes
the exact file hashes and one inline installation/capture command.

For the next normal packet, check `collectorVersion`, `ledgerProjection`
availability/count coverage, `episodeProjections` availability and canonical scope,
public model rows,
`existingHealth.available`, both receipt sections and their `fieldCoverage`.
Old schemas, expired records, missing permissions and unavailable readers remain
coverage gaps, not passing checks. To recover the most recently archived show's
evidence immediately using the existing private mail path, the established
`after_show.py --test` command sends a newly captured TEST packet and preserves
normal delivery deduplication. Retain the original packet and all its coverage
markers; this supplemental packet does not replace its historical evidence or
retroactively establish feature acceptance.

For the September 26 post-deploy check, run the updated
`--test --observation-start 2026-09-26T19:54:00Z`; there is no need to repeat the
already-sent questions. Verify the deployed
bot revision and service start, the observation window containing the actual
question times, public human/model rows, receipt-hash joins and stage timings.
If either reader remains unavailable, inspect its category/stage before making
a runtime fix or asking for another conversation test. The previous packet's
noon cutoff and database error are separate problems.

## One-time off-air setup

1. Merge/deploy this PR through the normal website workflow.
2. Copy `tools/after-show/` to the existing VPS user, outside the bot checkout.
   It needs Python 3.9+; the existing bot virtualenv Python may be used. No pip
   packages are needed. Run setup as the existing bot user, without sudo:

   ```bash
   python3 /path/to/after-show/setup.py
   ```

   It prompts locally for the existing bot directory, verified BARCODE sender,
   connected owner inbox, SMTP login and hidden mail app password. It generates
   the website export key, saves private mode-600 configuration, copies the two
   worker files outside the bot checkout and prepares systemd units. It refuses
   to overwrite existing configuration or create a missing bot database.
3. Add the displayed key as `BARCODE_AFTER_SHOW_EXPORT_TOKEN` in Vercel's intended
   environment and redeploy. Do not paste the key or mail password into chat.
4. Run the exact `after_show.py --test` command printed by setup. It gathers the
   latest archived public show and sends a TEST packet, ignoring the no-backfill
   start date without consuming a future normal delivery. Confirm the inbox
   attachments and actual ChatGPT automatic review. `smtp_accepted` only means
   the mail server accepted it, not that Gmail delivered it or a review ran.
5. Inspect coverage in that test: database/log permissions, show/session match,
   finalized ledger, projection counts and readable attachments. Prior feature
   acceptance/waivers remain separate. Then run the three printed systemd
   commands to install/enable the separate timer. Its service runs as the bot
   user with read-only source paths and write access only to its own outbox.

The verified receiving task currently expects the BARCODE sender configured in
ChatGPT and `[BARCODE AFTER-SHOW]` subjects. Verify that account during setup;
changing it requires updating the task's exact sender filter. The ChatGPT Gmail
connection is not a server mail credential. The small Gmail attachment transport
was tested separately; a server-to-inbox-to-automatic-review run is still needed.

Gmail SMTP uses `smtp.gmail.com` with implicit TLS on port465 here. Google requires
2-Step Verification for app passwords, and some accounts do not offer them. Use
an app password where supported, never the ordinary account password. If the
account cannot provide one, stop at this configuration step and select an
authorized mail transport; do not change account protections automatically.
Official references: [Google app passwords](https://support.google.com/accounts/answer/185833)
and [Google SMTP guidance](https://support.google.com/a/answer/176600).

## Delivery and failure behavior

- `manifest.txt` binds exact session, source revisions, UTC capture window,
  coverage and SHA-256 hashes for `website-evidence.txt` and `bnl-evidence.txt`.
  ZIP and MIME copies remain private in the local outbox. ZIP email extraction is
  unnecessary. All test packets have `isTest=true`; none assert acceptance.
- The setup timestamp excludes old shows from normal operation. Failed sends
  retain the staged packet, stable packet ID/Message-ID and exponential backoff
  up to six hours. The website's public eligibility is rechecked before retries.
  A file lock prevents overlapping workers. Accepted deliveries are durably
  recorded and skipped on later polls. If SMTP accepts a send but the process
  dies before recording that result, a duplicate remains possible: this is
  at-least-once delivery, not a claim of exactly-once inbox processing.
- Capture gaps and size truncation are labeled partial. Attachments are bounded
  to10MiB before MIME encoding; delivery truncation records omitted row counts.
  Source retention and noon-to-next-noon Pacific capture bounds remain explicit.
  A recap posted after capture or a later Daily/Weekly requires later evidence;
  TEST packets additionally label the recent two-hour operator observation.
- Per-show failures retain retry state; endpoint/config failures exit nonzero
  into the separate systemd service log. A broken sender cannot promise an
  email failure notification. Check service health in the off-air acceptance.
- Local packets are retained without automatic deletion. They contain public
  chat evidence for private owner review; use normal private-server backup and
  retention practices. `state.json` is the sent ledger: preserve it across updates.

## Status and rollback

```bash
systemctl status barcode-after-show.timer --no-pager
journalctl -u barcode-after-show --since '1 day ago' --no-pager
sudo systemctl disable --now barcode-after-show.timer
```

Stopping this timer does not affect `bnl01`. Removing/rotating the dedicated
website token disables this read endpoint without changing admin downloads,
queue state, submissions or BNL's existing service credentials. Keep the manual
Friday collector as fallback until actual end-to-end acceptance succeeds.

## Validation scope

Focused route tests exercise real in-memory queue state, auth/production gating,
private/live/unstarted exclusion, safe exports, exact selection and no mutation.
Python fixtures exercise UTC/Pacific rollover, read-only DB access and privacy,
exact-session finalization/projections, MIME/hash readback, no-show/no-backfill,
partial data, backoff, duplicate suppression, transport bounds and secret-safe
errors. These do not establish the actual VPS filesystem, mail credential,
provider delivery, systemd installation or automatic ChatGPT invocation.
