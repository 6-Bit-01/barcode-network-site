# BARCODE Commercial Player

The Commercial Player is the standalone Windows host for BARCODE Radio's separate sponsor/commercial overlay. It owns only the local commercial library, manual break controls, and the loopback listener on `127.0.0.1:43121`.

It does not capture Speakers audio, analyze music, serve Show Visuals, or bind the Show Visuals listener on `127.0.0.1:43120`. The accepted visual-only `BARCODE.AudioBridge.exe` remains a separate process and installation.

## Install and operate

1. Run `BARCODE.CommercialPlayer.exe` once. It installs for the current Windows account and starts with Windows.
2. Right-click the **BARCODE Commercial Player** tray icon to open the commercial folder, copy the permanent TikTok Studio source URL, or open the diagnostic preview.
3. Keep the saved TikTok Studio source at `https://www.barcode-network.com/overlay/commercials?studioSource=v1` with custom resolution `1080 × 1920`.
4. Start the break with the existing queue **Start Sponsor Break** button or the tray's **Start Commercial Break** command. The sequence and manual-start behavior are unchanged.

The established folder contract remains under `%LOCALAPPDATA%\BARCODE Network\Commercials`. Sponsor media never leaves the show computer.

## Build

```powershell
dotnet publish tools/barcode-commercial-player/Barcode.CommercialPlayer.csproj -c Release -r win-x64 --self-contained true
```
