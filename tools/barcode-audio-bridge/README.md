# BARCODE Audio Bridge

The Audio Bridge is the optional Windows companion for BARCODE Radio's permanent Show Visuals Link source. It captures the **default Windows Speakers output** with WASAPI loopback, analyzes the sound on the show computer, and exposes only bounded numeric motion channels to the visuals renderer on `127.0.0.1`.

For the current show routing:

- Chrome queue/player audio and Windows Media Player submission songs drive the visuals because both play through Speakers.
- The host microphone is not captured unless Windows is explicitly configured to monitor that microphone through Speakers.
- Wheel sound remains owned by the existing TikTok Studio Link source and Wheel state remains owned by the existing queue/Wheel system.
- No audio samples leave the computer. No audio signal is written to Redis or Vercel.

The sponsor/commercial overlay is hosted by the separate `BARCODE.CommercialPlayer.exe` process on `127.0.0.1:43121`. It has no capture, analysis, server, lifecycle, or process dependency on Show Visuals.

## Operator behavior

The release is the accepted visual-only self-contained `BARCODE.AudioBridge.exe`:

1. Double-click it once.
2. It installs itself for the current Windows account and starts automatically with Windows.
3. Leave the tray app running. There is no capture button.

Double-clicking the accepted build replaces the installed copy and relaunches it immediately; no manual uninstall or Windows restart is required. Install and operate the commercial player separately from `tools/barcode-commercial-player`.

## Volume handling

The bridge analyzes the program signal rather than the operator's Windows listening level. It reads the default Speakers endpoint level in decibels, removes that known attenuation from each loopback buffer, and places the reconstructed program at one fixed -9 dB internal analysis reference before calculating energy, bass, mids, treble, peak, flux, or beat. Its 2,048-sample FFT advances in overlapping 1,024-sample hops. One bounded recent-program gain lifts quiet masters and fade-ins equally across the complete spectrum, preserving the real separation and movement between bass, mids, and treble instead of independently normalizing them toward the same level. Held sample peak remains level evidence; only detected arrivals and live band onsets create hard visual hits.

Version 1.1.1 publishes `adaptive_reference_v2`. The website remains compatible with the earlier `fixed_reference_v1` 1.0.4 helper, but 1.1.1 is required for the adaptive fade/vocal response with preserved spectral separation. The twenty completed visual-family renderers are unchanged.

Muted or digitally silent output remains silent; the bridge never invents audio activity. If Windows briefly cannot provide the endpoint-volume reading during a device or driver transition, that frame is analyzed at neutral gain instead of interrupting capture.

## Build

The repository's Windows CI job tests and publishes the supported self-contained `win-x64` executable:

```powershell
dotnet test tools/barcode-audio-bridge.Tests/Barcode.AudioBridge.Tests.csproj -c Release
dotnet publish tools/barcode-audio-bridge/Barcode.AudioBridge.csproj -c Release -r win-x64 --self-contained true
```

NAudio is used under its MIT license for Windows WASAPI loopback capture and Media Foundation duration reads.
