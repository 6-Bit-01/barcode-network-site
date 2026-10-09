# BARCODE account foundation

The website owns Member identity in this separate service. Better Auth 1.7.7 supplies password hashing, verification, recovery and database-backed sessions. Node 24.15 or newer supplies built-in SQLite; no external native database binary or compiler is required. SQLite and the encrypted transactional-mail outbox share one dedicated website database. BNL, native queue state, payments, guest browser ownership and existing admin authentication retain their current owners.

This release provides email/password registration, verification before Member activation, sign-in/out, editable unique account names, recovery revoking earlier sessions and sign-out across devices. It provides explicit Owner/Crew account consoles, audited account-management controls and separately reviewed Artist associations. It does not yet provide Crew tools, automatic guest claims, support threads, Insights or game synchronization. It does not disclose hidden games. Member cookies do not authorize any existing admin API.

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

Code rollback: remove the two Vercel member-service variables and redeploy to hide account access; stop only `barcode-member`; retain a compatible service release with the current database and account access/name constraints. Retain the database/private backups. Account rollback cannot change queue limits or payments. DNS/firewall/credential removal requires exact reviewed targets and does not occur automatically.

## Owner and Crew account authority

Member activation still follows email verification. The same SQLite database now stores explicit, revocable Owner/Crew assignments, currently empty implemented-tool permissions, suspension, account revisions and important-action audits. A matching name/email, first registration, Artist association or legacy admin cookie grants no authority. The access projection and Owner directory/action endpoints require the private bridge credential and a genuine current verified, active Member session. Every mutation rechecks current session and Owner assignment within the same adapter transaction that commits its audit and retry result.

Account names are unique under Unicode NFKC, whitespace collapse/trim and locale-independent lowercase; display capitalization is retained. Invisible/control characters and protected staff names are rejected. SQLite constraints protect registrations and renames, including concurrent claims. The reviewed existing reserved-name ID can retain its reserved identity; this exception does not grant access. A rename retains the permanent Better Auth user.id, and a rejected rename leaves the old name unchanged.

The first slice assigns Crew independently from tool permissions. availablePermissions is initially empty. No unfinished tool permission can be assigned. The account controls support a bounded, filtered directory, name correction, Crew assignment, suspension/reactivation, session revocation and verified-address recovery. They cannot set Owner, change verified email/passwords directly, delete accounts or change Artist credit/history.

Suspension revokes sessions and blocks both password and verification-auto-login session creation. Recovery uses the existing encrypted, throttled outbox and hashed, one-use Better Auth reset records; it does not reactivate an account. A retry must retain the same requestId, expectedRevision and complete action body. Replays return the saved result with no second mutation/mail only while the actor still has current authority. A revoked grant/session denies replay. Name changes, grants, suspension, revocation, recovery and operator Owner changes record actor/target IDs and prior/resulting state without secrets or reset URLs.

## Explicit access upgrade and controlled Owner bootstrap

Use the exact merged service tree and the existing private environment. Stop only the Member service before upgrading, retain the current private online backup and secret, and run the explicit migration. Name conflicts or unreviewed reserved names stop before schema writes; normal startup only checks readiness. The access column, backfill, uniqueness, tables and triggers upgrade transactionally and are idempotent.

For an existing reviewed founder named BARCODE Network:

```sh
node migrate.mjs --preserve-reserved-user-id EXACT_REVIEWED_EXISTING_BARCODE_ID
node bootstrap-owner.mjs --user-id EXACT_VERIFIED_FOUNDER_BARCODE_ID
```

For databases with no unresolved reserved names:

```sh
node migrate.mjs
```

The preserve argument is an explicit reviewed name exception only. Bootstrap requires the exact already-existing, verified, nonsuspended user.id; it performs no name/email discovery and creates no new account. Run it only after private confirmation of that permanent ID. Repeating the same grant is harmless. Controlled revocation uses node bootstrap-owner.mjs --user-id EXACT_BARCODE_ID --revoke and refuses removing the last active Owner. Browser operations cannot set/remove Owner and cannot suspend the current Owner or last active Owner.

After these commands, service startup must pass assertReady; retain the new encrypted recovery checkpoint and independently verify the real private account/menu. Do not create public test accounts. Local service tests use only task-owned, isolated D: scratch databases and synthetic mail transports.

Rollback the website UI against the upgraded service and current database. Keep the upgraded service name hooks, SQL functions, constraints, suspension checks and grants authoritative. Pre-access backend code cannot safely honor the upgraded normalized-name constraints and must not be used for registration/rename or authority fallback. If a service-code rollback becomes necessary, prepare a compatible service release retaining those controls. Never restore the old database, remove access constraints, revive revoked sessions or reinterpret legacy cookies to roll back code. Legacy /admin remains separate until its separately reviewed final cutover.

## Explicit Artist associations and exact history approvals

Artist identity is separate from account names and public credit labels. The additive `member_artist_schema` version 1 stores opaque permanent Artist UUIDs mapped to exact reviewed catalog project keys, many-to-many account associations, exact revocable history references and audit/replay records. Existing catalog/queue owners retain all credit, music, events, outcomes and coverage truth. No name, email, alias, browser capability or signup can establish ownership. Artist association confers no Crew or Owner authority.

`GET /api/member/artists` returns only the current account's `{user:{id,name},session:{expiresAt},revision,artists:[{id,projectKey}],legacyReferences:[{id,artistId,reference}]}`. `GET /api/member/owner/artists?targetId=EXACT_ACCOUNT_ID` returns `{targetId,revision,artists:[{id,projectKey,approved}],legacyReferences:[{id,artistId,reference,approved}]}` including retained revoked rows. Responses are private, no-store and vary by Cookie. Each account is bounded to 100 retained links and 500 retained references.

`POST /api/member/owner/artists/action` accepts strict `{requestId:UUID,targetId,expectedRevision,action,...}` bodies: `approve-project` adds `projectKey`; `revoke-project` adds `artistId`; `approve-history` adds `artistId,reference`; `revoke-history` adds `referenceId`. Success returns `{ok:true,state:OWNER_TARGET_SNAPSHOT}`. A whole-account Artist revision protects concurrent reviews. Durable exact-body retries return the saved result; changed-body nonce reuse conflicts. Every operation and replay rechecks the genuine live verified, unsuspended Owner in the transaction. Approval also requires a verified active target account; history approval requires its current approved Artist link. Revocations retain the prior records, and revoking an Artist hides its references from the Member projection immediately on the next read.

Reference unions are exact native `{kind:'native',sessionId,trackId,fingerprint:SHA256}` or historical `{kind:'historical',bundleDigest:SHA256,recoveryTrackId}`. The site Owner bridge must verify selected current catalog/source proof before calling the private service. The service validates structure and account authority; it cannot infer source ownership. Readers must revalidate exact source proof each time, and source records remain owned by the existing queue/evidence stores. Factual signed-in submission ownership survives Artist revocation.

After Owner merge, retain a new private recovery checkpoint and run the existing explicit migration before deploying compatible service code. Artist migration is transactional and idempotent, preserves access schema version 1 and all existing auth/mail state, and creates no grants or history backfill. Normal startup only checks readiness and fails closed on a missing/incomplete Artist schema. Keep the upgraded constraints and current database during code rollback; never restore an older database to roll back grants or sessions. This source alone does not imply production activation.
