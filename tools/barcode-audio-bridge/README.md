# BARCODE Audio Bridge + Local Commercial Player

The Audio Bridge is the optional Windows companion for BARCODE Radio's permanent Show Visuals Link source. It captures the **default Windows Speakers output** with WASAPI loopback, analyzes the sound on the show computer, and exposes only bounded numeric motion channels to the visuals renderer on `127.0.0.1`.

For the current show routing this means:

- Chrome queue/player audio and Windows Media Player submission songs drive the visuals because both play through Speakers.
- The host microphone is not captured unless Windows is explicitly configured to monitor that microphone back through Speakers.
- Wheel sound remains owned by the existing TikTok Studio Link source and Wheel state remains owned by the existing queue/Wheel system.
- No audio samples leave the computer. No audio signal is written to Redis or Vercel.

This build also adds a fully local commercial player. Sponsor videos stay on the show computer. The website, Vercel, Redis, queue store, BNL, and payment systems do not host or process the files.

## Operator behavior

The release is a self-contained `BARCODE.AudioBridge.exe`:

1. Double-click it once.
2. It installs itself for the current Windows account and starts automatically with Windows.
3. Leave the tray app running. There is no capture button.

Double-clicking a newer build replaces the running installed copy and relaunches it immediately; no manual uninstall or Windows restart is required.

Sponsor media also stays local and is never uploaded by the helper.

The local endpoint remains ready at negligible cost. Speakers capture starts when the permanent Show Visuals Link reports an active queue session and stops a few seconds after that session ends or the source goes away. If the bridge is missing, blocked, silent, or restarting, the overlay automatically continues with its built-in song-motion fallback.

## Local commercial player

Right-click the BARCODE tray icon and choose **Open commercial folder**. The helper creates:

```text
Commercials/
├── Fixed/
│   ├── start.mp4
│   ├── end.mp4
│   └── Bumpers/             # drop all five bumper MP4s here
├── Sponsors/
│   ├── Active/
│   └── Inactive/
└── Visuals/
    ├── Background/          # one background image
    └── Logos/
        ├── BCN/             # both alternating BARCODE logos
        ├── BL/              # BLVCKL!GHT logo
        └── R/               # Rigged Sanchez logo
```

Workflow:

- Add any eligible video by dropping its `.mp4` into `Sponsors/Active`.
- Temporarily remove any video by moving it to `Sponsors/Inactive`.
- Move files between Active and Inactive whenever needed.
- The selected files are frozen into a managed local playback snapshot at start, so folder changes affect only the next break and cannot interrupt the current one.

Files with parentheses are fake commercials/trailers rather than sponsors. `(BCN)`, `(BL)`, and `(R)` map to the BARCODE, BLVCKL!GHT, and Rigged Sanchez logos. The matching logo fades in above the video and fades out near the end of that clip; the two BCN images alternate in playback order and continue alternating across breaks.

At start, the helper scans the active folder, reads every runtime, selects three of the five bumpers, and builds the sequence closest to the 11-minute target:

```text
start
content block 1
bumper (early range)
content block 2
bumper (middle range)
content block 3
bumper (late range)
content block 4
end
```

Every readable real sponsor plays once. Fake commercials/trailers are randomized between sponsors and are never placed consecutively. Only `SPACE1.mp4`, `Alien.mp4`, and `May.mp4` may be omitted when that produces a closer 11-minute result. An unreadable active file is skipped and logged; missing start/end media, fewer than three readable bumpers, a missing background, or a missing logo required by an active tag blocks start with a clear error.

### TikTok Studio source

Create one permanent Link/browser source using:

```text
http://127.0.0.1:43120/commercials
```

The page is transparent and idle until the tray action queues a break. During playback it shows the local background, video window, and any clip-tagged logo; it preloads only the next video and returns to transparent idle after the end sequence. The source supports normal browser byte-range requests, so it does not load the full library into memory.

Use **Copy commercial player source URL** for setup or **Open commercial player preview** for a visible local diagnostic view. Do not keep the preview browser open during a broadcast if the TikTok Studio source is already active, because both pages can play the same local break.

Recommended media format: H.264 video and AAC audio in an MP4 container, at the same resolution and frame rate used by the current commercial block.

The first release starts locally from the tray. It does not change the queue's existing sponsor timing, sponsor-break state, or Start Sponsor Break action. A queue-to-local start bridge remains a separate later integration.

## Volume handling

The bridge analyzes the program signal rather than the operator's Windows listening level. It reads the default Speakers endpoint level in decibels, removes that known attenuation from each loopback buffer, and then places the reconstructed program at one fixed -9 dB internal analysis reference before calculating energy, bass, mids, treble, peak, flux, or beat. This fixed headroom restores the response the analyzer had before volume compensation: moving the Windows volume slider does not make the same passage visually weaker or stronger, soft openings remain restrained, and real quiet-to-loud changes inside the song remain intact.

Version 1.0.4 introduced `fixed_reference_v1`. The website also recognizes unmarked 1.0.3 payloads and applies the equivalent reference correction once.

Muted or digitally silent output remains silent; the bridge never invents audio activity. If Windows briefly cannot provide the endpoint-volume reading during a device or driver transition, that frame is analyzed at neutral gain instead of interrupting capture. A media player's separate in-app volume is part of the signal Windows supplies and is not rewritten by the bridge.

## Build

The repository's Windows CI job tests and publishes the supported self-contained `win-x64` executable:

```powershell
dotnet test tools/barcode-audio-bridge.Tests/Barcode.AudioBridge.Tests.csproj -c Release
dotnet publish tools/barcode-audio-bridge/Barcode.AudioBridge.csproj -c Release -r win-x64 --self-contained true
```

NAudio is used under its MIT license for Windows WASAPI loopback capture and Media Foundation duration reads.
