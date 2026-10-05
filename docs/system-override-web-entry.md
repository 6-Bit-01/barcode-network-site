# System Override web entry

`/system-override` uses the existing BARCODE website layout and links directly to
`/games/system-override/index.html`. The normal same-tab anchor opens the standalone
game document. The game bundle belongs in `public/games/system-override/` and must
be generated alongside this entry page before release.

Browser saves are specific to the website origin and browser profile. The entry
page explains that existing Makko saves do not transfer automatically.

The game entry remains outside the primary navigation. The footer's copyright
symbol is a quiet link to `/system-override`, with an accessible game label and
a visible keyboard-focus outline. The initial game release was approved and
merged in PR478. Minimal road cues, reliable short gear taps and the mirror
readback repair were published in PR479, merged as
`c484c6e4f06078df756d712ef2e039b02fa19f74`. The owner authorizes the remaining
scenery preparation follow-up through publication. Exact release checks and
deployment results are recorded in its pull request and delivery receipt.

Run the focused page regression with:

```sh
node --test tests/system-override-page.test.mjs
```

The regression renders the page and checks its launch destination, accessible
link text, route metadata, and save explanation. Include the repository's normal
check and build validation for the complete game integration. Runtime gameplay,
audio, controller input, and save behavior need validation on the standalone game
document.

Windows verification uses LF checkout bytes for the existing byte-exact source
checks (`core.autocrlf=false`). The historical-evidence storage boundary test
normalizes collected repository paths to forward slashes before comparing them
with its existing allowlist. This changes only the test's platform handling;
its expected consumers and assertions remain intact.

## October 4, 2026 — GPU release prepared; publication pending

Prepared source head `4bf54f05bdca74ae3a8633298d69810812b7bf8d`, tree `04af299956ebc54070cbc031618621deb3804596`, changes checkers, export metadata and documentation after the physically tested runtime checkpoint `a7b2ba5ed3115bcd24903a7729b5060efacadd92`; runtime and asset bytes are unchanged. The local website package currently carries the tested checkpoint metadata until the final merged-source build is installed. Source PR183 remains draft and final exact-head CI is running; source merge and site delivery have not completed. Prior-head full regression, syntax and package integrity passed, but software GL stalled before the HUD and downstream browser checks were unexercised. The final checker records that environment as performanceUnexercised with GPU gameplay notExercised, preserving bootstrap/resource assertions and the required separate native checks.

The target standalone package contains 88 launched scripts, 774 canonical asset files and 600,657,192 asset bytes. The additions are 149 full-resolution KTX2 derivatives and their manifest. All 624 original artwork, music, sprite and metadata files retain their byte hashes: the sorted original path/size/SHA-256 inventory digest remains `0b2ac58dc88ddb68b595fb8592d242d8478c426d78309fe4ff45b88c04027f56`. The generated public `.standalone-build.json` remains the package ownership/hash record; private receipts and review harnesses stay outside `public/`.

Pinned local PixiJS 8.22.0 (MIT) and Basis Universal 2.50 (Apache-2.0) render the scenery through retained ordered image and analytic-gradient batches. Both views preserve original projection and source crops. The 149 compressed textures plus 22 exact original SVG sources use 248.328 MiB of mip storage; one owned preparation worker terminates before driving. The original complete 1920-by-1080 frame, native foreground, shared controls/music/save owners, hidden entry route and copyright-symbol footer shortcut remain unchanged. Existing saves remain tied to their browser/site origin.

Local fresh run 23 completed 786 GPU frames with CPU draw median/p95/max 15.5/24.3/42.8 ms; earned-boss run 24 completed 232 at 16.0/23.5/35.4 ms. Both measured driving windows had zero Canvas copies, texture uploads or native fallbacks. Genuine graphics loss, complete native fallback/restoration, keyboard/gear/audio, road P/Escape and ordinary Level 1 return with authored bridge P/P passed. The observed timing tails remain; these finite runs do not certify universal 60 FPS or every race frame.

Exact-head runtime/source CI, final merged-source packaging, site check/build, Windows audio CI and Vercel deployment/hash/runtime verification remain pending. Publication is authorized but this section does not claim a published GPU release. The unchanged page/footer need no routing edits. The following sections retain the earlier package and validation history.

## Standalone package

The generated game uses source commit
`d41be793d35d1d5603255abca8ff80960b9d2653`, including the reviewed standalone
sprite adapter. The source repository's `tools/build-standalone.py` copies all
624 tracked asset files from exact Git blobs. These now include the 21 preserved
external originals and their provenance journal; preserved original sizes and
SHA-256 hashes are checked separately, and duplicate entries are emitted once.
This complete package contains 472,322,557 asset bytes. It does not recompress
artwork or music.
Historical pinned URL bytes were not independently compared with the current
commit; the package preserves current commit assets and recorded downloaded
originals.

