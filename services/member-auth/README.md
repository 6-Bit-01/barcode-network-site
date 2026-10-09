# BARCODE account foundation

The website owns Member identity in this separate service. Better Auth 1.7.7 supplies password hashing, verification, recovery and database-backed sessions. SQLite and the encrypted transactional-mail outbox share one dedicated website database. BNL, native queue state, payments, guest browser ownership and existing admin authentication retain their current owners.

This release provides email/password registration, verification before Member activation, sign-in/out, editable nonunique display names, recovery revoking earlier sessions and sign-out across devices. It does not yet provide Owner/Crew consoles, Artist/guest claims, account-linked queue history, support threads, Insights or game synchronization. It does not disclose hidden games. Member cookies do not authorize any existing admin API.

## Configuration

Vercel receives only `BARCODE_MEMBER_SERVICE_URL=https://member-auth.barcode-network.com` and a distinct `BARCODE_MEMBER_SERVICE_TOKEN`. Keep those server-side, never `NEXT_PUBLIC_*`. Root CI/build requires neither. Without both, account APIs fail closed and the Account header control remains absent.

The service receives the separate Better Auth secret, bridge credential and Resend Sending-access key restricted to `mail.barcode-network.com`; see `deploy/member.env.example`. No secret belongs in git, screenshots or logs. The service binds `127.0.0.1:8788`; Caddy is the TLS entry point. Authentication uses the fixed public website origin and host-only Secure/HttpOnly member cookies; the proxy strips shared-admin/queue cookies and returned session tokens. It does not trust any browser-supplied account ID or staff role.

Resend sends plain-text verification/reset mail from `BARCODE Network <accounts@mail.barcode-network.com>` with replies to the existing BARCODE Gmail. Keep Resend domain open/click tracking disabled. Three notices per recipient/hour and 100 conservative send attempts/UTC day bound abuse and the Free daily allowance. Provider retries use the same durable idempotency key, with at most six attempts while the one-hour link remains valid. A crash after provider acceptance therefore retries safely. Quota/provider rejection cannot activate an unverified account.

The account process dispatches its own durable outbox; no new system timer is installed. No email content, recipient, security token or request URL is logged. Pending mail is encrypted with a key derived from the Better Auth secret; sent/failed/expired rows discard the encrypted payload. Preserve the secret with database backups; changing it invalidates existing links/sessions and unread outbox payloads. The sender accepts no arbitrary public recipient/message API.

## Verification

Run `npm ci --prefix services/member-auth` then `npm test --prefix services/member-auth`. Tests use disposable SQLite files under the process TEMP/TMP directory and synthetic recipients; no real mail is sent. On the owner's Windows machine set both to the verified task D: scratch directory. Root `npm run check` and `npm run build` cover the proxy/screens; CI independently exercises the Linux service.

## Deployment and rollback

Review before activation: exact DNS A record for `member-auth.barcode-network.com`, TLS ingress and host/cloud firewall ports 80/443, dedicated `barcode-member` system account/database, private service/mail credentials, private backups and a single owner delivery test. None of those exist merely because this source is merged. Do not alter the bot's port8787/process/database or Gmail after-show timer.

Install the service package from the exact merged tree into a versioned `/opt/barcode-member/releases/<commit>` directory; select `/opt/barcode-member/current` without replacing active data. Create `/var/lib/barcode-member/tmp` and `/etc/barcode-member/member.env` with access restricted to the service account and root. Run `npm ci --omit=dev` with scratch directed to that service's temp directory. As the service account, load its private environment and run `node migrate.mjs` explicitly. Then install the reviewed systemd unit and Caddy configuration. Startup must not perform unreviewed schema changes. Validate the unit, Caddy configuration and certificate, then the same-origin account endpoints. Domain tracking and DNS publication are separate from delivery acceptance.

Before every schema/deployment change, run `node backup.mjs /absolute/private/backup/member-<timestamp>.sqlite` with the database environment. It uses SQLite online backup and validates integrity, refuses overwriting a backup and does not read the bot DB. Store the matching private secret separately and retain an encrypted off-host copy before public account use. No unencrypted account database belongs in public Blob, queue snapshots or BNL source packs. Prove restore to a separate private directory, then verify session revocation and pending-mail state before trusting recovery. Never restore an older member DB as a routine code rollback: it can revive revoked credentials or sessions.

Code rollback: remove the two Vercel member-service variables and redeploy to hide account access; stop only `barcode-member`; restore the prior service code with the current database. Retain the database/private backups. Account rollback cannot change queue limits or payments. DNS/firewall/credential removal requires exact reviewed targets and does not occur automatically.
