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

No new data source, polling loop, public content, playback, submission or payment
behavior is introduced. Private/test exclusion and live-state authority remain
in the existing public projection. No recording is uploaded or advertised.

## Remaining item 7 plan

Inspect the actual HQ, Deck/Archive, music and BNL layouts for gaps in the visitor
journey. Use available space for relevant existing published songs, past shows,
artist discovery and BNL output, with truthful loading/empty/off-air states and
usable phone layouts. Choose concrete pages and outcomes before each bounded
change. Avoid duplicating navigation/cards merely to fill pixels. The Radio
slice does not close the overall presentation pass or priorities 8, 9 and 12.

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
