# BARCODE site music player

The Archive show card and BNL’s discography both play the same published song.
Pressing Play starts one audio element in the root layout and opens the BARCODE mini-player.
The same recording and position survive internal navigation, artist links,
discography searches and browser Back/Forward. Returning to the show exposes
controls for the same player; it does not start a second recording.

## Controls and presentation

- Black/green BARCODE panel with Oxanium, release artwork or a barcode fallback,
  title/artist, an explicit dated Show link, play/pause, seek, volume and mute.
- Song info opens a short, dismissible popover with the published description,
  genre tags, credits and links to the originating show/full story. Escape, outside
  click and Close dismiss it. A different song or page closes the old popover.
- Free download streams the same published recording for listening. Its filename
  is `BARCODE_RADIO_<Song_Title>_<YYYY-MM-DD>.<mp3|wav>`, using the show date,
  published title and delivered format. The attachment endpoint supports ranges
  and UTF-8 filenames, sanitizes unsafe characters, and rechecks public eligibility.
  It does not convert the audio or change embedded audio metadata.
- Mobile starts compact; Expand exposes seeking and volume. Measured bottom space
  and safe-area padding keep the document's final controls reachable. The normal
  header/menu remain above the player.
- The animated bars indicate playback activity, not measured frequency levels.
  Reduced-motion preferences disable the animation.
- Loading, unavailable media and blocked playback are explicit states. Retry
  requires Play; failed media never starts a generation or publication request.
- Close stops playback, removes the media source and dismisses the dock.
- Supported browser/OS media controls get the song metadata and play/pause/seek
  actions. Volume control follows browser/device support.

## Audio ownership

`SiteAudioProvider` owns one `SiteAudioController` and one media element. Pages
request a public recording through `BalladPlayback`; they do not own audio tags.
Selecting another song replaces the source. A pending request cannot overwrite a
newer selection or reopen a closed player. Ordinary page updates never load the
source again. No playback starts until the visitor requests it.

When an audible native audio/video player starts, the site song pauses. Starting
the site song pauses other audible native media in this document. Muted decorative
media does not interrupt it; unmuting active native media does. Giving an external
iframe focus pauses the site song as a courtesy. Cross-origin embeds and other
browser tabs cannot be fully controlled by this player.

The mini-player pauses and hides on `/admin`, `/overlay`, `/obs`, and
`/world/playtest` (including descendants). Returning to public pages requires Play
to resume. It neither operates nor changes the broadcast, OBS or game audio.

Playback state is in this tab's current page session. A full refresh, external
navigation or closing the tab ends playback. The local playlist survives a refresh
in the same browser; audio never resumes automatically.
The Radio queue entrance retains its existing intro, Skip and seen-session
behavior, using client navigation so the music can continue. Checkout redirects
and external destinations retain their existing behavior.

## Published authority

Track metadata comes from the existing public release. Playback continues through
`/api/ballads/media`, which retains its public eligibility and publication checks
and range responses. The playlist persists only bounded public show/audio references and a display title
in browser storage. It creates no new audio store, copied recording, permission,
provider, generation, publication or BNL-memory behavior. As before,
already-buffered public audio is not remotely revoked; later media requests still
check current eligibility.

This establishes a shared listening interface for existing recordings. Live Radio
streaming, stream-specific controls and a schedule remain separate future work.

## Verification and deployment

Run `npm ci`, `npm run check`, and `npm run build`. Controller regressions cover
explicit startup, pause/resume, replacement, stale promises, playback errors,
bounded controls, ended replay, operational routes, Close and public metadata.
Browser acceptance exercises actual test audio across navigation, Back, search,
artist links, mobile controls, native media arbitration and error/close handling.
Temporary fixture routes/audio are excluded from the published tree.

After merging, wait for the normal Vercel Production deployment of `main` to be
Ready. No VPS restart, migration, environment change or republishing is required.

1. Open the published show’s Archive card or its Discography entry and press Play. Confirm the mini-player
   appears, identifies the released song and plays the existing recording.
2. Use site links to visit BNL Hub, Discography, Database and an artist profile;
   use Back. Confirm the song continues without restarting. Its title returns to
   the source show; the show card and dock control the same playback.
3. On a phone, expand/collapse controls, seek and pause/resume. Confirm bottom
   content remains reachable. Close must stop the music and remove the player.
4. Start it again, then enter Admin: it must pause and hide. On returning to the
   public site, it must wait for Play. A full refresh must not autoplay.

Rollback: revert this PR and redeploy. Published songs and saved artist links need
no changes; the preceding version's inline show-card player returns.

5. Open Song info, check its show/date and close with Escape. Use Free download
   while playing: audio must continue and the filename must match the published
   title/show date. An archived or unpublished recording must remain unavailable.

