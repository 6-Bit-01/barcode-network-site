# BNL Broadcast Ballads v1

## Track story and people

The public Ballad card now includes About the track, BNL's inspiration, People in
the lyrics, and People & moments behind it. BNL supplies these optional
`linerNotes` strings alongside lyrics/Style in the same generation call. Inspiration
is a short first-person note about the broadcast and creative direction; lyrical
mentions and inspirations remain separate from recording credits. Search includes
the released story and people. Empty fields do not produce blank public sections.

The workspace has one working version. Broadcast selection and after-show automation
stay at the top, followed by a large selected-show heading, Write with BNL,
Version history, and Song / Recording / Publish. Generate new song is always
visible. Optional creative direction is collapsible. Version selection loads
lyrics, Style, catalog notes and story together and sets the upload's version.
Polish this version targets the viewed saved version. Generation, polish and edit
receipts automatically select the new saved version; pending/failed polls keep the
current selection. Unsaved song/story edits require an explicit discard when
switching versions; generation and publishing wait for saved changes. Pending
uploads retain their exact version and block version switching.

The four story fields remain optional and limited to 1,500 characters each.
Save track story uses the authenticated `saveLinerNotes` action and optimistic
revision check. It stores `linerNotesByVersion` overrides without a model call.
Save other changed sections before Save edits, which queues a new canonical version.
The Recording stage lists takes for the working version; archive/replacement
controls stay collapsed. Publish previews the confirmed recording's saved title,
lyrics, Style, story and credits, and explicitly flags a different working version.
Publishing remains explicit and disabled with unsaved changes.

The Next step panel and sticky action bar identify the first unfinished prerequisite
in plain language. Publish lists every remaining prerequisite beside its disabled
button, with direct Save / Confirm upload actions or a focused jump to Recording.
Other changed sections save before a canonical song edit; the guide then waits for
BNL's receipt. Failed saves retain the edits and their prerequisite. An uploaded
file must be attached, and a saved take must explicitly be chosen with Use this
recording. A Suno link is release metadata, not an audio attachment. Pending uploads
also keep Publish disabled, even when an older recording is already confirmed.
Once ready, the guide opens the exact release preview; it never publishes or starts
a model request automatically. The Song, Recording and Publish tabs remain available
for normal browsing. The displayed recording preview is labeled Release preview
rather than claiming readiness while other steps remain.

Artist linking is an optional mode beneath Track story & people. It suggests name
chips from BNL's People in the lyrics text, then ranks similar Archive labels in a
dropdown beside each name. An operator must choose every match. Search, Add a
missing name or alias, and Add an artist card cover names not recognized in prose
and cards without an inline mention. Reopen the mode to change a match or choose
Leave this name unlinked; standalone cards have Remove controls. Save artist links
is a first-class prerequisite in the publication guide when selections are dirty.
Switching versions asks before discarding unsaved links. Publish also offers Edit
this recording's artist links, selecting the exact recording's version first.

The selectable catalog is a minimal projection of existing public Archive artists
with tracks in eligible archived broadcasts: only normalized `projectKey` and
`projectLabel`. It excludes combined listings with and, with, x, vs, feat/featuring/ft,
ampersands, plus signs, commas, slashes, semicolons or pipes. For example, Mr Nice
Guy and LostMarbles is omitted while the individual profiles remain selectable.
This filters the Ballad picker only; it does not rewrite the Archive or merge
artist identities. Similarity is a suggestion, never an automatic identity claim.

Authenticated `saveArtistLinks` validates at most 50 choices against that catalog
and uses server-owned labels, ignoring supplied URLs/extra fields. Stale revisions,
unknown/combined profiles and wrong-show versions fail without saving. Optional
`artistLinksByVersion` holds reviewed `{name, projectKey, projectLabel}` records;
an empty name represents a standalone artist card. Legacy documents remain valid.
Edit/restore receipts inherit their explicit source version's reviewed links;
Generate/Polish do not infer or copy identity matches. The bot cannot supply reviewed
links through its generated version payload.

Publish validates destinations again and snapshots only the confirmed recording's
saved links in `published.artistLinks`. Saving/removing links does not update an
already-public song until Publish updated song. Archive preserves the released
links; replacement uses its own version. Public story and lyrics render literal,
whole-name links plus deduplicated artist cards using the same Archive destination
as the Deck. Text remains escaped, lyrics are not rewritten, and public search
includes only released names/profile labels. Draft links stay private. No new artist
store, profile/account authority, BNL prompt or memory connection is introduced.

Publish snapshots only the confirmed audio version's story in `published.linerNotes`.
Saving later notes or generating another draft cannot change public text until an
explicit Publish. Archive retains that published snapshot; an unpublished selection
archives its saved story. A replacement resolves its own version's notes and remains
private until Publish. Producer note overrides follow edit/restore receipts, while
generated/polished drafts get their own story. Public projection includes only the
four known text fields; draft notes, producer feedback, and raw output stay private.
Legacy documents and receipts without the new optional fields remain valid; legacy
publications show no story until notes are saved and the release is republished.

