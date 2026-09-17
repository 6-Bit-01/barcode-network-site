# BNL Broadcast Ballads v1

## Track story and people

The public Ballad card now includes About the track, BNL's inspiration, People in
the lyrics, and People & moments behind it. BNL supplies these optional
`linerNotes` strings alongside lyrics/Style in the same generation call. Inspiration
is a short first-person note about the broadcast and creative direction; lyrical
mentions and inspirations remain separate from recording credits. Search includes
the released story and people. Empty fields do not produce blank public sections.

The workspace's Track story & people section loads notes for the confirmed take's
saved version, or the latest draft when no take is chosen. The producer can choose
another saved version, edit four optional fields, and click Save track story.
This uses the authenticated `saveLinerNotes` action with `versionId` and
`linerNotes`; each field is bounded to 1,500 characters and the existing optimistic
document revision applies. It stores overrides in optional `linerNotesByVersion`.
Saving notes neither changes lyrics/audio nor queues a model request. Existing
songs can receive manually entered notes without regeneration. Unsaved story edits
participate in the workspace's existing dirty-state protection.

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
- `Save directions` keeps the show’s notes for later. `Generate draft` saves and
  uses the current directions to write lyrics and Style in one action; after a
  saved version exists it reads `Generate new draft`. `Save edits` preserves
  producer text changes, while `Polish saved draft` requests one light revision.
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
show ID/date, kind (`generate`, `polish`, `edit`, `restore`), expected `baseVersion`,
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

The catalog is creative publication history, never evidence for facts, show events,
Journal, canon, memory governance or a source dossier. No new fact memory adapter
is registered.

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
