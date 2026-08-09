import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/overlay/foreground/calibration/page.tsx", "utf8");
const css = readFileSync("src/app/overlay/foreground/calibration/foreground-calibration.css", "utf8");

test("foreground calibration is isolated from live queue and overlay state", () => {
  assert.match(page, /data-calibration-only="true"/);
  assert.doesNotMatch(page, /fetch\s*\(/);
  assert.doesNotMatch(page, /@\/lib\/(?:queue|live-overlay)/);
  assert.doesNotMatch(page, /@\/components\/(?:LiveOverlayReceiver|AdminRadioQueueControl)/);
});

test("foreground calibration locks the owner-approved 100px strip and enlarged Wheel count", () => {
  assert.match(page, /height: 100/);
  assert.match(page, /primarySize: 31/);
  assert.match(page, /secondarySize: 20/);
  assert.match(page, /wheelSize: 92/);
  assert.match(page, /wheelCountSize: 50/);
  assert.match(page, /data-preset="locked-100"/);
  assert.match(page, /data-source-resolution="1080x1920"/);
  assert.doesNotMatch(page, /compact:/);
  assert.doesNotMatch(page, /balanced:/);
  assert.doesNotMatch(page, /large:/);
  assert.match(css, /font-size: var\(--fg-wheel-count-size\)/);
});

test("strip is anchored above the supplied scene chat boundary with a flat chroma key", () => {
  assert.match(page, /const CHROMA_BLUE = "#0000ff"/);
  assert.match(page, /const STRIP_ANCHOR_Y = 1222/);
  assert.match(page, /const STRIP_SIDE_MARGIN = 24/);
  assert.match(css, /background: var\(--fg-key-color\) !important/);
  assert.match(css, /top: calc\(var\(--fg-anchor-y\) - var\(--fg-height\)\)/);
  assert.match(css, /left: var\(--fg-side-margin\)/);
  assert.match(css, /right: var\(--fg-side-margin\)/);
});

test("calibration proves one-line, two-line, long-copy, and Wheel readability", () => {
  assert.match(page, /long:/);
  assert.match(page, /single:/);
  assert.match(page, /commercial:/);
  assert.match(page, /closed:/);
  assert.match(page, /fg-calibration-strip--two-line/);
  assert.match(page, /fg-calibration-strip--one-line/);
  assert.match(css, /fg-calibration-strip--one-line \.fg-calibration-primary/);
  assert.match(page, /Wheel spins unlocked/);
  assert.match(page, /fg-calibration-wheel-label">Spins/);
  assert.match(css, /conic-gradient\(/);
  assert.match(css, /text-overflow: ellipsis/);
});

test("calibration route is noindex and does not expose control chrome", () => {
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(css, /header,/);
  assert.match(css, /footer,/);
  assert.match(css, /display: none !important/);
});
