# Radio discovery and useful space

The owner's screenshot showed the Radio hero's right half unused while the
Broadcast Archive sat below the queue, schedule and community buttons. Item 7
now explicitly includes stronger Archive invitations between broadcasts and
where past-show context is relevant, plus a review of unused space across the
existing music, Deck/Archive and BNL surfaces.

## First slice

- On desktop, Radio's existing broadcast feature sits beside the introduction,
  queue status and schedule. On smaller screens it follows the queue, ahead of
  the schedule and community links. The queue guide uses the available width.
- A confirmed absent public queue offers **Open Broadcast Archive** and keeps
  **Check queue status**. Current open, standby, full and live queue actions
  retain their direct session link. A failed read stays unavailable, not closed.
- The existing public feature projection chooses the latest archived show
  between broadcasts and the Deck during a real public broadcast. It retains
  exact show/artist links, public counts and the external-Finish qualification.
  Missing details keep an honest loading/unavailable state and an Archive link.
- Between shows, the feature also links to BNL's existing released music and
  browser-local playlists. This is a music destination, not a show replay.
- The Deck already offers the Archive when on standby and in its navigation;
  those existing contextual paths remain in place.

The first slice introduced no new data source or polling loop. Private/test
exclusion and live-state authority remain in the existing public projection.
No recording is uploaded or advertised.

## HQ and BNL discovery

- HQ previously had no direct Archive path in its main content. A compact form
  of the existing Radio feature now uses the hero's right column on wide
  screens and follows the introduction on smaller screens. It links the exact
  latest archived show, all shows, artists and BNL music. Only a real public
  broadcast changes its primary destination to the Deck; pre-show intake does
  not imply a live broadcast.
- This reuses `RadioBroadcastFeature` and its existing public feature read and
  session-bound polling policy (30 seconds active, 60 seconds standby). Mounting
  it on HQ adds that public read on HQ; it does not create another endpoint or
  an independent polling implementation.
- The BNL Hub now features the most recently **published** eligible Ballad beside
  its introduction. Publication date and original show date remain distinct.
  Its existing shared Play, Playlist and Free download controls accompany an
  exact link to the song's broadcast and the full discography.
- The card reads the existing public catalog in a separate Suspense boundary;
  a slow or failed music read does not hold up the Hub's Journal and relays.
  Empty, loading and unavailable states offer honest text and navigation without
  song controls. There is no automatic playback or new player/store.

Header/Footer, Deck, Archive and music pages retain their existing layouts and
routes. Submission, payment, edit gates, BNL generation/publication and weekly
after-show delivery are outside this presentation change.

## Remaining item 7 plan

HQ and BNL's initial discovery gaps are addressed. The existing Deck standby
Archive path, compact discography rows and show/song crosslinks were inspected
and remain in place. Continue with specific observed presentation gaps, using
available space for relevant existing published songs, past shows,
artist discovery and BNL output, with truthful loading/empty/off-air states and
usable phone layouts. Choose concrete pages and outcomes before each bounded
change. Avoid duplicating navigation/cards merely to fill pixels. These slices
do not close the overall presentation pass or priorities 8, 9 and 12.

## Verification

Run `npm ci`, `npm run check` and `npm run build`. Focused rendered regressions
cover the closed queue Archive action, retained current-session actions, failed
and loading feature reads, latest-show links, pre-show intake and live Deck.
Browser fixtures use the real Radio page and mocked public reads at desktop,
tablet/zoom and narrow phone widths; check bounds and actual action destinations
in archive, intake, live, full, unavailable and empty states. No public show is
started and no production mutation is needed.

Local results: `npm ci`, `npm run check` and `npm run build` passed: 1,342 Node tests, 20 Python
fixtures, TypeScript, and lint with 0 errors / 37 existing warnings. Chromium
passed at 1440×1000, 1024×900, 720×500, 390×844 and 320×740 across the six states
above, including a manual status refresh into intake, exact action destinations,
no clipped controls, no page errors and no API mutations. A final desktop spacing
check at 1440 and 1024 confirms the schedule follows the queue without a stretched
grid gap. No temporary application routes or fixture data are shipped.

## Normal post-merge deployment

Merge the scoped PR after CI and Vercel Preview succeed. The existing main
workflow deploys to Vercel; record the production result for the merge SHA.
No VPS commands, environment changes or migrations are required.

## Focused post-deploy evidence

1. Read `/radio` between broadcasts. Verify the Archive fills the desktop right
   column, follows the queue on phones, and is directly linked from the closed
   queue. Follow the latest-show, all-shows, artist and BNL music destinations.
2. Verify the feature response still supplies the same exact archived session
   and public counts. Unavailable details must not claim a live or ended show.
3. The next naturally occurring public broadcast should show the Deck and live
   TikTok destination, even when intake is closed/full. This remains a natural
   observation, not a request to start a session or test during the show.

Local browser evidence is not physical-device or live-show acceptance. Revert
the PR through the normal site workflow if necessary; stored shows, queue state,
playlists and BNL evidence need no migration or repair.

For the HQ/BNL slice, the focused regressions additionally cover compact live,
archive, intake, empty, loading and unavailable states; selection by publication
date; exact show links; shared music controls; and Journal/relay rendering while
music is pending. Local `npm ci`, `npm run check` and `npm run build` passed:
1,347 Node tests, 20 Python fixtures, TypeScript, and lint with 0 errors / 37
existing warnings. The 40 focused checks also passed separately. Browser preview
and production observations are recorded in the release handoff, not inferred
from these test results. After the normal Vercel merge deployment:

1. Open `/` off-air. Check the Archive card beside the introduction at desktop
   width and below it at narrower widths; follow its latest-show and artist links.
2. Open `/bnl`. Match the featured title/publication date against `/bnl/music`,
   follow its original show link, and verify Play/Playlist use the shared dock
   through navigation. A fresh visit must stay silent until Play is chosen.
3. Check narrow layouts for wrapped headings and reachable controls, plus the
   existing Journal and relays beneath the feature. Inspect public-page console
   errors. Leave real live-state and physical audio/device acceptance as natural
   observations; no live-show chores or server commands are needed.
