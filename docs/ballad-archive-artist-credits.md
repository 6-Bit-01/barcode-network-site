# Broadcast Ballads and artist credits

## Agreed scope

- Keep each published Ballad with its Broadcast Archive show card. Make the recording, lyrics, story and linked artists easy to open there. Old Ballad links must land on that show.
- Treat the discography as BNL’s body of work and the show card as the broadcast record: separate views of one published release, linked both ways. Hub links to the discography; Terminal provides music navigation. Avoid repeated promotional copy in the Hub, Terminal, Database and Archive.
- Autofill useful Ballad profile suggestions while preserving saved choices and explicit decisions to leave a name unlinked.
- Preserve full artist names such as AI/ML Music and 6 X Bit. Punctuation alone is not an identity decision.
- Trust explicitly entered primary/featured credits. A primary public submission establishes an artist card; a featured-only credit does not. Playback evidence still owns played-history counts.
- For ambiguous combined entries, start with the full name, then consult known complete names, corrections and prior catalog evidence. Offer a likely interpretation without another approval gate. Keep the original entry and correction history.
- In the submission form, collaboration markers trigger an optional red suggestion to move the remaining names to the collaborator field. Offer Keep as one artist; preserve existing collaborators; allow undo; never block submission on that suggestion.
- Allow administrators to correct a split, set primary/features, link an alias or merge duplicate labels, keep identities separate, and undo corrections. Song tagging does not itself merge identities.
- Owner-confirmed historical interpretation: SKELLA is primary and EXIDA is featured for SKELLA x EXIDA. Do not infer ownership from a TikTok handle.
- Extend queue-owned revisioned storage and public projections, preserving private-session, payment, upload and BNL authority boundaries.

## Implementation status

Artist credits and Archive integration were merged in #440. The discography correction below follows the owner’s clarification of how his body of work differs from a show record.

- Credit decisions are attached to queue entries, with their original wording and reversible correction history. Admin edits use the existing fenced queue revision and durable recovery snapshots. A bulk correction can be undone as a group.
- The full name is retained when catalog evidence is absent or conflicting. Explicit whole-name decisions take precedence. Legacy combinations can resolve to a known primary artist, with `source=inferred`; this is a catalog interpretation, not verified ownership. AI/ML Music remains a whole name. SKELLA's solo submission supports SKELLA as primary in the historical SKELLA x EXIDA credit.
- Admin → Correct artist credits and the Ballad linking panel both open `/admin/artist-credits`. Set primary/features, keep a full name, or explicitly map an alias. Existing exact artist names win over retired aliases. Correction history preserves links when a label is renamed or restored.
- Accepted public primary submissions establish cards, including artists awaiting airplay. Show rosters, broadcast totals and Radio feature counts still require existing playback/host-finish evidence. Featured-only names link to an appearances view; they receive a card after a primary submission.
- Opening Ballad linking mode prefills a clear match. Saving also records reviewed names, including deliberately unlinked names, so reload does not reverse those choices. Saved tags remain version-specific and only go public on explicit publication.
- The Archive show card has a directly visible public player. BNL’s discography at `/bnl/music` presents released titles, artwork, dates, sound, credits and creative notes, linking to each show’s player. Show credits link to the corresponding discography entry. Hub links to Discography; Terminal’s `BNL MUSIC` opens it (`BNL BALLADS` remains an alias). `/radio/ballads?show=…` still opens the show; the old collection/search URL redirects to the discography. Both views use the existing public snapshot. No repeated Ballad promotion is added to the Database dossier.
- BNL's published-song metadata points to the same Archive show. Artist-memory records add a source-labelled `catalogCredit` interpretation while preserving their original provider/submission identity fields. This site change does not update the bot's separate Journal/Relay writer integrations.

## Verification and deployment

Original #440 validation: `npm ci`, `npm run check` (1,199 tests passed; zero errors and 36 existing lint warnings), `npm run build`, focused credit/catalog regressions, and desktop/mobile browser checks. Browser fixtures use local synthetic shows and intercepted APIs; they do not mutate production.

After merging, allow the normal Vercel deployment of `main` to finish. No bot/VPS restart, environment toggle or database migration is required.

1. Open the Radio submission form. Enter `SKELLA x EXIDA` with another collaborator already entered. Verify the red prompt, Move, Keep as one artist and Undo. Verify that continuing without accepting the suggestion works. Enter `AI/ML Music` and confirm it stays whole.
2. Open the published show's Ballad workspace → Song → Link artist profiles. Confirm AI/ML Music is one suggestion, SKELLA is selectable and clear matches prefill. Save only the choices you want. Leave one name unlinked, save and reload: it must remain unlinked. Published tags change only after Publish updated song.
3. Open Admin → Correct artist credits. Review the SKELLA x EXIDA record and the proposed primary/features. On a correction you intend to make, save and verify the original label/history, then use Undo last correction if you want to restore it. Concurrent changes must return a reload message while preserving typed edits.
4. Open the first song's show at `/radio/archive?view=shows&show=session_mtxnw08a_k9epo`. Check that the existing audio player is immediately visible. Open Lyrics, story & credits and verify the reviewed profile links. Follow BNL’s discography link and confirm it reaches the corresponding release. Shows without a released song should have no Ballad panel.
5. Open the former `/radio/ballads?show=session_mtxnw08a_k9epo` link. It must land on the same Archive show. From BNL Hub, open Discography and verify the released title, artwork when supplied, date, sound and credits. Follow Listen on the show card back to the same recording. `/radio/ballads` and Terminal’s `BNL MUSIC` / `BNL BALLADS` should lead to the discography; the Database should retain its normal Hub link.
6. Confirm public `/api/queue/stats?view=played` still has the expected broadcast roster/counts and excludes private sessions. Newly visible primary cards may have zero played tracks; featured-only names must not be indexed as primary artist cards.

Rollback: revert the PR and redeploy through Vercel. Existing published audio and lyrics are unchanged. Original submission labels remain intact; additional credit decisions/history and reviewed-name fields are optional stored metadata. Reverting the code restores the old projection and navigation; it does not delete those correction records.
