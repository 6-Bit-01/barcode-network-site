# Own-song replacement and selection cutoff

The owner paused today's Discord connection test, publication announcements,
and notification safeguards and moved to the approved queue self-service
package (original plan item 10). Those three holds are not a renumbering or
cancellation of the original fourteen-point plan. The optional Discord link
remains on the public Broadcast Deck and dedicated connection page.

The existing queue already supports adding another song. Its existing intake,
three-song limit, cooldown, 44 accepted slots and payment rules remain the
authority. The new **Your songs** section reuses that add flow and lets a
submitter edit an eligible mid/back-of-queue song's title, featured artists and
private host note, optionally replacing its link or MP3/WAV source.
It does not add another queue record or charge for replacement.
This is submitter self-service: it adds no host editor, correction task, review
queue or approval step. An eligible save applies directly to the submitter's
own song after the existing server checks.

## One saved edit per track

The September 24 follow-up limits each track to **one committed submitter
update**, shared across title, featured artists, private note and audio. A
details-only change uses the same allowance as a media replacement. The form
warns: “You can update this submission once. Review your title, features, note
and audio before saving.” Eligible songs show **1 edit available**, then
**Edit used** after a change is saved.

The private `submitterEditUsed` marker is stored on the existing queue record
in the same fenced commit as the changed song. It is independent of
`replacementRevision`, which also protects against other changes. Request-body
flags cannot reset it. Another tab, fresh revision, process restart, queue move,
credit-history operation or late upload callback cannot restore the allowance.
No host reset or approval workflow is added.

Unchanged titles/notes, equivalent feature formatting and the same media URL
return a no-change result without a write, revision increment, new history
event or consumed allowance. Upload completion alone retains the file for
cleanup but does not consume the edit. Validation/selection/storage rejection
before commit also leaves it unused. If persistence succeeds but the response
is lost, the saved edit remains used; refreshing reads that truth. A confirmed
save also disables the local action even if the subsequent refresh fails.

The allowance applies from this policy release. Existing owned songs start
with one allowance if still eligible; prior revisions are not retrospectively
charged because they do not reliably distinguish submitter edits. No data
migration or retroactive ownership claim is performed. The existing safety
cutoffs always remain authoritative.

## Selection rules

The owner explicitly required Now Playing, Next in Line and Wheel Chosen songs
to lock, including edits racing a spin or a transition into Next in Line. The
September 24 follow-up also requires replacement to close before selection:
anything that could approach playback within ten minutes is too late. This is
an optional convenience for the middle/back of the queue, not a last-minute
change service.
Opening an edit form or starting an upload never reserves a song or delays the
host. The server decides eligibility again immediately before committing.

The safety guard protects the first three upcoming songs **in each lane** and
any song with at most 600 seconds of known music ahead in that lane. It uses
the existing queue ordering; it does not change routing or the public ETA.
Now Playing's remaining time, other lanes, paused Priority, host talk,
pre-show time, commercials and unconfirmed Wheel work add no editing time.
Unknown/estimated durations also add no safety time. This deliberately closes
early when timing is uncertain, including during pre-show or paused routing.
It cannot predict an arbitrary host pull, future winner, removal or gifted
skip. Those operations remain authoritative, with the same final atomic check.

The near-playback cutoff reuses the private permanent replacement lock. Normal
queue mutations retain it even after demotion or a move to the back. Read-only
normalization uses a stable existing session timestamp; polling adds no write.

| Situation | Result |
|---|---|
| Mid/back waiting song, original browser, outside the safety cutoff, edit unused | One combined update allowed. |
| One update already saved | No more edits, including requests with a fresh revision. |
| First three upcoming songs in its lane, or 10 minutes or less of known music ahead | Permanently closed, even if a long ETA, pre-show countdown or commercial makes it appear safe. |
| Waiting paid/pending Priority or Signal Hold song | Replace only outside the safety cutoff; existing purchases and checkout receipts remain attached. |
| Intake closed/full, artist at three songs or on cooldown | Replacement can proceed; adding another song still follows all admission rules. |
| Next in Line, loaded/Now Playing, paused, stalled, or playback error | Locked. Loading is the cutoff; audible playback is not required. |
| Next in Line displaced by Priority or manually returned | Stays locked; the host may have prepared that version. |
| Wheel Chosen waiting behind other songs | Locked immediately, even before Next in Line. |
| Selected song demoted, held with Signal Hold, or returned/restored | Selection lock persists. No automatic public unlock. |
| Wheel ready or re-encrypting, before a spin | Otherwise eligible mid/back songs remain editable. |
| Wheel spinning or awaiting host confirmation | Candidate songs pause edits, including late eligible intake. No winner is revealed through edit availability. |
| Artist has multiple candidate songs | All participating songs pause; host confirmation permanently locks the chosen song and releases the others. |
| Confirm, Winner Not Here, cancel, clear or full overlay reset | Release the temporary hold after the overlay write succeeds; permanent selection locks remain. |
| Wheel store update/reset fails | Leave edits paused. Retry the existing host Cancel/Clear action after storage recovers; no automatic timeout unlock. |
| Completed, removed, archived, ended or different session | No replacement. A restored previously selected/finished song remains locked. |
| Slow media lookup/upload races the cutoff, a removal ahead, host load, paid skip or selection | Queue change first: reject the save, keep the original song. Replacement first: select the committed new song. |
| Two tabs, duplicate click or delayed retry | One expected revision can commit once; a stale request gets 409 and must refresh. |
| Response or refresh lost | UI does not promise an unconfirmed save; reload from the server before retrying. |
| Other browser/device, cleared cookies or pre-release submission | No automatic ownership claim. Use the original submitting browser with its ownership cookie. |

