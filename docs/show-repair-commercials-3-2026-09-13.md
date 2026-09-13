# Show repair 3 — commercial start validation

Owner: **6 Bit**. Issue: C01. Review base: video PR #424, commit `65451294f96cdf4ff84285e0cac0cfa2bdd7c80c`.

## Finding and change

The queue button previously sent an OPTIONS request to the local helper, started the website's 11-minute timer, and only then asked the helper to scan/build its playlist. OPTIONS proved only that the listener responded. The helper could reject missing/invalid media or queue playback without a connected browser source. Its useful rejection message was replaced with a generic restart instruction. These are confirmed startup defects.

Commercial Player 1.0.25 adds a read-only preflight at the existing loopback service. It uses the actual library scanner and playlist builder, checks a recent player-source heartbeat, and returns eligible Active filenames. It does not create a playback snapshot, advance logo rotation, queue media, open a browser, or renew its own heartbeat. Start scans again and rechecks the connection. The website requires the new protocol before starting its timer; an older helper gives an explicit update instruction.

The website requests a fresh backend timer before launching the local player. An already-running timer cannot serve as acknowledgement of a new launch. If the helper explicitly replies `started: false`, the website requests cancellation of only that timer's exact session ID and start timestamp. The serialized queue mutation refuses a stale response, another session, a replacement timer, or a completed break. It records the normal reset event and keeps all existing history and current track data. A timeout or ambiguous response does not trigger cancellation, because playback may have started; the operator gets an explicit uncertain outcome.

## Active/Inactive evidence

Current source selects MP4 files directly in `Sponsors\Active`, excluding `Sponsors\Inactive` and nested directories. The existing service intentionally snapshots a queued break, so moving a file after the break was queued affects the next break. This behavior is covered by existing tests and retained. New tests check both preflight and the actual start after a file moves from Active to Inactive. Each real start now logs its scanned Active filenames with the generation.

The reported installed-player behavior is still unconfirmed. Collect the installed Commercial Player version, its actual folder layout, and the relevant generation/filename lines from `%LOCALAPPDATA%\BARCODE Network\Commercial Player\commercial-player.log`. Check whether the move happened before or after the break was queued. Do not represent source tests as proof of what the show computer ran.

## Impact

| Files | Responsibility |
| --- | --- |
| `src/lib/sponsor-break-contract.ts` | Strict preflight/start acknowledgement, ordering, useful errors and conservative failure handling. |
| `src/components/AdminRadioQueueControl.tsx` | Existing queue button invokes the coordinated helper and guarded timer actions. |
| `src/lib/queue.ts`, `src/app/api/admin/queue/route.ts` | Fresh-start requirement and exact-attempt failed-timer cancellation inside existing mutation authority. |
| `tools/barcode-commercial-player/CommercialBreakService.cs`, `CommercialPlayerServer.cs` | Actual planner preflight, recent source heartbeat, same approved origins, fresh Start scan and generation evidence. |
| `tools/barcode-commercial-player/Barcode.CommercialPlayer.csproj`, `README.md` | Standalone Commercial Player 1.0.25 and its operating instructions. |
| `tests/sponsor-break-contract.test.mjs`, `tests/queue-playback.test.mjs`, `tests/queue-timing-display.test.mjs`, `tests/commercial-player-page.test.mjs` | Startup ordering, no timer on rejected preflight, known/unknown outcomes, stale cancellation and preserved submissions/history. |
| `tools/barcode-audio-bridge.Tests/CommercialBreakServiceTests.cs`, `CommercialPlayerServerTests.cs` | Real scanner/planner, heartbeat expiry, missing Fixed media, Active-only selection and changes before Start. |

## Validation

Local validation: `npm ci` passed; `npm run check` passed **1,125 tests**, with zero TypeScript/ESLint errors and 36 existing ESLint warnings; `npm run build` passed. The focused site suite is:

```bash
node --test tests/sponsor-break-contract.test.mjs tests/queue-playback.test.mjs tests/queue-timing-display.test.mjs tests/commercial-player-page.test.mjs
```

Four new Windows regressions cover the service and actual loopback endpoint, including approved origins. The local environment has no .NET executable or Windows runtime. Use the existing Windows CI job on this exact PR head to run:

```powershell
dotnet test tools/barcode-audio-bridge.Tests/Barcode.AudioBridge.Tests.csproj -c Release
dotnet build tools/barcode-commercial-player/Barcode.CommercialPlayer.csproj -c Release
dotnet publish tools/barcode-commercial-player/Barcode.CommercialPlayer.csproj -c Release -r win-x64 --self-contained true
```

Do not mark Windows verification complete until that job passes. Exact results, commit/tree and artifact run belong in the PR/source pack. The local focused run initially passed 176/177; its one obsolete Start-call source assertion was updated to require the connected-player check before the final full suite.

## Normal post-merge deployment and combined acceptance

Keep the PR in draft for the agreed batch. After review, merge dependencies in order, allow the existing Vercel integration to deploy `main`, and verify Ready status and the served commit. Use the Commercial Player artifact from the successful Windows job for that reviewed source. Close the old Commercial Player from its tray menu and run the new `BARCODE.CommercialPlayer.exe` under the same Windows account. Verify installed version 1.0.25. The existing audio/Show Visuals helper has its own installation and is not replaced by this update.

Keep the saved Studio source `https://www.barcode-network.com/overlay/commercials?studioSource=v1`, resolution 1080 × 1920, connected to the existing local player. Refresh the admin queue. The new website fails before starting a timer if the old helper is still installed.

For a read-only check on the show computer while the saved Studio source is loaded:

```powershell
Invoke-RestMethod http://127.0.0.1:43121/v1/commercials/preflight | ConvertTo-Json -Depth 5
```

At the later combined private rehearsal, record the site commit, installed helper version, CI artifact run, session ID, local generation and timestamps. Use controlled fixtures to verify:

1. Missing helper, old helper, missing START/END/bumper/visual asset, empty Active sponsor set and disconnected source: useful error and no website timer.
2. Eligible Active sponsor and trailer clips plus separate Inactive and nested-folder fixtures: only direct Active files appear in preflight and the actual run. Move one before Start, then compare the next scan.
3. Successful button start: one timer and one local generation, current playlist visible in the saved source, no second browser window, and expected audio/visual playback.
4. Definite local rejection after acknowledgement: only that timer is cancelled; previously submitted/played/removed and newly submitted tracks remain current; the show log retains the start/reset events.
5. Lost response, stale failure, a replacement timer and an already completed break: no automatic cancellation of uncertain or newer activity. Use automated fixtures for these races instead of disturbing live playback.

A recent heartbeat confirms a browser source is polling; it does not prove that Studio is broadcasting it or that audio autoplay succeeded. Actual Studio rendering/audio, the first clip, all planned clips, completion timing and the installed-file allegation remain operator acceptance items.

## Recovery boundary

The new failed-start action is a forward operational correction for one rejected timer, not a restore of an old queue snapshot. It preserves submissions, payment/priority data, played/removed records and the full show log; no BNL-memory operation occurs.

For code recovery, revert this scoped site/helper change or apply a focused repair and redeploy normally. A new site requires a helper with the preflight protocol, so deploy/rollback the compatible pair and refresh the queue source. Never overwrite current queue/Blob/Redis/BNL data with an older backup. Keep the latest local media folders and show logs; do not reinstall an older media snapshot over them.