Generated scripts and the sprite manifest resolve assets within
`/games/system-override/`. The adapter replaces the Makko-provided library,
preloading through the existing deduplicated initializer during the existing
DOM boot event. The generated Cache music profile omits its redundant backup
URL because both primary and rewritten backup resolve to the same local file;
the canonical profile and HTTPS backup validator remain unchanged. Google Fonts
is the only remaining runtime external request. Ship GIF source URLs remain
inert provenance; both ship loading and retry use the authored local atlas with
its animation metadata.

The public `.standalone-build.json` contains sanitized package ownership,
source information and a path/SHA-256/byte map for every runtime and asset file
except the manifest itself. The website Node suite verifies this map against
the generated bundle. The complete build receipt and local review harnesses stay
outside `public/`; they are not deployed. Canonical source artwork with historical
review filenames is included among the preserved asset files.

## Recorded local validation — October 3, 2026

- Website `npm run build` passed.
- Website typecheck, lint and complete Node test suite passed. Lint reported
  36 existing warnings and no errors.
- The source repository's focused generated-game check passed: generated
  JavaScript and inline syntax, the actual initializer's manifest comparison,
  all three music profile registrations through the actual validator and all
  10 local music source paths, 256 presentation preload paths, three animated
  ship types, a forced atlas retry retaining its metadata, and sprite preload
  within the original boot/asset-monitor owners, every local index link,
  the emitted stylesheet and the generated native viewport fit override.
- The output's 101 generated runtime source hashes and 624 asset hashes match
  the private build receipt. No unowned output files or local browser review
  harnesses are present in the game bundle.
- The website release test `tests/system-override-bundle.test.mjs` passed all
  four tests with bundled Node: sanitized ownership and all 725 payload hashes
  and sizes, complete local document dependencies, native backing and viewport
  CSS, production manifest/presentation/music/traffic contracts. It runs in the
  website's existing Node suite and requires no private receipt.
- The after-show Python tests require Linux `fcntl`, which is unavailable on
  this Windows host. The complete `npm run check` gate is therefore awaiting
  the existing Ubuntu CI job; the Windows results do not establish that gate.
- A bounded local browser pass reached Continue, Cache Bridge, Drive, pause and
  resume with original artwork and no JavaScript errors. It does not establish
  complete progression or frame-rate acceptance; foreground throttling was
  uncertain during timing sampling.

The generated entry emits the existing `style.css` and places its viewport
override afterward. It centers the full native 1920-by-1080 backing image in a
contained 16:9 display area. The Canvas lifecycle retains display ownership;
redundant DOM status/control hints remain available in clipped screen-reader
boxes. This changes standalone presentation only.

