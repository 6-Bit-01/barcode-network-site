# BARCODE Audio Bridge + Local Commercial Player

The Audio Bridge is the optional Windows companion for BARCODE Radio's permanent Show Visuals Link source. It captures the **default Windows Speakers output** with WASAPI loopback, analyzes the sound on the show computer, and exposes only bounded numeric motion channels to the visuals renderer on `127.0.0.1`.

For the current show routing:

- Chrome queue/player audio and Windows Media Player submission songs drive the visuals because both play through Speakers.
- The host microphone is not captured unless Windows is explicitly configured to monitor that microphone through Speakers.
- Wheel sound remains owned by the existing TikTok Studio Link source and Wheel state remains owned by the existing queue/Wheel system.
- No audio samples leave the computer. No audio signal is written to Redis or Vercel.

This build also contains a fully local commercial player. Sponsor media, fake commercials/trailers, the animated background, frame, and logos stay on the show computer. The website, Vercel, Redis, queue store, BNL, and payment systems do not host or process those files.

## Operator behavior

The release is a self-contained `BARCODE.AudioBridge.exe`:

1. Double-click it once.
2. It installs itself for the current Windows account and starts automatically with Windows.
3. Leave the tray app running. There is no capture button.

Double-clicking a newer build replaces the installed copy and relaunches it immediately; no manual uninstall or Windows restart is required.

## Local commercial player

Right-click the BARCODE tray icon and choose **Open commercial folder**. Use this exact layout:

```text
Commercials/
├── Fixed/
│   ├── START.mp4
│   ├── BUMPER1.mp4
│   ├── BUMPER2.mp4
│   ├── BUMPER3.mp4
│   ├── BUMPER4.mp4
│   ├── BUMPER5.mp4
│   └── END.mp4
├── Sponsors/
│   ├── Active/
│   └── Inactive/
├── BG.mp4
├── TV.mp4
├── ICON.png
├── BCN1.png
├── BCN2.png
├── BL.png
└── R.png
```

### Eligibility and classification

- Add any video eligible for the next break by dropping its `.mp4` into `Sponsors/Active`.
- Temporarily remove it by moving it to `Sponsors/Inactive`.
- Folder changes affect the next break. The selected media is frozen into a managed local playback snapshot when a break starts, so moving or replacing a source file cannot interrupt the current break.
- A file name containing parentheses is treated as a fake commercial/trailer instead of a sponsor.
- `(BCN)`, `(BL)`, and `(R)` map to BARCODE, BLVCKL!GHT, and Rigged Sanchez.
- The upper framed panel is a dynamic logo aperture, not a permanent BARCODE panel.
- `ICON.png` fades into that panel during START and END, then fades out before each clip finishes.
- Tagged house content uses its matching logo in the same panel. Untagged sponsors and bumpers leave it clear.
- `BCN1.png` and `BCN2.png` alternate in playback order and continue alternating across breaks.
- Fake commercials/trailers are dotted between real sponsors and are never stacked back-to-back.

### Eleven-minute sequence

At start, the helper reads every duration, keeps every readable real sponsor exactly once, selects three different files from the five-bumper pool, and builds the complete sequence closest to 11:00:

```text
START
content block 1
one selected bumper in the early range
content block 2
one selected bumper in the middle range
content block 3
one selected bumper in the late range
content block 4
END
```

The three bumper ranges are randomized within approximately 20–30%, 45–55%, and 70–80% of the content run. Whole videos are always preserved; the player never trims a spot to hit a timestamp.

Only `SPACE1.mp4`, `Alien.mp4`, and `May.mp4` may be omitted when doing so makes the full break closer to 11:00. No real sponsor is silently removed. An unreadable active file is skipped and logged. Missing required fixed media, `BG.mp4`, `TV.mp4`, `ICON.png`, or a logo required by an active tag blocks the start with a clear error.

### Composed local player

The permanent Link/browser source remains:

```text
http://127.0.0.1:43120/commercials
```

Set the source to **1080 × 1920** in TikTok Studio.

During a break:

- `BG.mp4` and `TV.mp4` are matching 1080 × 1920 portrait videos. Both loop across the fixed 9:16 composition.
- `BG.mp4` is the moving background and `TV.mp4` is the full-frame animated overlay above it.
- Every START, sponsor, fake commercial/trailer, bumper, and END clip plays inside the TV screen.
- The clip window sits above only the TV screen area and is clipped to its rounded opening. It visually replaces the overlay's screen, so the screen behaves as transparent without chroma-keying, masking, or re-exporting `TV.mp4` with alpha.
- The upper frame is reserved for the current dynamic logo: `ICON.png` for START/END and the tagged BCN/BL/R logo for matching house content.
- `BG.mp4` and `TV.mp4` are muted. Only the current sequence clip supplies audio.
- Only the next sequence clip is preloaded.
- The background and frame are paused and cleared when the break is idle or stopped.
- The source returns to transparent idle after END.

Use **Copy commercial player source URL** for the permanent Link source (`http://127.0.0.1:43120/commercials`) or **Open commercial player preview** for the diagnostic version (`http://127.0.0.1:43120/commercials?debug=1`). Do not leave the preview browser open during a broadcast when the TikTok Studio source is already active, because both pages can play the same break.

Recommended video format: H.264 video and AAC audio in an MP4 container. Transparent PNGs are recommended for all logos.

The first release starts locally from the tray. It does not change the queue's sponsor timing, sponsor-break state, or existing Start Sponsor Break action. Queue-to-local automatic triggering remains a later focused integration after this player is proved with the real files.

## Volume handling

The bridge analyzes the program signal rather than the operator's Windows listening level. It reads the default Speakers endpoint level in decibels, removes that known attenuation from each loopback buffer, and places the reconstructed program at one fixed -9 dB internal analysis reference before calculating energy, bass, mids, treble, peak, flux, or beat.

Version 1.0.4 introduced `fixed_reference_v1`. Version 1.0.6 adds the corrected portrait commercial stage and START/END icon without changing that audio-analysis contract.

Muted or digitally silent output remains silent; the bridge never invents audio activity. If Windows briefly cannot provide the endpoint-volume reading during a device or driver transition, that frame is analyzed at neutral gain instead of interrupting capture.

## Build

The repository's Windows CI job tests and publishes the supported self-contained `win-x64` executable:

```powershell
dotnet test tools/barcode-audio-bridge.Tests/Barcode.AudioBridge.Tests.csproj -c Release
dotnet publish tools/barcode-audio-bridge/Barcode.AudioBridge.csproj -c Release -r win-x64 --self-contained true
```

NAudio is used under its MIT license for Windows WASAPI loopback capture and Media Foundation duration reads.
