# BARCODE Audio Bridge

The Audio Bridge is the optional Windows companion for BARCODE Radio's permanent Show Visuals Link source. It captures the **default Windows Speakers output** with WASAPI loopback, analyzes the sound on the show computer, and exposes only bounded numeric motion channels to the visuals renderer on `127.0.0.1`.

For the current show routing this means:

- Chrome queue/player audio and Windows Media Player submission songs drive the visuals because both play through Speakers.
- The host microphone is not captured unless Windows is explicitly configured to monitor that microphone back through Speakers.
- Wheel sound remains owned by the existing TikTok Studio Link source and Wheel state remains owned by the existing queue/Wheel system.
- No audio samples leave the computer. No audio signal is written to Redis or Vercel.

## Operator behavior

The release is a self-contained `BARCODE.AudioBridge.exe`:

1. Double-click it once.
2. It installs itself for the current Windows account and starts automatically with Windows.
3. Leave the tray app running. There is no capture button.

Double-clicking a newer build replaces the running installed copy and relaunches it immediately; no manual uninstall or Windows restart is required.

The local endpoint remains ready at negligible cost. Speakers capture starts when the permanent Show Visuals Link reports an active queue session and stops a few seconds after that session ends or the source goes away. If the bridge is missing, blocked, silent, or restarting, the overlay automatically continues with its six deterministic randomized song-motion profiles.

## Volume handling

The bridge analyzes the program signal rather than the operator's Windows listening level. It reads the default Speakers endpoint level in decibels, removes that known attenuation from each loopback buffer, and then places the reconstructed program at one fixed -9 dB internal analysis reference before calculating energy, bass, mids, treble, peak, flux, or beat. This fixed headroom restores the response the analyzer had before volume compensation: moving the Windows volume slider does not make the same passage visually weaker or stronger, soft openings remain restrained, and real quiet-to-loud changes inside the song remain intact.

Version 1.0.4 marks its local signal as `fixed_reference_v1`. The website also recognizes unmarked 1.0.3 payloads and applies the equivalent reference correction once, so the deployed overlay stops treating legacy full-scale readings as maximum while the one-click helper update is being installed.

Muted or digitally silent output remains silent; the bridge never invents audio activity. If Windows briefly cannot provide the endpoint-volume reading during a device or driver transition, that frame is analyzed at neutral gain instead of interrupting capture. A media player's separate in-app volume is part of the signal Windows supplies and is not rewritten by the bridge.

## Build

The repository's Windows CI job publishes the supported self-contained `win-x64` executable:

```powershell
dotnet publish tools/barcode-audio-bridge/Barcode.AudioBridge.csproj -c Release -r win-x64 --self-contained true
```

NAudio is used under its MIT license for Windows WASAPI loopback capture.
