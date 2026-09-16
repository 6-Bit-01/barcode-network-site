# BARCODE Commercial Player

The Commercial Player is the standalone Windows host for BARCODE Radio's separate sponsor/commercial overlay. It owns only the local commercial library, manual break controls, and the loopback listener on `127.0.0.1:43121`.

It does not capture Speakers audio, analyze music, serve Show Visuals, or bind the Show Visuals listener on `127.0.0.1:43120`. The accepted visual-only `BARCODE.AudioBridge.exe` remains a separate process and installation.

## Install and operate

1. Run `BARCODE.CommercialPlayer.exe` once. It installs for the current Windows account and starts with Windows.
2. Right-click the **BARCODE Commercial Player** tray icon to open the commercial folder, copy the permanent TikTok Studio source URL, or open the diagnostic preview.
3. Keep the saved TikTok Studio source at `https://www.barcode-network.com/overlay/commercials?studioSource=v1` with custom resolution `1080 × 1920`.
4. With Commercial Player **1.0.25 or later**, the queue **Start Sponsor Break** button checks the real Active library and a recent player-source heartbeat before starting its timer. Keep the saved Studio source loaded. The tray's **Start Commercial Break** remains available for manual operation.

The queue's preflight does not open a second browser or start a break. A missing source, invalid library or older helper stops the request before a timer begins. A definite rejection after the timer starts cancels only that exact failed timer; a lost response leaves an explicit uncertain status for the operator to inspect.

Only MP4s directly inside `Sponsors\Active` are eligible; `Sponsors\Inactive` and nested folders are excluded. Each actual Start scans again. Moving a file before Start excludes it. Playback snapshots remain supported, but a copy is playable only while its original remains the same eligible file in Active. Moving that original out of Active excludes it from the running break too, and the remaining clips continue. Inactive is never enumerated or read as a fallback. Commercial Player 1.0.26 includes this exclusion fix. The selected Active filenames are logged with the run's generation; use that record when investigating an unexpected commercial.

The established folder contract remains under `%LOCALAPPDATA%\BARCODE Network\Commercials`. Sponsor media never leaves the show computer.

## Build

```powershell
dotnet publish tools/barcode-commercial-player/Barcode.CommercialPlayer.csproj -c Release -r win-x64 --self-contained true
```
