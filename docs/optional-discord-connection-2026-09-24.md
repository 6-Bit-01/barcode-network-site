# Optional verified Discord connection

This is the first bounded implementation in the approved connection and
publication-announcement package (original items 11 + 1). It implements website
verification and future-submission attribution. BNL announcement generation,
recipients, opt-in rules and automatic/manual triggers are the next coordinated
step, not implemented or activated here.

## Existing owners

The website's authentication boundary holds the private connection in the
existing shared Redis infrastructure (`barcode:auth:discord:v1:`). The queue
keeps only a revocable reference beside its existing private submitter fields.
There is no second queue, artist catalog, BNL identity/memory store, scheduler,
publication path, provider or database service. The existing bot continues to
own Discord member resolution and delivery. Known source-backed Discord member
IDs remain useful without requiring every member to connect through the site.

Verification proves control of a Discord account. It does not prove ownership
of a submitted artist/TikTok label, grant staff access, merge identities, change
submission allowances, or establish canon. A later BNL consumer must resolve
the exact current connection reference, check the member in the correct guild,
retain submitter versus artist attribution and revalidate at send time.

## Flow and private data

- The public Broadcast Deck offers an optional connection panel below the show
  content. It opens `/connect/discord` in another tab, preserving the Deck and
  existing player, with a return link to the Deck. It remains available between
  shows, is hidden when unconfigured, and is not added to the private test Deck.
- The submission form has no Discord connection link, panel or status request.
  People can submit first and connect later from the Deck; only submissions made
  after connecting can receive the verified reference. There is no backfill.
- Discord's authorization-code flow requests only `identify`. A 256-bit state
  is bound to a separate 256-bit HttpOnly browser cookie, valid ten minutes,
  and atomically claimed before exchange. New attempts supersede old ones.
- The server reads `/users/@me`; it stores only ID, username, verification and
  expiry times and a random connection generation. No email, display name,
  OAuth access/refresh tokens or authorization codes are retained. Token
  revocation is attempted immediately; no further use or refresh is scheduled.
- The connection expires after 180 days. Disconnect deletes the private record
  and invalidates in-flight attempts. It remains available when activation is
  off. Another account/verification cannot reassign earlier submissions.
- Only future real public-production submissions receive a reference, derived
  server-side from the verified browser cookie. Request-body IDs/handles never
  establish verification. Rehearsals/internal tests are not attached. Unconnected
  intake and optional storage failure preserve normal submission behavior.
- Public queue, show/artist history and ordinary BNL projections omit the
  reference. Disconnect removes its target; the opaque old reference in existing
  private queue backups cannot independently identify a Discord account.

There is no bulk backfill, automatic artist binding, unsolicited message,
mention subscription, new bot command or change to existing BNL memory.

## Configuration and deployment boundary

The implementation is off unless `BARCODE_DISCORD_CONNECTION_ENABLED` is exactly
`true`, `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are present, and
`NEXT_PUBLIC_SITE_URL` is a valid canonical HTTPS origin. It uses the existing
shared Redis credentials. Production configuration has not been changed.

After owner approval, configure the existing Discord application's OAuth2
client credentials server-side and register the exact canonical redirect:
`https://www.barcode-network.com/api/discord/connection/callback` when that is
the configured origin. Do not use a bot token as the client secret. Each preview
needs its own exact registered/configured origin. Keep secrets out of source.

Merge through the normal website PR/Vercel workflow. No bot/VPS deployment,
data migration, queue gate activation or Discord message is needed for the
default-off code deployment. Actual account authorization and Redis operation
remain a separate, supervised integration check after configuration approval.

## Focused acceptance

1. With the feature disabled, verify ordinary link/upload intake and the
   existing player. With it enabled, verify intake still has no Discord prompt
   or connection-status request. It remains focused on submitting music.
2. Once explicitly configured in an isolated preview, open the connection tab
   from the public Broadcast Deck, cancel Discord authorization, and return to
   the Deck. Check live and standby layouts, including narrow mobile screens.
3. Verify a test Discord account, confirm the correct username, and submit a
   future test fixture through an isolated local production-mode fixture. Keep
   private rehearsal records out of public production and canonical BNL data.
4. Repeat a callback, start a second attempt, disconnect during exchange, and
   switch accounts. Only the current exact connection can resolve; prior track
   references never switch people. Verify expired/missing state fails closed.
5. Confirm anonymous public queue and BNL/archive outputs contain no connection
   reference or Discord ID. Disconnect while activation is off still works.

Rollback: disable the independent connection flag or revert this PR and
redeploy. Existing music, queue, payment, Journal, Ballad and BNL behavior remain
under their current owners. Existing nullable references require no migration;
the flag also disables attachment/use through the exported connection adapter.

Primary protocol reference: https://docs.discord.com/developers/topics/oauth2
and https://docs.discord.com/developers/resources/user#get-current-user.