## Local playlist — priority 8, first slice

+ Playlist on each public Ballad adds that exact recording without starting audio.
The dock's Playlist panel shows ordered songs and Up next; each song has Play,
Move up/down and Remove controls. Duplicate recordings are not added twice. The
first slice holds up to 100 published Ballads in one browser-local list. It does
not require accounts or add shared/cross-device lists. Header/navigation, show
submissions, payments and host playback are outside this change.

Previous/Next and supported OS media controls use the current playlist order.
A listed song's natural end advances to its successor; the final song stops.
Playing a song outside the list does not start that list afterward. Errors and
unavailable recordings stop with a message; they are not silently skipped. Next
lets the visitor explicitly continue. Reordering/removing a different entry does
not restart the current recording. Removing the current song stops it; Clear
stops playback and empties the list. Close stops and hides the player while
retaining the saved list. + Playlist (including In playlist) shows the dock again.

Refresh restores references only, without loading audio. The existing public
catalog refreshes metadata/availability; catalog failure retains the list with an
honest warning. Refresh availability retries that read. Unpublished/replaced takes
remain labeled unavailable, rather than silently switching to another recording.
Every public player media request adds `public=1`: the existing media route checks
the exact current public release, even for a signed-in administrator. Admin draft
previews keep their existing separate request behavior. Already-buffered public
audio retains the existing revocation limitation. Stored URLs, artwork, lyrics and
private fields are never trusted or persisted as playback authority.

Deployment: merge the scoped site PR and wait for its normal Vercel Production
Ready status. No bot deploy, VPS commands, migration, new environment variables,
payment changes or publication changes are needed. Casting is the next slice
below; actual Chromecast and AirPlay acceptance remains separate from fixtures.

Focused post-deploy check (off air): on /bnl/music or a published Archive Ballad,
add two different released recordings if available. Verify Add is silent, reorder,
Play, Next/Previous, navigation and Back; remove the current item and confirm stop.
Refresh: the list returns but remains silent. Check on a phone that the playlist
panel scrolls and all controls fit. Existing local fixtures verify ended/error and
unpublished cases without changing any production release. Physical-device sound
and the first production observation must be recorded separately from fixture tests.
Rollback: revert this playlist PR and redeploy; keep all released songs/data.
The previous player ignores the versioned local playlist key.

## Chromecast and AirPlay — priority 8, second slice

The existing player offers AirPlay when Safari reports an available wireless
target, and Cast when Google's sender reports an available device. Google's SDK
loads once, after a song is selected in a compatible Chromium browser. A device
picker opens only on a visitor's click. No automatic reconnect or saved-session
resume is requested. Unsupported browsers retain ordinary playback. A transient
sender-script failure offers Retry Cast; retry is explicit, without polling or a
page refresh. Receiver connection loss returns the player locally paused even
when Google's context still retains the session object.

AirPlay uses the existing audio element and Safari's native picker. Chromecast
uses Google's Default Media Receiver. It receives only the same anonymous
`public=1` recording URL after a HEAD check confirms public availability and the
audio MIME type. Public, successful media responses permit receiver CORS/range
access. Admin previews and unavailable/private recordings receive no new access.
No credentials, arbitrary stored URL, private Blob URL, audio conversion or new
published recording is sent to the receiver.

Cast controls use receiver state for play/pause, position, seeking, volume and
mute. Selecting another song and Previous/Next use the same playlist. A natural
FINISHED event may advance once; an error does not skip to another recording.
Receiver loads are serialized and initially paused; only the latest still-active
selection may start. Closing the player, pausing during a load or entering an
operational route cannot be undone by a late completion. Casting pauses local
audio. Stop casting and disconnect retain the song/position but require an
explicit Play to return to this browser. Another sender taking over does not
cause local autoplay or stop its unrelated media.

Keep this page open for Cast playlist progression. Internal site navigation
retains the player; closing/refreshing the page requests an end to its Cast
session. Abrupt network/device/browser loss can prevent that stop request from
reaching the receiver; its own controls remain available. Cast and AirPlay do not
operate the broadcast or the host's queue/OBS player.

Verification distinguishes controller/SDK fixtures and browser layout/interaction
from physical devices. Actual Chromecast/Google TV playback and Safari-to-AirPlay
sound, device discovery, seeking and reconnection remain unobserved until an
off-air device check. They are not show acceptance or a requirement during the
Friday broadcast. Production deployment uses the existing Vercel workflow; no
VPS restart, migration, environment variable or submission gate change is needed.
Rollback: revert this casting PR and redeploy; the existing local player and saved
playlist remain intact.