The paired bot prompt revision is `broadcast-ballad-2`. Both deployment orders are
compatible and require no migration, new credential or provider. Deploying does
not regenerate existing songs or publish changes. Validation covers receipt/edit/
restore compatibility, version-bound publication, archive/replacement, authenticated
Save with stale-write rejection, public rendering/search, and escaped text.

A show has one song slot. The first confirmed audio selection locks that slot.
Another take cannot silently replace it. `Archive song` preserves the old audio,
its exact prompt version and release details, removes the public release and clears
that slot. `Archive & replace` does the same archival and assigns the replacement
in one optimistic Redis write. A replacement remains private until published.
Draft revisions and unchosen audio takes are working history, not additional songs
occupying the show slot. Archived material remains available in the admin workspace.

## Ownership and workflow

- Existing public Broadcast Archive eligibility owns show identity and visibility.
  Only finalized public broadcasts qualify; rehearsals, simulation and private
  queue records do not become Ballads. Queue production gating is unchanged.
- BNL's existing SQLite database owns immutable lyrics/Style revisions and command
  receipts. This site's Redis stores that projection, producer controls, audio
  attachments, the single selected song and public release snapshots.
- Admin workspace: `/admin/ballads?show=<sessionId>`, linked directly from the
  admin dashboard and the existing finished-session review. Confirm show selection, save direction/feedback,
  generate or edit lyrics, copy lyrics/Style separately, save the exact prompt
  version used in Suno, upload MP3/WAV, confirm attachment, confirm the song, publish.
- Manual Save queues a canonical bot revision. The UI says queued until the bot
  returns its durable receipt; it does not pretend the canonical save completed.
  Reload does not overwrite dirty local fields. Draft edits, presentation edits
  and automation choices have explicit Save controls.
- `Save directions` keeps the show’s notes for later. `Generate new song` saves and
  uses the current directions to write lyrics and Style in one action. `Save edits`
  preserves producer text changes, while `Polish this version` requests one light
  revision of the selected saved version.
  Feedback appears once there is a draft to discuss (or existing saved feedback).
  Pending and failed requests identify the actual action; errors offer the matching
  retry button, with the operational code tucked into expandable Error details.
  Budget refusals identify the spending restriction and explain that Gemini was not
  called. They do not encourage immediate retries or change BNL’s spending policy.
- BNL makes one strong first draft. A producer can request one light polish.
  Neither operation invokes a judge or quality/rewrite loop. Original versions stay.
- Suno creation/selection remains manual. This feature neither signs into Suno nor
  calls an unofficial API. Optional model/settings/song URL and artwork URL are
  release details; the app hosts the uploaded audio using existing private Blob.
- Public collection: `/radio/ballads`, optionally `?show=<sessionId>` or `?q=...`.
  Entries credit BNL-01, play the chosen audio, and display its matching saved
  lyrics, Style, catalog notes, credits and production details. Unpublished raw
  drafts, feedback, source identifiers and private Blob URLs are not projected.

## Contract and persistence

`GET /api/bnl/ballads`, authenticated with the existing `BNL_API_KEY`, returns
`contractVersion: 1`, up to two pending `commands`, and `catalogVersions` selecting
accepted/public songs for BNL's creative history. Commands carry an immutable ID,
show ID/date, kind (`generate`, `polish`, `edit`, `restore`), expected `baseVersion`, optional `sourceVersion` for the viewed edit/polish source,
saved producer options and applicable content/restore target.

`POST /api/bnl/ballads` accepts a saved bot receipt: `showId`, `commandId`,
`outcome` (`complete`, `failed`, `pending`) and the complete immutable version or
safe error code. Versions bind their parent, ordinal, show, original output,
prompt version, source digest and content hash. Duplicate receipt delivery does
not create another version. Optimistic revision checks protect simultaneous
producer saves, receipt delivery and song selection. Failures preserve saved work.

Redis prefix: `barcode:bnl-ballads:v1:`. One document per show; config/baseline are
separate keys. There is no destructive migration and no additional database/provider.
Redis unavailability fails visibly; there is no unpersisted success fallback.
Audio uses `bnl-ballads/<showId>/...` in private Blob, separate from queue upload
cleanup. Upload confirmation verifies Blob metadata, type, size and exact show
prefix. Audio delivery reuses the existing byte-range response implementation.
Anonymous playback checks current public-show eligibility and the one published
song on every request. Archiving immediately removes that public access.

