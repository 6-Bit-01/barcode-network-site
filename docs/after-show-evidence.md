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

Discord capture follows the current conversations schema: the three existing
public channel policies are mandatory; `public_usable` and `visibility` are
additional restrictions when those optional columns exist. It does not require
the source-archive table's `public_usable` column on conversations. Text attachments
are base64-encoded from the exact UTF-8 bytes recorded in the manifest and local
ZIP, so SMTP newline conversion cannot invalidate their byte counts or hashes.

The collector version `post_show_observation_2026_09_26` retains BNL's actual
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
`~/.local/share/barcode-after-show/`. This update replaces both
`bnl_after_show_capture.py` and `after_show.py` there with verified files. Install
the capture module first; it remains compatible with the older worker. Keep the
existing configuration, timer and `state.json`. Do not rerun setup or
erase accepted-delivery state. No BNL restart is required. The PR handoff includes
the exact file hashes and one inline installation/capture command.

For the next normal packet, check `collectorVersion`, public model rows,
`existingHealth.available`, both receipt sections and their `fieldCoverage`.
Old schemas, expired records, missing permissions and unavailable readers remain
coverage gaps, not passing checks. To recover the most recently archived show's
evidence immediately using the existing private mail path, the established
`after_show.py --test` command sends a newly captured TEST packet and preserves
normal delivery deduplication. Retain the original packet and all its coverage
markers; this supplemental packet does not replace its historical evidence or
retroactively establish feature acceptance.

For the current post-deploy check, run the updated
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
