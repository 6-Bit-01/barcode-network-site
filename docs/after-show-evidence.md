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
  A recap posted after capture or a later Daily/Weekly requires later evidence.
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
