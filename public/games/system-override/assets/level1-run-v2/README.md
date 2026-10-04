# 6 Bit run, second gait

This replacement run clip keeps the `6_bit_run_run` animation ID. The earlier
run and all canonical model rasters remain unchanged in their original folders.
The built-in image generator created the source from a twelve-pose, right-facing
contralateral gait guide and the canonical 6 Bit head/cap/hair reference. The
selected transparent source is stored unchanged as `6_bit_run_source_0.png`;
its SHA-256 is
`c1d13c72b0be85f34521a8b9df7915169e22f7882d384d080d696ff165c00dd8`.

The reviewed cycle uses source cells 0, 1, 2, 3, 4, 5, 7, 8, 9, 10 and 11.
Cell 6 repeats the second contact and is omitted. The first five cels last
60 ms each; the remaining six last 50 ms each. Opposite contacts start at
0 and 300 ms, and the full gait lasts 600 ms. Both arms visibly reverse across
the cycle, with complete boots and a checked final-to-first transition.

`tools/prepare-level1-run-v2.py` reproduces the lossless atlas using the bundled
`source-registration.json`. It assigns transparent silhouette edges, then
crops and pads with integer translations. It does not paint, resample, blend
or assemble limbs. The atlas contains eleven 512×576 cells in a 2048×1728 grid,
with native anchor (256, 512). Its SHA-256 is
`45bb6de6d1aecc6b3b515c572fc763ff8b125e79915dba8a9b255b1251af1471`.

The runtime applies small, measured uniform draw scales to keep visible body
height at the canonical walk median of 200.090909 world pixels. A shared
torso/pelvis registration bounds crown and hip displacement without freezing
either landmark. Actual boot rows contact the floor; authored flight poses
retain their 3–5 pixel lift. The calibration records every measurement and
source crop. This changes visual registration only: run speed remains 450,
walk speed remains 300, and collision, jump, pause and entrance owners remain
unchanged. Walk/run transitions preserve cumulative gait phase, including
the unequal cel durations.

Run `node tools/check-level1-run-polish.cjs` for decoded-art, production draw,
alternating-contact, wrap, phase and 30/60/120/144 Hz plus irregular-delta checks.
Run `node tools/check-level-01-run.cjs <proof-folder>` after immutable art and
manifest pins are installed to capture the silent native Canvas comparison
and source/asset receipt. Hosted Makko and physical-device feel are separate
from this native production-owner evidence.
