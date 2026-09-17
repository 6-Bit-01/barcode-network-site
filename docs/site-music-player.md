# BARCODE site music player

The Archive show card remains the entry point for its published song. Pressing
Play starts one audio element in the root layout and opens the BARCODE mini-player.
The same recording and position survive internal navigation, artist links,
discography searches and browser Back/Forward. Returning to the show exposes
controls for the same player; it does not start a second recording.

## Controls and presentation

- Black/green BARCODE panel with Oxanium, release artwork or a barcode fallback,
  title/artist, a link to the originating show, play/pause, seek, volume and mute.
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
navigation or closing the tab ends it; it does not resume automatically later.
The Radio queue entrance retains its existing intro, Skip and seen-session
behavior, using client navigation so the music can continue. Checkout redirects
and external destinations retain their existing behavior.

## Published authority

Track metadata comes from the existing public release. Playback continues through
`/api/ballads/media`, which retains its public eligibility and publication checks
and range responses. There is no new audio store, copied recording, persistence,
permission, provider, generation, publication or BNL-memory behavior. As before,
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

1. Open the published show's Archive card and press Play. Confirm the mini-player
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
