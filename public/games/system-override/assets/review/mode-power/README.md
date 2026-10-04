# Mode presence review

Native production Canvas rendering with bundled artwork; Makko sprite/image boundaries adapted. Enemy travel and rhythm contact events are staged. Not a hosted gameplay recording or device-performance result.

- `mode-power.mp4`: eight silent seconds; hack entry/hold/guard, then Rhythm Mode with a rising combo.
- `hack-entry.webp`, `hack-held.webp`, `hack-deflect.webp`: cold scene, palm/uplink and guard reaction beside the opaque terminal.
- `rhythm-impact.webp`: combo field and connected perfect-hit effect.
- `hack-reduced.webp`, `rhythm-reduced.webp`: Reduced Motion and Flashes Off.
- `mode-sfx.wav`: isolated production SFX at 0.15s hack entry, 1.35s guard, 2.35s release, 3.35s rhythm entry, 4.55s perfect contact. No music is included.
- `mode-sfx-report.json`: real Chromium PCM/mute/cache/cleanup evidence. Numeric output is not a listening verdict.

Reproduce: `MODE_POWER_REVIEW=1 node tools/render-level1-rebuild.cjs assets/review/mode-power` (native Canvas and ffmpeg), then `CHROME_BIN=/path/to/chrome MODE_SFX_REVIEW=1 MUSIC_BROWSER_OUTPUT=assets/review/mode-power node tools/check-music-audibility.cjs` (Node 22+ and Chromium).

Exact review revision, automated outcomes and CI are in the generated source receipt. Hosted acceptance route: `docs/source-pack/MODE_POWER_PASS.md`.