Deployment uses the existing Git integration. Vercel documents its source
upload size limits specifically for CLI deployments; this package should not be
uploaded with an assumed Hobby CLI allowance. See
[Vercel limits](https://vercel.com/docs/limits). No paid plan change is part of
this migration.

Linux CI and delivery from the hosted preview remain release checks. The
standalone document still needs played validation of gameplay, audio,
controller input, saves and native frame pacing. Hosting and static file
integrity do not establish a performance improvement.

## Published minimal-cue and mirror baseline — October 4, 2026

The owner reported immediate improvement when road beat and phrase overlays
were omitted, and selected minimal road cues for this follow-up. The package
retains the authored pad plate, mapped button glyph, live timing ring/countdown,
active or recently caught tire docks, and existing judgment/adrenaline HUD.
It omits duplicate energy bands, inactive docks, ground receipt effects and
captured/queued phrase washes and tiles. Captures and music layers continue
to update normally.

This follow-up also fixes a confirmed keyboard bug: Up/W and Down/S taps that
finish between two shared updates now reach the existing gear selection owner.
Bindings, held steering, once-per-stroke gear behavior and pause controls are
preserved. Real-listener tests failed before the fix and pass afterward,
including aliases, repeat events, next-ONE commits, priority, focus loss,
pause/settings cancellation and Level 1 isolation.

The game keeps its native 1920-by-1080 backing image and scale 1, original
artwork/audio bytes, scenery, rearview geometry and blur, and shared
frame/input/audio owners. Controlled built-game scenes showed fewer image
submissions, from 340 to 326 and from 377 to 354, with unchanged chart, capture,
audio and award state. These counts describe the minimal cue change; the
separate mirror transport comparison below measures the remaining lag fix.

The earlier minimal-cue comparison found a tiny mirror-boundary raster
difference also present with both overlay groups hidden: at most three RGB levels over thirteen
pixels in the earned scene. Mirror interior, alpha and retained HUD inputs
matched. That comparison did not alter the mirror transport; its low-level
cause remains unproven. Required native copy/blur checks retain their original
assertions.

The shared game Canvas now explicitly requests `willReadFrequently:false` on
first acquisition, including alternate-scene and pause fallbacks. This preserves
the existing alpha/color defaults and avoids Chromium's heuristic readback
fallback when its default was unspecified. It does not guarantee acceleration.

The final mirror fix uses the existing cropped Canvas self-copy instead of
reading opaque mirror pixels back to the CPU and constructing a VideoFrame
each frame. The source-over composition, source/destination coordinates,
curved glass clip and `blur(2.3px)` are unchanged. Fading and transformed paths
already used this transport. The sampled-pixel helper remains available for
its other callers; no extra Canvas, cache, frame owner or resampled asset is
introduced.

Actual Windows Chrome 154 on the AMD Radeon 660M D3D11 backend produced exactly
equal full RGBA pixels for the original and direct transports in three native
views: the actual page view, a curved road in third gear, and a played
live boss damaged to 9.746 HP. The latter two were pure GPU renders of snapshots
earned through the existing controlled-input production fixture; page state
was restored before any update. Repeat originals, alpha, mirror interior,
HUD labels, gameplay state and context attributes matched. Each original
render performed one mirror readback; each direct render performed zero.

Four warmed four-second actual-page windows in original/direct/direct/original
order reduced the average of per-window CPU draw medians from 35.80 to
11.95 ms (66.6%). The average CPU p95 fell from 74.00 to 54.75 ms; the average
RAF p95 fell from 75.15 to 58.55 ms. No measurement readbacks were added during
timing. Gameplay and audio advanced naturally, so geometry was not held
identical. CPU draw time includes synchronization with queued GPU work, and
RAF timing measures browser frame opportunities rather than physical scanout.
This is a bounded improvement on the observed device, with remaining tail
stalls; it does not establish a universal frame-rate guarantee.

Linux/headless CI native CPU frame medians still exceed the unchanged
33.33 ms performance budget. The GPU result does not replace or weaken that
gate. Final source regression, package integrity, website checks, hosted
delivery verification and CI results must be recorded against the final
source commit before publication. The accepted follow-up is tracked in
[source PR183](https://github.com/6-Bit-01/BARCODE-SYSTEM-OVERRIDE/pull/183).

## Scenery preparation follow-up — October 4, 2026

This package prepares original-size bitmaps for three scenery sources tied to
recurring costly decodes: RepairShop, MarketRFrontGap and StreetBicycleRack.
Preparation uses the existing shared cache, whole-image factory and original
draw geometry. Pending, unavailable, failed and over-budget preparations retain
their original images. Native reservations total 33,290,908 pixels within the
unchanged 33,554,432-pixel cap; the small-source cap is also unchanged.

Reduced scenery derivatives now prepare only when the existing caller requests
them. Native-only loads avoid 161 unused quarter images, equivalent to 52.128
MiB raw RGBA storage. The three new native backings add 4,704,524 pixels; these
are allocation inventories, not measured resident or net memory savings.

Four hardware-rendered production states matched full-frame RGBA exactly.
Four software states had mean RGB differences of 0.06983748, 0.23806584,
0.20520383 and 0.13236706, below the existing whole-scene bound of 1; alpha
differences were zero. An additional strict-zero software diagnostic failed,
and is recorded separately. Repeats, native scale 1, gameplay/audio state and
context attributes matched. Existing source fidelity and performance thresholds
are unchanged.

Four finite hardware A-B-B-A windows reduced combined matched target decode
cost from 495.024 to 60.438 ms (87.8%). Decode events remain. Overall CPU draw
median/p95 pairs were 8.8/44.6 and 9.4/45.6 ms for the baseline, versus
9.0/28.5 and 12.2/46.8 ms for the candidate. The source work improves, while
overall cadence is mixed; this is not a universal FPS or complete-race claim.

Only presentation-assets.js and the regenerated package manifest change in the
hosted game. All 624 assets and 472,322,557 artwork/audio bytes, the other eight
previously changed runtime files, standalone adapter, entry route and hidden
footer shortcut remain byte-identical. No Canvas, frame, timer, input or audio
owner is added. Final source, website and hosted-package results belong to the
exact revision identified by the manifest; source PR183 stays draft while its
unchanged software timing gate fails.

The aligned source browser check also retains a failed historical representation
comparison: adaptive native painting versus bitmap-only painting has mean RGB
1.2105–1.5021 on the published source9cd and 1.2106–1.5020 on this candidate,
above its unchanged bound of 1. No new row crosses the bound; differences between
the old and new results are below 0.0001. The paired fixture deliberately uses
different sampling quality for those representations. This attribution does not
make the source browser gate green. Strict pause repetition, one-context/native
ownership, viewport/single-blur checks, tint, exact world copy and exact mirror
copy pass independently. The complete source failure remains recorded alongside
its timing failure; authorized website publication uses its separate green
checks and verified baseline-to-candidate package evidence.
