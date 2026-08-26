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
│   ├── END.mp4
│   └── Bumpers/             # keep all five existing bumper MP4s here
├── Sponsors/
│   ├── Active/
│   └── Inactive/
└── Visuals/
    ├── ICON.png
    ├── Background/          # one looping 1080×1920 portrait MP4 or WEBM
    ├── TV Overlay/          # correct animated frame named TV.mp4 or TV.webm
    ├── Corner Logos/
    │   ├── CORNERLOGO1.png
    │   └── CORNERLOGO2.png
    └── Logos/
        ├── BCN/             # both alternating BARCODE logo images
        ├── BL/              # BLVCKL!GHT logo image
        └── R/               # Rigged Sanchez logo image
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
- The two images already in `Visuals/Logos/BCN` alternate in playback order and continue alternating across breaks.
- BCN and BLVCKL!GHT upper-panel logos render 25% larger than the other panel visuals.
- Every selected bumper and configured Veo-marked clip receives a corner mark inside the commercial screen and below the TV frame. Consecutive marked videos share the same fully-solid mark for the entire uninterrupted run, so no second mark appears at their boundaries. `CORNERLOGO1.png` and `CORNERLOGO2.png` alternate between separated marked runs and continue that run-level alternation across breaks. A mark fades in during the preceding unmarked clip and fades only after the marked run ends; `CORNERLOGO2.png` renders 15% smaller than `CORNERLOGO1.png`.
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

Only `SPACE1.mp4`, `Alien.mp4`, and `May.mp4` may be omitted when doing so makes the full break closer to 11:00. No real sponsor is silently removed. An unreadable active file is skipped and logged. Missing START/END media, fewer than three readable files in `Fixed/Bumpers`, a missing visual video, `Visuals/ICON.png`, or a logo required by an active tag blocks the start with a clear error. If `Visuals/TV Overlay` contains multiple videos, the player uses the exact `TV.mp4`/`TV.webm`; without that exact name it blocks the break instead of choosing an arbitrary file.

### Composed local player

The permanent Link/browser source remains:

```text
https://www.barcode-network.com/overlay/commercials?studioSource=v1
```

Set the source to **1080 × 1920** in TikTok Studio.

Add and size that Link source once, then leave it in the TikTok Studio scene for every show. The tray app serves the same local URL whenever it is running; there is no per-show browser window, replacement source, or resizing step.

While the source is connected and no break is running, it displays only the animated background. The TV, commercial aperture, sponsor media, upper logo, and corner logo remain hidden. This makes the live 1080×1920 local source visibly verifiable in TikTok Studio before a break.

During a break:

- The video in `Visuals/Background` fills the fixed 9:16 composition without being stretched.
- The exact `TV.mp4`/`TV.webm` is cropped as one undistorted source to remove its embedded dark outer padding and lower-right source mark; the continuous animated bezel fills the slightly larger TV viewport.
- The screen aperture uses the measured reference-frame opening as one mask, while the black-backed commercial layer extends safely beneath every bezel edge so no background crack can appear at a corner or between mismatched source dimensions.
- No generated fill strips, painted corner patches, detached dark fragments, or debug outlines are layered onto the frame.
- Every START, sponsor, fake commercial/trailer, bumper, and END clip is measured from its actual video dimensions and fitted automatically; no filename-specific sizing list is used.
- The fitter centers both axes, applies at most 8.5% aspect correction, and crops only the remaining unavoidable axis. This displays the maximum practical sponsor picture while keeping distortion restrained. A 0.8% hidden safety bleed remains under the bezel so rounding or mismatched source dimensions cannot expose the background.
- The commercial is behind the TV layer. A fixed GPU mask removes the TV video's opaque screen area, so the bezel stays over the commercial and the opening behaves as transparent without per-frame CPU chroma-keying or re-exporting the TV video with alpha.
- The animated TV frame runs at half speed (a 100% longer animation cycle). Lightweight independent yellow/red glow pulses keep its top lamps flashing frequently without decoding a second TV video stream.
- The upper frame is reserved for the current dynamic logo: `Visuals/ICON.png` for START/END and the tagged BCN/BL/R logo for matching house content.
- Both Visuals videos are muted. Only the current sequence clip supplies audio.
- The animated background is cleanly overscanned from its upper-left source edge so its embedded lower-right Veo mark remains outside the 9:16 output.
- Sequence clips load directly from the frozen local snapshot when they are due; the player does not run a second full-file preload stream beside the current commercial.
- Immutable one-hour media caching and silent handling of normal Chromium range cancellations prevent transition-time request and log floods.
- When a break starts, the complete TV frame appears over a black screen, a short CSS-only CRT power-on flicker runs, and the existing START/commercial sequence begins. The flicker adds no media decoder.
- After END or a manual stop, the TV, commercial, and logo layers clear while the background-only idle view resumes.