## Existing authority and retained data

A server-generated 256-bit HttpOnly cookie is hashed into the private queue
record. Artist names, TikTok handles, the older localStorage submitter label,
Discord identity, and request-body ownership fields do not authorize edits.
Mutating browser requests require a matching Origin. Cookie-bearing snapshots
are private/no-store and expose only that browser's safe titles, IDs, revisions
and eligibility reasons, plus current featured credits and that owner's private
submission note. Public queue tracks, Deck, Archive and BNL projections
never contain the capability, selection lock, pending/retired upload URLs or
payment records. Discord remains independent and default-off.

Replacement preserves the entry ID, original accepted slot/time, lane/order,
primary artist credit and corrections, submitter/contact/Discord references,
Priority/Signal Hold state and Stripe idempotency records. The submitter may change
title, features and the private host note. Optional media replacement also changes
source/provider metadata, duration and file fields; details-only edits keep them
and the original legal acceptance intact, without a new upload/provider lookup. Existing duplicate checks,
Apple Music rejection, MP3/WAV/100MB/six-minute limits and legal acceptance
apply. A replacement cannot start a payment or grant Priority.

The existing serialized, fenced queue mutation boundary protects final
replacement, routing and Wheel commands. Full overlay-state writes share that
boundary because they carry Wheel state; independent player-sync heartbeats
keep their separate one-write path. Slow provider lookup and browser file
transfer occur outside the fence. The Wheel edit hold is private session data
in the existing queue, not a second selection system.

Superseded uploads stay with the queue's existing private cleanup inventory.
The Blob SDK's authenticated completion callback also records replacement
uploads that finish after selection or browser abandonment. Acceptance still
requires the final replacement guard. Active-show audio is retained; archived
cleanup retains the recovery window and records deletion by exact file URL,
never by the reused song ID. A late upload callback cannot overwrite the
current source. Partial uploads remain under the existing Blob provider's
multipart lifecycle.

A `track_replaced` show-log event records a media change; a
`track_details_updated` event records a public title/credit change. Note-only
edits produce no public event and no note content enters the Deck, Archive or BNL. Original
submission events retain their original titles and the new event has the new
title. Counts remain one accepted submission. Current queue/catalog readers
see the latest song; existing BNL consumers can ignore the additive event type
without granting it new announcement or memory authority.

## Verification and deployment

### September 24 follow-up: price display, intake and rehearsal visibility

PR451 was still open and unmerged when the owner reported a missing replacement
button. The normal production site therefore did not yet contain this feature.
Rehearsal is supported: an integration regression uses the signed current
rehearsal cookie plus the separate submission-owner cookie, with production
presentation disabled, and successfully replaces the fourth song behind three
known four-minute songs. A rehearsal invitation alone does not own a song.
The action is in **Your songs** above the queue, not on every public track card.
Older submissions without the new ownership cookie cannot be claimed after
deployment; public ETA over ten minutes does not override the safety guard.

The owner subsequently authorized featured-artist and note editing and merging
PR451. **Edit / replace song** opens with **Keep current audio** selected.
Title, featured artists/collaborators (200 characters, up to 20 names), and the
private host note (500 characters) prefill from the original-browser read model.
An empty optional field clears it; omitted API fields preserve it. Details-only
saves require no link, file or repeated legal checkbox. Replacing media retains
the existing upload/link validation and legal acceptance.