The catalog is creative publication history, never corroboration of show events,
Journal, canon, memory governance or a source dossier. `sections.ballads` in the
existing website read model exposes published title, artist, show identity/date and
public song link only. It reuses the request's queue snapshot and the public archive
eligibility filter. Missing storage produces an unavailable section and no-store
response. No draft, raw output, lyrics, feedback or private audio URL is included.
BNL renders this as release metadata with an explicit creative-authority boundary;
no new fact-memory adapter is registered.

## Automation

Automation defaults off. `Save automation` enables future finalized public shows
and captures already-finished show IDs as a baseline, so historical records are
not mass generated. A show date must also be no earlier than the day before
activation (UTC) to avoid auto-generating old historical imports. Existing shows
remain individually available for manual generation.

One stable automatic command per show is inserted through the same optimistic
store. Repeated polling, corrected show metadata, manual generation and archiving
a song do not trigger a second automatic song. The existing bot heartbeat polls
this control endpoint; generation runs separately from heartbeat/Discord work.
Publishing and replacement are always explicit producer actions.

## Validation and release

Focused tests exercise command replay, stale edits, wrong-show receipts, public
revocation, auth, automatic idempotency, immutable published prompts, the locked
song slot and atomic archival/replacement. Full `npm run check` and `npm run build`
are required. An isolated DOM harness checked the actual component's load, editing,
Save requests and archive/replace controls. The cloud browser could not open the
local preview, so visual browser acceptance remains for the review deployment.

Changed surfaces: `src/lib/bnl-ballads.ts`, `src/lib/bnl-ballads-store.ts`,
`src/components/BNLBalladWorkspace.tsx`, `src/app/admin/ballads/page.tsx`,
`src/app/api/admin/ballads/route.ts`, its `upload/route.ts`,
`src/app/api/bnl/ballads/route.ts`, `src/app/api/ballads/media/route.ts`,
`src/app/radio/ballads/page.tsx`, the existing finished-session review page and
`BroadcastArchive.tsx`, plus `tests/bnl-ballads.test.mjs` and this contract.

Release the paired bot/site PRs together after review. They reuse current Redis,
Blob, BNL key and bot website URL configuration; no credentials are added here.
Initially keep automation off. Verify the private workspace on one existing public
show, including copy, Save, upload, selection, archive/replace and audio seeking;
then save automation when ready. No live generation, real audio upload, production
activation or public publication was performed while preparing this change.
Rollback: switch automation off and revert the paired code changes. Keep Ballad
Redis keys, private audio and bot SQLite tables; no history deletion is necessary.

Unchanged: native queue behavior, payment/Stripe, show lifecycle, production gates,
Journal, Relay, factual memory, global Header/Footer/navigation and existing releases.

## Workspace deployment and rollback

Deploy the paired bot source-version support before merging/deploying the workspace.
Old clients remain compatible with the new bot. No migration, credentials, budget,
automation or publication setting changes are required. Revert the site first, then
the bot if needed; retain all stored songs, receipts and audio. Validation uses
isolated fixtures only. Owner acceptance after deployment: choose an older saved
version and verify all Song fields plus the Recording version; switch versions with
unsaved edits and cancel; inspect Publish's confirmed-version preview. A later
explicit Generate or Polish should open its receipt's new version automatically.
Publishing a real recording and public BNL interaction remain owner actions.

## Artist linking deployment and acceptance

This extension is site-only. Merge the reviewed site PR and confirm the normal
Vercel production deployment; no bot/VPS restart, environment change or migration
is required. Existing released songs remain unchanged until explicitly republished.

1. Open a saved version in `/admin/ballads`, then Song → Artist linking → Link
   artist profiles. Names should have dropdowns with suggested individual profiles;
   combined entries such as Mr Nice Guy and LostMarbles must be absent.
2. Choose a profile, add a missing alias or standalone artist card if needed, and
   inspect Preview artist card. Unsaved choices must block Publish; switching
   versions must ask before discarding them. Save artist links and reload to verify
   persistence. A failed/stale save must keep the local choices.
3. In Publish, verify the links/cards belong to the confirmed audio's version. Edit
   this recording's artist links must open that version's linking mode. Merely
   viewing another version must not change the release.
4. When ready, explicitly Publish updated song, open its public Ballad, and follow
   a linked name/card to the same Archive artist destination used by the Deck.
   Subsequent changed/removed links must remain private until another Publish.

Focused regressions cover catalog filtering, similar-name suggestions, server
validation/auth/concurrency, edit/restore inheritance, generated-payload isolation,
publication/archive snapshots, escaped whole-name rendering and public search.
The actual workspace was exercised with isolated browser fixtures at desktop and
mobile widths, including failed saves, manual aliases/cards and later removal.
No production generation, upload, profile tagging or publication was performed.
Rollback: revert the site PR and redeploy. Retain existing Ballad documents and
audio; the optional link fields need no data cleanup.