Use **Copy permanent TikTok Studio source URL** for the reusable HTTPS Link source (`https://www.barcode-network.com/overlay/commercials?studioSource=v1`). TikTok Studio requires HTTPS, so this BARCODE route redirects its source browser to the Audio Bridge's local-only player; sponsor media and visual files remain on the show computer. The stable `studioSource=v1` query forces one full navigation away from the older transparent-idle renderer, and an imperceptible two-pixel compositor heartbeat keeps TikTok Studio's placed canvas renderer repainting just as the Wheel source does. Add it once with custom resolution `1080 x 1920`, turn sound on, keep the source active, and size it once in the saved scene. **Open diagnostic preview (not Studio source)** opens the separate Chrome test page (`http://127.0.0.1:43120/commercials?debug=1`); Chrome requires one click on its audio gate before it permits audible playback. If a test break reaches that block first, the preview holds the same clip and resumes it after the click instead of failing the break. Do not leave the diagnostic preview open during a broadcast when the TikTok Studio source is already active, because both pages can play the same break.

For a live break, leave the diagnostic preview closed. Run Audio Bridge, unhide the saved **COMMERCIALS** Link source in TikTok Studio, then press the existing **Start Sponsor Break** queue button. The button keeps its existing queue/overlay sponsor state and timer behavior and also tells the local Audio Bridge to queue the commercial break. Wait for END, then hide the **COMMERCIALS** source. No separate commercial window is required, no continuous queue polling is added, and no commercial media leaves the show computer.

Version 1.0.21 intentionally keeps one muted background decoder active while the source is loaded so the Studio connection can be validated. After that live-source test, the same source can be revised to hold a paused or static idle frame until sponsor-break readiness, keeping the browser source connected while removing continuous idle video decoding.

Recommended video format: H.264 video and AAC audio in an MP4 container. Transparent PNGs are recommended for all logos.

## Volume handling

The bridge analyzes the program signal rather than the operator's Windows listening level. It reads the default Speakers endpoint level in decibels, removes that known attenuation from each loopback buffer, and places the reconstructed program at one fixed -9 dB internal analysis reference before calculating energy, bass, mids, treble, peak, flux, or beat.

Version 1.0.4 introduced `fixed_reference_v1`. Version 1.0.7 restores the established `Fixed/Bumpers` and `Visuals` folder contract. Version 1.0.8 adds nonfatal Chrome autoplay recovery to the diagnostic preview and clarifies that the TikTok Studio URL is a permanent reusable source. Version 1.0.9 restores the TV's native aspect ratio, masks its screen above the commercial, and keeps diagnostic preview controls out of the composition. Version 1.0.10 nearly doubles the logo display and replaces the Studio-rejected HTTP loopback address with the permanent BARCODE HTTPS source. Version 1.0.11 enlarges the TV/commercial unit. Version 1.0.12 restores the complete original TV bezel without synthetic patches, removes diagnostic frame outlines, and crops the background's embedded corner mark outside the output. Version 1.0.13 locks the TV to an exact file, rebuilds the aperture from the complete 771×482 frame, adds alternating corner logos, enlarges BCN/BL by 25%, and removes transition-time preload and canceled-stream log churn. Version 1.0.14 removes the animated TV source's embedded outer border, safely overscans every commercial beneath all four bezel edges, enlarges and anchors the alternating corner marks, and lets the visible frame occupy more of the portrait composition without distortion. Version 1.0.15 adds slow corner-logo fades, makes the second corner mark 15% smaller, doubles the TV frame's animation cycle while keeping frequent low-cost lamp pulses, and selectively soft-fits near-16:9 commercials so their top and bottom remain visible. Version 1.0.16 replaces per-file sizing with one centered metadata-driven fitter for current and future clips, and pre/post-rolls dual corner-logo layers across all five bumpers and marked sponsors. Version 1.0.17 keeps exactly one corner mark visible and treats consecutive logo-required videos as one uninterrupted run: the same mark stays solid for the full run, then the next separated run uses the other mark. Version 1.0.18 adds `grayeye.mp4` to the corner-logo-required sponsor set. Version 1.0.19 corrects the Copyright Wars marked filename to `CopyrightWars(BCN).mp4`. Version 1.0.20 connects the existing queue button directly to the local commercial player without changing song playback, queue ordering, or the existing sponsor timer. Version 1.0.21 adds a background-only idle render plus a lightweight CRT power-on transition before the unchanged commercial sequence. Version 1.0.22 adds the Wheel-proven Studio compositor heartbeat and a one-time versioned source navigation so the placed COMMERCIALS renderer cannot remain on the older transparent page while Settings preview is current.

Muted or digitally silent output remains silent; the bridge never invents audio activity. If Windows briefly cannot provide the endpoint-volume reading during a device or driver transition, that frame is analyzed at neutral gain instead of interrupting capture.

## Build

The repository's Windows CI job tests and publishes the supported self-contained `win-x64` executable:

```powershell
dotnet test tools/barcode-audio-bridge.Tests/Barcode.AudioBridge.Tests.csproj -c Release
dotnet publish tools/barcode-audio-bridge/Barcode.AudioBridge.csproj -c Release -r win-x64 --self-contained true
```

NAudio is used under its MIT license for Windows WASAPI loopback capture and Media Foundation duration reads.
