# System Override web entry

`/system-override` uses the existing BARCODE website layout and links directly to
`/games/system-override/index.html`. The normal same-tab anchor opens the standalone
game document. The game bundle belongs in `public/games/system-override/` and must
be generated alongside this entry page before release.

Browser saves are specific to the website origin and browser profile. The entry
page explains that existing Makko saves do not transfer automatically.

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

## Standalone package

The generated game uses source commit
`90a80762cf919b9f2efb70b95a0a04bfc189542c`, including the reviewed standalone
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
