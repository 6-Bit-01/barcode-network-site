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

test("card battle remains production-gated, unlinked, owner-preview-only, and locally inert", async () => {
  const contents = await Promise.all(
    gameFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  );
  const combined = contents.map(([, source]) => source).join("\n");
  const page = contents.find(([path]) => path.endsWith("page.tsx"))[1];
  assert.match(page, /shouldHideBarcodeWorldPlaytest\(\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /BarcodeWorldCardBattle/);
  assert.doesNotMatch(page, /FracturedGatePrototype|BarcodeWorldGreybox/);

  const middleware = contents.find(([path]) => path === "middleware.ts")[1];
  assert.match(middleware, /pathname === "\/world\/playtest"/);
  assert.match(middleware, /shouldHideBarcodeWorldPlaytest\(\)/);
  assert.match(middleware, /status:\s*404/);
  assert.match(middleware, /Cache-Control/);
  assert.match(middleware, /X-Robots-Tag/);
  assert.match(middleware, /private, no-store, max-age=0/);
  assert.match(middleware, /noindex, nofollow, noarchive, noimageindex/);

  assert.doesNotMatch(combined, /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  assert.doesNotMatch(combined, /\b(localStorage|sessionStorage|indexedDB)\b/);
  assert.doesNotMatch(
    combined,
    /(?:from|import)\s+["'][^"']*(?:bnl|queue|relay|journal|supabase|redis)/i,
  );

  const publicShell = (
    await Promise.all([
      "src/components/Header.tsx",
      "src/app/layout.tsx",
      "src/app/sitemap.ts",
    ].map((path) => readFile(path, "utf8")))
  ).join("\n");
  assert.doesNotMatch(publicShell, /\/world\/playtest/);
});

test("only development and the exact card-battle branch preview can render", () => {
  const ownerPreview = {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: BARCODE_WORLD_OWNER_PREVIEW_BRANCH,
  };
  assert.equal(isBarcodeWorldOwnerPreview(ownerPreview), true);
  assert.equal(canServeBarcodeWorldPlaytest(ownerPreview), true);
  assert.equal(shouldHideBarcodeWorldPlaytest(ownerPreview), false);
  assert.equal(
    shouldHideBarcodeWorldPlaytest({ ...ownerPreview, VERCEL_GIT_COMMIT_REF: "agent/unrelated" }),
    true,
  );
  assert.equal(shouldHideBarcodeWorldPlaytest({ ...ownerPreview, VERCEL_ENV: "production" }), true);
  assert.equal(shouldHideBarcodeWorldPlaytest({ NODE_ENV: "production" }), true);
  assert.equal(shouldHideBarcodeWorldPlaytest({ NODE_ENV: "development" }), false);
  assert.equal(shouldHideBarcodeWorldPlaytest({ NODE_ENV: "test" }), true);
});

test("v0.2 keeps lanes above the six-card rack and exposes immediate probability truth", async () => {
  const [component, css] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/components/BarcodeWorldCardBattle.module.css", "utf8"),
  ]);

  assert.match(component, /PRIVATE BATTLE RESEARCH/);
  assert.match(component, /v0\.2/);
  assert.match(component, /UNLISTED/);
  assert.match(component, /IN MEMORY/);
  assert.match(component, /FOUR PHYSICAL FRONTS · SIX CARDS · VARIABLE FEED/);
  assert.match(component, /aria-labelledby="lane-board-title"/);
  assert.match(component, /id="rack-title"/);
  assert.ok(
    component.indexOf("<LaneBoard") < component.indexOf("<CardRack"),
    "lane board must render above the card rack",
  );
  assert.match(component, /SIX-SLOT RACK/);
  assert.match(component, /game\.player\.hand\.length/);
  assert.match(component, /CARD_BATTLE_RULES\.handSize - game\.player\.hand\.length/);
  assert.match(component, /WAITING FOR GRANT/);

  const probability = component.slice(
    component.indexOf("function ProbabilityBar"),
    component.indexOf("function PressureTrack"),
  );
  assert.match(probability, /role="meter"/);
  assert.match(probability, /aria-valuenow=\{forecast\.chance\}/);
  assert.match(probability, /<strong>\{forecast\.chance\}%<\/strong>/);
  assert.match(probability, /<b>SUCCESS<\/b>\{forecast\.successLabel\}/);
  assert.match(probability, /<b>FAIL<\/b>\{forecast\.failureLabel\}/);
  assert.doesNotMatch(probability, /\broll\b/i);
  assert.match(component, /ROLL \{result\.roll\}/);
  assert.match(component, /COLOR SHOWS THIS ROLL&apos;S ODDS—NOT THE MOVE&apos;S STRATEGIC VALUE/);
  assert.doesNotMatch(component, /\b(?:GOOD|BAD|BEST)\b/i);
  assert.match(component, /if \(chance < 45\) return "low"/);
  assert.match(component, /if \(chance < 70\) return "medium"/);
  assert.match(css, /\.forecast\[data-tone="low"\]\s*\{\s*--tone-color:\s*var\(--red\)/);
  assert.match(css, /\.forecast\[data-tone="medium"\]\s*\{\s*--tone-color:\s*var\(--amber\)/);
  assert.match(css, /\.forecast\[data-tone="high"\]\s*\{\s*--tone-color:\s*var\(--green\)/);

  assert.match(component, /getPlacementPreview\(game, selectedCard\.id, lane\)/);
  assert.match(component, /getLaneForecast\(game, lane\)/);
  assert.match(component, /ENEMY IN THIS FRONT/);
  assert.match(component, /LOCKED/);
  assert.match(component, /YOUR STACK/);
  assert.match(component, /stack\.length\}\/\{CARD_BATTLE_RULES\.maxStack\}/);
  assert.match(component, /TypeBadge/);
  for (const type of ["attack", "defend", "maneuver", "modifier", "preparation", "reaction", "finisher", "recovery"]) {
    assert.match(component, new RegExp(`${type}:`), `${type} badge`);
    assert.match(css, new RegExp(`data-type="${type}"`), `${type} color`);
  }
  assert.doesNotMatch(component, /Outflank|MOVE RANGE|FAST \/ STANDARD \/ SLOW|PIVOT/);
});

test("the battle remains physical with named fronts, visible enemies, and Resolve animation", async () => {
  const [component, css] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/components/BarcodeWorldCardBattle.module.css", "utf8"),
  ]);

  assert.match(component, /function BattleTheater/);
  assert.match(component, /PHYSICAL ENCOUNTER/);
  assert.match(component, /type ResolutionStage/);
  assert.match(component, /FRACTURED GATE/);
  assert.match(component, /WEST ACCESS/);
  assert.match(component, /CARGO DIVIDER/);
  assert.match(component, /SERVICE RELAY/);
  assert.match(component, /GATE THRESHOLD/);
  assert.match(component, /const ENEMY_ACTORS/);
  assert.match(component, /BREACHER RUNNER/);
  assert.match(component, /BREACHER BRUTE/);
  assert.match(component, /className=\{styles\.enemyPresence\}/);
  assert.match(component, /className=\{styles\.battleFront\}/);
  assert.match(component, /data-outcome=\{outcome\}/);
  assert.match(component, /data-player-action=\{playerMove\?\.category/);
  assert.match(component, /data-enemy-action=\{enemyMove\?\.category/);
  assert.match(component, /<BattleTheater game=\{theaterGame\} sequenceStage=\{theaterStage\} theaterRef=\{theaterRef\} \/>/);
  assert.ok(
    component.indexOf("<BattleTheater") < component.indexOf("<StatusBar"),
    "the physical battle theater must render at the top of the play surface",
  );
  assert.match(component, /scene\.scrollIntoView/);
  assert.match(component, /type ResolutionStage = "planning" \| "player" \| "enemy" \| "complete"/);
  assert.match(component, /const \[pendingResolution, setPendingResolution\]/);
  assert.match(component, /setResolutionStage\("player"\)/);
  assert.match(component, /setResolutionStage\("enemy"\)/);
  assert.match(component, /setResolutionStage\("complete"\)/);
  assert.match(component, /setGame\(pendingResolution\)/);
  assert.match(component, /pendingResolution \? null : game\.currentReview/);
  assert.match(component, /1 · PLAYER/);
  assert.match(component, /2 · ENEMY/);
  assert.match(component, /3 · RESOLVE/);
  assert.match(component, /PLAYER HIT/);
  assert.match(component, /PLAYER FAILED/);
  assert.match(component, /ENEMY STOPPED/);

  assert.match(css, /\.battlefield\s*\{/);
  assert.match(css, /\.combatant::before/);
  assert.match(css, /\.combatant::after/);
  assert.match(css, /@keyframes wayfinder-strike/);
  assert.match(css, /@keyframes enemy-hit/);
  assert.match(css, /@keyframes wayfinder-repelled/);
  assert.match(css, /@keyframes enemy-advance/);
  assert.match(css, /@keyframes enemy-stopped/);
  assert.match(css, /data-sequence="player"/);
  assert.match(css, /data-sequence="enemy"/);
  assert.match(css, /\.reducedMotion \*/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("scenario feed sources are composable and selectable rather than hardwired", async () => {
  const [component, engine] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/lib/barcode-world/card-battle-engine.mjs", "utf8"),
  ]);
  assert.match(component, /SCENARIO FEED/);
  assert.match(component, /REPLENISHMENT RECIPE/);
  assert.match(component, /CARD_BATTLE_SCENARIOS\.map/);
  assert.match(component, /onScenario=\{\(scenarioId\) => reset\(createCardBattleState\(game\.baseSeed, scenarioId\)\)\}/);
  assert.match(component, /"CARD EFFECTS"/);
  assert.match(engine, /roundStartDraw/);
  assert.match(engine, /contestedSuccessDraw/);
  assert.match(engine, /successfulComboDraw/);
  assert.match(engine, /fearUnlockDraw/);
  assert.match(engine, /pressureUnlockDraw/);
  assert.match(engine, /drawOnSuccess/);
  assert.match(engine, /emptyRackFallback/);
  assert.match(engine, /breakRefill/);
  assert.match(engine, /reservePerRoundBonus/);
  assert.match(engine, /id: "cascade-protocol-v0\.2"/);
  const cascade = engine.slice(
    engine.indexOf('id: "cascade-protocol-v0.2"'),
    engine.indexOf("}),", engine.indexOf('id: "cascade-protocol-v0.2"')),
  );
  assert.match(cascade, /roundStartDraw: 1/);
  assert.match(cascade, /contestedSuccessDraw: 1/);
  assert.match(cascade, /fearUnlockDraw: 2/);
});

test("the compact surface preserves causal detail, reset controls, and accessible interaction", async () => {
  const [component, css] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/components/BarcodeWorldCardBattle.module.css", "utf8"),
  ]);
  assert.match(component, /function RoundResolution/);
  assert.match(component, /CAUSAL EVENT LOG/);
  assert.match(component, /<details className=\{styles\.eventDetails\}>/);
  assert.match(component, /review\.events\.map/);
  assert.match(component, /replenishment\.sources\.map/);
  assert.match(component, /REPLAY SAME STATE/);
  assert.match(component, /NEW SHUFFLE/);
  assert.match(component, /RESET SAME STATE/);
  assert.match(component, /REDUCE MOTION/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /scrollIntoView/);
  assert.match(component, /aria-live="polite"/);
  assert.doesNotMatch(component, /aria-live="assertive"/);
  assert.match(component, /aria-label="Resolve all four lanes"/i);
  assert.match(component, />\s*RESOLVE\s*<\/button>/);
  assert.match(component, /type="button"/);
  assert.match(component, /aria-pressed=\{selected\}/);
  assert.match(component, /aria-valuemax=\{100\}/);
  assert.match(component, /aria-valuemin=\{0\}/);

  assert.match(css, /:focus-visible/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /min-height:\s*2\.9rem/);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /animation-duration:\s*0\.001ms/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.doesNotMatch(component, /<details[^>]*\sopen(?:=|\s|>)/);
});

test("shared live providers remain inert on the private prototype route", async () => {
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
  assert.match(liveProvider, /isLive:\s*isolatedPrototype \? false : isLive/);
  assert.match(bnlProvider, /value=\{isolatedPrototype \? null : controller\}/);
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
  const channels = hex.replace("#", "").match(/.{2}/g)
    .map((channel) => channelToLinear(Number.parseInt(channel, 16)));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const brighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (brighter + 0.05) / (darker + 0.05);
}

test("core battle colors clear WCAG AA normal-text contrast", () => {
  const pairs = [
    ["#f4f7f4", "#070a0c", "primary text"],
    ["#98a7aa", "#070a0c", "muted text"],
    ["#79e7ff", "#070a0c", "cyan labels"],
    ["#ffd66f", "#070a0c", "amber labels"],
    ["#06150d", "#64ef9b", "primary action"],
    ["#ff6d78", "#070a0c", "low odds"],
    ["#64ef9b", "#070a0c", "high odds"],
  ];
  for (const [foreground, background, label] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${label} must be at least 4.5:1`);
  }
});
