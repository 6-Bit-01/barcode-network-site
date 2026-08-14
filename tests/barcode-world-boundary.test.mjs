import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BARCODE_WORLD_OWNER_PREVIEW_BRANCH,
  canServeBarcodeWorldPlaytest,
  isBarcodeWorldOwnerPreview,
  shouldHideBarcodeWorldPlaytest,
} from "../src/lib/barcode-world/playtest-access.mjs";

const gameFiles = [
  "middleware.ts",
  "src/app/world/playtest/page.tsx",
  "src/components/BarcodeWorldCardBattle.tsx",
  "src/components/BarcodeWorldCardBattle.module.css",
  "src/lib/barcode-world/card-battle-engine.mjs",
  "src/lib/barcode-world/playtest-access.mjs",
];

test("card battle is production-gated, unlinked, owner-preview-only, and has no live-system dependency", async () => {
  const contents = await Promise.all(
    gameFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  );
  const combined = contents.map(([, source]) => source).join("\n");
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /shouldHideBarcodeWorldPlaytest\(\)/,
  );
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /notFound\(\)/,
  );
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /BarcodeWorldCardBattle/,
  );
  assert.doesNotMatch(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /FracturedGatePrototype|BarcodeWorldGreybox/,
  );
  const middleware = contents.find(([path]) => path === "middleware.ts")[1];
  assert.match(middleware, /pathname === "\/world\/playtest"/);
  assert.match(middleware, /shouldHideBarcodeWorldPlaytest\(\)/);
  assert.match(middleware, /status:\s*404/);
  assert.match(middleware, /Cache-Control/);
  assert.match(middleware, /X-Robots-Tag/);
  assert.match(middleware, /private, no-store, max-age=0/);
  assert.match(middleware, /noindex, nofollow, noarchive, noimageindex/);
  assert.doesNotMatch(
    combined,
    /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/,
  );
  assert.doesNotMatch(
    combined,
    /\b(localStorage|sessionStorage|indexedDB)\b/,
  );
  assert.doesNotMatch(
    combined,
    /(?:from|import)\s+["'][^"']*(?:bnl|queue|relay|journal|supabase|redis)/i,
  );

  const publicShell = (
    await Promise.all(
      [
        "src/components/Header.tsx",
        "src/app/layout.tsx",
        "src/app/sitemap.ts",
      ].map((path) => readFile(path, "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(publicShell, /\/world\/playtest/);
});

test("only local development and the exact card-battle PR preview can render the playtest", () => {
  const ownerPreview = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: BARCODE_WORLD_OWNER_PREVIEW_BRANCH,
  };
  assert.equal(isBarcodeWorldOwnerPreview(ownerPreview), true);
  assert.equal(canServeBarcodeWorldPlaytest(ownerPreview), true);
  assert.equal(shouldHideBarcodeWorldPlaytest(ownerPreview), false);

  assert.equal(
    shouldHideBarcodeWorldPlaytest({
      ...ownerPreview,
      VERCEL_GIT_COMMIT_REF: "agent/unrelated-preview",
    }),
    true,
  );
  assert.equal(
    shouldHideBarcodeWorldPlaytest({
      ...ownerPreview,
      VERCEL_ENV: "production",
    }),
    true,
  );
  assert.equal(
    shouldHideBarcodeWorldPlaytest({ NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    shouldHideBarcodeWorldPlaytest({ NODE_ENV: "development" }),
    false,
  );
  assert.equal(
    shouldHideBarcodeWorldPlaytest({ NODE_ENV: "test" }),
    true,
  );
  assert.equal(
    shouldHideBarcodeWorldPlaytest({
      ...ownerPreview,
      VERCEL_ENV: "staging",
    }),
    true,
  );
});

test("card battle preserves strategic clarity, causal review, semantic input, focus, touch targets, and reduced motion", async () => {
  const component = await readFile(
    "src/components/BarcodeWorldCardBattle.tsx",
    "utf8",
  );
  const css = await readFile(
    "src/components/BarcodeWorldCardBattle.module.css",
    "utf8",
  );
  assert.match(component, /aria-label="Four lane card battle"/);
  assert.match(component, /aria-label="Pressure track"/);
  assert.match(component, /BREACHER'S LOCKED PLAN/);
  assert.match(component, /IF YOU RESOLVE NOW/);
  assert.match(component, /IF PLACED HERE/);
  assert.match(component, /IF OUTFLANKED HERE/);
  assert.match(component, /LEAVES LANE/);
  assert.match(component, /WHAT JUST HAPPENED/);
  assert.match(component, /WHY PRESSURE MOVED/);
  assert.match(component, /ALL FOUR LANES AT ONCE/);
  assert.match(component, /Round details/);
  assert.match(component, /NO PLACEMENT LOCKED/);
  assert.doesNotMatch(component, /NO LEGAL PLAY/);
  assert.match(component, /if \(game\.phase !== "player-action"\) return null/);
  assert.match(component, /LOCKED/);
  assert.match(component, /BATTLE \/ EXPLORATION/);
  assert.match(component, /BREACHER/);
  assert.match(component, /UNLISTED PREVIEW/);
  assert.doesNotMatch(component, /Fractured Gate|MOVE RANGE|FAST \/ STANDARD \/ SLOW|PIVOT/);
  assert.match(component, /data-scene-cue=/);
  assert.match(component, /type="button"/);
  assert.match(component, /OPEN LANE/);
  assert.match(component, /RESOLVE ALL FOUR LANES/);
  assert.match(component, /scrollIntoView/);
  assert.match(component, /prefers-reduced-motion/);
  assert.match(component, /role="meter"/);
  assert.match(component, /aria-describedby/);
  assert.match(component, /resolveRound\(placePlayerCard/);
  assert.match(component, /identity stays hidden until Resolve/);
  assert.equal(component.match(/aria-live=/g)?.length, 1);
  assert.doesNotMatch(component, /aria-live="assertive"/);
  assert.match(component, /Reset · Same State/);
  assert.match(component, /Reset · New Shuffle/);
  assert.match(component, /Reduce motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /min-height:\s*max\(2\.75rem,\s*44px\)/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /\[data-state="open"\]/);
  assert.match(css, /\[data-scene-cue/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation-duration:\s*0\.001ms/);
});

test("shared live providers remain inert and expose only fallback state on the private prototype route", async () => {
  const [liveProvider, bnlProvider, siteChrome] = await Promise.all([
    readFile("src/components/LiveStatusProvider.tsx", "utf8"),
    readFile("src/components/BNLStatusProvider.tsx", "utf8"),
    readFile("src/components/SiteChrome.tsx", "utf8"),
  ]);
  for (const source of [liveProvider, bnlProvider]) {
    assert.match(source, /usePathname/);
    assert.match(source, /pathname === "\/world\/playtest"/);
    assert.match(source, /if \(isolatedPrototype\) return/);
  }
  assert.match(
    liveProvider,
    /isLive:\s*isolatedPrototype \? false : isLive/,
  );
  assert.match(
    bnlProvider,
    /value=\{isolatedPrototype \? null : controller\}/,
  );
  assert.match(siteChrome, /pathname === "\/world\/playtest"/);
  assert.match(siteChrome, /return children/);
  assert.match(siteChrome, /<Header \/>/);
  assert.match(siteChrome, /<BNLNetworkRelayShell \/>/);
});

function channelToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    .map((channel) => channelToLinear(Number.parseInt(channel, 16)));
  return (
    channels[0] * 0.2126 +
    channels[1] * 0.7152 +
    channels[2] * 0.0722
  );
}

function contrast(foreground, background) {
  const brighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (brighter + 0.05) / (darker + 0.05);
}

test("card battle core text color pairs clear WCAG AA normal-text contrast", () => {
  const pairs = [
    ["#f2f8f5", "#080d12", "primary text"],
    ["#a9bbc0", "#080d12", "muted text"],
    ["#79e7ff", "#080d12", "cyan labels"],
    ["#ffd36a", "#080d12", "amber labels"],
    ["#06130d", "#71f7aa", "primary action"],
    ["#171000", "#ffd36a", "selected cue"],
    ["#aeb8bb", "#12191f", "disabled explanation"],
  ];
  for (const [foreground, background, label] of pairs) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${label} must be at least 4.5:1`,
    );
  }
});