Primary artist identity cannot be changed by this editor. Feature changes
preserve existing primary/alias decisions and append to existing credit history.
The edit revision prevents stale drafts from overwriting a newer saved version.
Details and media saves share ownership,
Origin, rehearsal access, final fenced checks, permanent cutoffs and Wheel holds.
No draft or upload reserves the song. Failed/stale saves leave the accepted
version in place. Public events preserve original submission titles and counts;
note-only changes remain private even in the activity history.

Show Management previously displayed a disabled new-session form with its own
default prices above the current show's independently saved settings. It now
hides those unused controls while a session exists. Current-session price
inputs preview immediately, remain editable before enabling Signal Hold, and
retain typed values during server refreshes. Save applies them; Cancel returns
to the saved values. Intermediate responses during Save cannot reset the draft.

Intake now offers **Free queue + Signal Hold** when enabled, with the current
saved price, absence-only/one-show disclosure and existing Signal Hold Terms.
It is a choice alongside Free and Priority, not an extra queue lane or bundled
charge. The song must be accepted and confirmed in the queue before opening
the existing Signal Hold checkout. The next-two cutoff, original submitter
check, checkout-owner proof and signed paid webhook remain authoritative.
There must be at least two upcoming songs ahead of a new submission before
the option is available; Now Playing does not count. Priority may be bought
separately from the accepted track. Failed/uncertain checkout keeps the accepted
song and instructs the submitter to check its payment state, not submit again.

Focused follow-up deployment checks: in a private rehearsal, type 725 cents
and verify $7.25 immediately, Cancel and verify the saved price returns, then
save the intended price and verify it on intake. Check a fresh fourth owned
song behind three known four-minute songs in the same browser. Select Signal
Hold during intake and verify one accepted song followed by the existing
checkout. Cancel checkout and confirm the song remains without protection;
verify pending is not active. Use an isolated Stripe test setup for payment
confirmation; no real payment is required merely to check this UI update.

Run `npm ci`, `npm run check`, and `npm run build`. Focused behavioral coverage
is in `tests/queue-own-song-replacement.test.mjs`; Wheel routing, playback,
cleanup, payments and public/BNL projection suites remain required.

After owner review/merge, let the normal website Vercel deployment reach Ready.
No new environment variables, schema migration, bot deployment/restart,
production-gate change, Discord activation or public announcement is required.
Use an isolated non-production store or the normal authorized private rehearsal
for the following focused evidence, without mutating a live show for testing:

1. Submit a new link from browser A behind at least three known four-minute
   songs in the same lane. Save the unchanged form and confirm the allowance
   remains. Edit title, features and note with Keep current audio, then reload
   and verify **Edit used** and rejection of a second save. Capture the same
   track ID/count, unchanged audio/duration/purchases, and the current private
   note on Admin Queue Control. Use separate fresh tracks to verify clearing
   optional fields and replacing media in their one permitted update.
   Public queue/Deck/Archive/BNL must never expose the note. Browser B must have no edit
   authority, including when using the same typed artist/handle.
2. Verify the first three upcoming songs are unavailable. With three known
   durations totaling exactly 600 seconds ahead, verify replacement is closed;
   with 601 seconds ahead on a fresh song, verify it is available. Open an edit
   on an eligible song, remove a song ahead, then try Save: capture 409 and the
   unchanged original. Move it back and verify it stays locked. Separately put
   an eligible song in Next in Line, then try Save. Capture 409,
   unchanged selected source, and the locked UI after refresh. Return it and
   confirm it stays locked. Repeat with a completed upload finishing late.
3. Use two songs for one Wheel entrant. During spin and pending confirmation,
   edits must be paused. Confirm one: chosen stays locked, sibling unlocks
   only if still outside the safety cutoff. Cancel a separate spin: otherwise
   eligible unselected waiting songs unlock.
4. Verify Add another song still enters the existing intake and its normal
   limits apply; replacement does not change accepted count or payments.
5. Check the Deck history shows original submission plus public details/media
   changes, with one submission count. A note-only change must add no public
   event. Open the song in two tabs, save in one and confirm the old
   draft gets 409 without overwriting the saved version. Keep upload URLs and ownership
   proofs out of evidence shared publicly.

Retain deployment URL/commit, session/track IDs, HTTP statuses, before/after
counts and a short desktop/mobile capture. No repeated broad audit or forced
Discord/bot retest is needed. If rollback is required, revert this website PR
through the normal PR/Vercel flow; retained optional private queue fields are
compatible with the prior code, and no history/audio deletion is required.

Paid after-hours admission, extra songs beyond three, and admission beyond 44
remain the next separate package. Price, placement, cutoff, extra capacity and
unsuccessful-payment rules still need owner decisions; this change does not
infer or activate them.
