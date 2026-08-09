import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/overlay/foreground/calibration/page.tsx", "utf8");
const preview = readFileSync("src/app/overlay/foreground/calibration/ForegroundCalibrationPreview.tsx", "utf8");
const strip = readFileSync("src/components/ForegroundOverlayStrip.tsx", "utf8");
const css = readFileSync("src/app/overlay/foreground/calibration/foreground-calibration.css", "utf8");
const combined = `${page}\n${preview}\n${strip}`;

test("foreground calibration remains isolated from live queue and overlay state", () => {
  assert.match(preview, /data-calibration-only="true"/);
  assert.doesNotMatch(combined, /fetch\s*\(/);
  assert.doesNotMatch(combined, /@\/lib\/(?:queue|live-overlay)/);
  assert.doesNotMatch(combined, /@\/components\/(?:LiveOverlayReceiver|AdminRadioQueueControl)/);
});

test("identity line alternates artist for 12 seconds and track for 6 seconds", () => {
  assert.match(strip, /FOREGROUND_ARTIST_HOLD_MS = 12_000/);
  assert.match(strip, /FOREGROUND_TRACK_HOLD_MS = 6_000/);
  assert.match(strip, /setPhase\("artist"\)/);
  assert.match(strip, /setPhase\("track"\)/);
  assert.match(strip, /data-identity-phase=\{phase\}/);
  assert.match(preview, /ARTIST 12s/);
  assert.match(preview, /TRACK 6s/);
});

test("identity text moves slowly only when its measured width overflows", () => {
  assert.match(strip, /new ResizeObserver\(measure\)/);
  assert.match(strip, /content\.scrollWidth - viewport\.clientWidth/);
  assert.match(strip, /if \(distance <= 2\)/);
  assert.match(strip, /data-overflowing=\{scroll\.distance > 0 \? "true" : "false"\}/);
  assert.match(css, /data-overflowing="true"/);
  assert.match(css, /@keyframes fg-slow-overflow/);
  assert.doesNotMatch(css, /marquee/i);
});

test("lower line is an OPEN or CLOSED action rail without permanent TikTok copy", () => {
  assert.match(strip, /foreground-strip-intake--\$\{submissionsOpen \? "open" : "closed"\}/);
  assert.match(strip, /submissionsOpen \? "OPEN" : "CLOSED"/);
  assert.match(page, /SKIP SENT/);
  assert.match(page, /SKIP CONFIRMED/);
  assert.match(page, /label: "BNL"/);
  assert.match(page, /SPONSOR BREAK/);
  assert.doesNotMatch(combined, /live on tiktok/i);
  assert.doesNotMatch(combined, /watch.*tiktok/i);
});

test("calibration keeps the 100px strip, Wheel emblem, and enlarged count", () => {
  assert.match(preview, /"--fg-height": "100px"/);
  assert.match(preview, /"--fg-wheel-size": "92px"/);
  assert.match(preview, /"--fg-wheel-count-size": "50px"/);
  assert.match(strip, /foreground-strip-wheel-count/);
  assert.match(strip, /Wheel spins owed/);
  assert.match(css, /conic-gradient\(/);
  assert.match(css, /font-size: var\(--fg-wheel-count-size\)/);
});

test("ordinary calibration link renders a review while source mode keeps exact chroma geometry", () => {
  assert.match(page, /view=\{firstQueryValue\(query\.view\) === "source" \? "source" : "review"\}/);
  assert.match(preview, /SOURCE_WIDTH = 1080/);
  assert.match(preview, /SOURCE_HEIGHT = 1920/);
  assert.match(preview, /data-view="review"/);
  assert.match(preview, /data-view="source"/);
  assert.match(preview, /Open exact 1080×1920 chroma source/);
  assert.match(preview, /"--fg-anchor-y": "1222px"/);
  assert.match(preview, /"--fg-side-margin": "24px"/);
  assert.match(preview, /"--fg-key-color": "#0000ff"/);
  assert.match(css, /top: calc\(var\(--fg-anchor-y\) - var\(--fg-height\)\)/);
});

test("calibration route is noindex and does not expose site chrome", () => {
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(css, /body > :not\(main\):not\(script\):not\(style\)/);
  assert.match(css, /display: none !important/);
});
