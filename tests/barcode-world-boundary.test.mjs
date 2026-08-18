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
  "src/lib/barcode-world/three-route-engine.mjs",
  "src/lib/barcode-world/playtest-access.mjs",
];

test("v0.3 remains production-gated, unlinked, owner-preview-only, and locally inert", async () => {
  const contents = await Promise.all(
    gameFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  );
  const combined = contents.map(([, source]) => source).join("\n");
  const page = contents.find(([path]) => path.endsWith("page.tsx"))[1];
  assert.match(page, /shouldHideBarcodeWorldPlaytest\(\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /BarcodeWorldCardBattle/);
  assert.match(page, /Three-Route Theater/);

  const middleware = contents.find(([path]) => path === "middleware.ts")[1];
  assert.match(middleware, /pathname === "\/world\/playtest"/);
  assert.match(middleware, /shouldHideBarcodeWorldPlaytest\(\)/);
  assert.match(middleware, /status:\s*404/);
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

test("only development and the exact v0.3 branch preview can render", () => {
  assert.equal(BARCODE_WORLD_OWNER_PREVIEW_BRANCH, "agent/barcode-world-three-route-v0-3");
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

test("v0.3 categorizes cards—not lanes—and binds card-first choices to theater targets", async () => {
  const [component, engine] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/lib/barcode-world/three-route-engine.mjs", "utf8"),
  ]);

  assert.match(component, /THREE-ROUTE THEATER/);
  assert.match(component, /v0\.3/);
  assert.match(component, /NEUTRAL CHOICE LANES/);
  assert.match(component, /ROUTE A/);
  assert.match(component, /ROUTE B/);
  assert.match(component, /ROUTE C/);
  assert.match(component, /FOUR SEPARATE CARD POOLS/);
  assert.match(component, /YOUR CARD LIBRARY/);
  assert.match(component, /01 · CHOOSE A CARD/);
  assert.match(component, /02 · CHOOSE A TARGET/);
  assert.match(component, /styles\.planDock/);
  assert.match(component, /styles\.selectedCardBar/);
  assert.match(component, /data-mode=\{selectedCard \? "selected"/);
  assert.match(component, /const \[activeCategory, setActiveCategory\]/);
  assert.match(component, /styles\.categorySelector/);
  assert.match(component, /aria-expanded=\{isOpen\}/);
  assert.match(component, /visibleCards\.map/);
  assert.match(component, /CARD_CATEGORIES\.map/);
  assert.match(component, /getVisibleCategoryCards/);
  assert.match(component, /getThreeRouteChoices\(game, selectedCard\.id\)/);
  assert.match(
    component,
    /\{selectedCard \? \(\s*<section className=\{styles\.routeBoard\}/s,
  );
  assert.match(component, /setActiveCategory\(null\)/);

  for (const category of ["movement", "defense", "offense", "special"]) {
    assert.match(engine, new RegExp(`${category}: Object\\.freeze\\(\\[`, "i"), `${category} loadout`);
  }
  assert.match(engine, /choiceLanes:\s*3/);
  assert.match(engine, /openingPerCategory:\s*4/);
  assert.match(engine, /categoryCapacity:\s*5/);
  assert.match(engine, /slice\(0, THREE_ROUTE_RULES\.choiceLanes\)/);
  assert.match(engine, /targetFromZone/);
  assert.match(engine, /targetFromEnemy/);
  assert.match(engine, /targetFromObject/);
  assert.match(engine, /kind:\s*"plan"/);
});

test("one Wayfinder and variable persistent enemies occupy one connected, readable theater", async () => {
  const [component, engine, css] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/lib/barcode-world/three-route-engine.mjs", "utf8"),
    readFile("src/components/BarcodeWorldCardBattle.module.css", "utf8"),
  ]);

  assert.match(component, /CONNECTED BATTLE THEATER/);
  assert.match(component, /scenario\.edges\.map/);
  assert.match(component, /scenario\.zones\.map/);
  assert.match(component, /scenario\.objects\.map/);
  assert.match(component, /enemies\.filter\(\(enemy\) => enemy\.hp > 0\)\.map/);
  assert.equal((component.match(/className=\{styles\.wayfinderActor\}/g) ?? []).length, 1);
  assert.match(component, /PROJECTED/);
  assert.match(component, /projectPlannedTheater/);
  assert.match(component, /styles\.projectedLine/);
  assert.match(component, /PHYSICAL PATH/);
  assert.match(component, /LEGAL TARGET/);
  assert.match(component, /YOU · WAYFINDER/);
  assert.match(component, /data-preview/);
  assert.match(component, /focusedChoiceId/);
  assert.doesNotMatch(component, /styles\.routeLine/);

  assert.match(engine, /id:\s*"sublevel-duel-v0\.3"/);
  assert.match(engine, /id:\s*"fractured-gate-routes-v0\.3"/);
  assert.match(engine, /id:\s*"coolant-extraction-v0\.3"/);
  assert.match(engine, /1 VS 1/);
  assert.match(engine, /1 VS 2/);
  assert.match(engine, /1 VS 3/);
  assert.match(engine, /playerStart/);
  assert.match(engine, /edges:/);

  assert.match(css, /\.battlefield\s*\{/);
  assert.match(css, /\.edgeLayer\s*\{/);
  assert.match(css, /\.theaterLegend\s*\{/);
  assert.match(css, /\.wayfinderFigure/);
  assert.match(css, /\.enemyFigure/);
  assert.match(css, /@keyframes playerAct/);
  assert.match(css, /@keyframes enemyAct/);
  assert.match(css, /@keyframes actorHit/);
});

test("resolution visibly runs player chain, then enemy intents, and only then settles", async () => {
  const [component, engine] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/lib/barcode-world/three-route-engine.mjs", "utf8"),
  ]);

  assert.match(component, /1 · BUILD YOUR PLAN/);
  assert.match(component, /2 · YOUR ACTIONS/);
  assert.match(component, /3 · ENEMY RESPONSE/);
  assert.match(component, /4 · ROUND RESULT/);
  assert.match(component, /const \[pendingResolution, setPendingResolution\]/);
  assert.match(component, /pendingResolution\?\.currentReview\?\.events\[resolutionEventIndex\]/);
  assert.match(component, /setGame\(pendingResolution\)/);
  assert.match(component, /ROUND NOT YET RESOLVED/);
  assert.match(component, /ROUND RESOLVES AFTER BOTH SIDES/);
  assert.match(component, /game\.phase === "round-review"/);

  const playerLoop = engine.indexOf("for (let index = 0; index < draft.player.plan.length");
  const enemyLoop = engine.indexOf("for (let index = 0; index < draft.enemyIntents.length");
  const settleEvent = engine.indexOf('phase: "settle"', enemyLoop);
  assert.ok(playerLoop > 0 && playerLoop < enemyLoop, "player chain resolves before enemies");
  assert.ok(enemyLoop < settleEvent, "enemy intents resolve before settle");
  assert.match(engine, /sceneCue:\s*success \? "player-success" : "player-failed"/);
});

test("general cards remain reusable while Context Cards are rare, source-bound exceptions", async () => {
  const engine = await readFile("src/lib/barcode-world/three-route-engine.mjs", "utf8");
  assert.match(engine, /GENERAL_CARD_DEFINITIONS/);
  assert.match(engine, /CONTEXT_CARD_DEFINITIONS/);
  assert.match(engine, /name: "Advance"/);
  assert.match(engine, /name: "Guard"/);
  assert.match(engine, /name: "Strike"/);
  assert.match(engine, /name: "Charge"/);
  assert.match(engine, /"overload-relay"/);
  assert.match(engine, /"seal-gate"/);
  assert.match(engine, /"vent-coolant"/);
  assert.match(engine, /currentZone\?\.feature === definition\.contextFeature/);
  assert.match(engine, /category !== "special"/);
  assert.match(engine, /if \(cardValue\.context\)/);
  assert.doesNotMatch(
    engine.slice(engine.indexOf("CATEGORY_LOADOUTS"), engine.indexOf("function zone")),
    /overload-relay|seal-gate|vent-coolant/,
  );
});

test("replenishment is category-specific and never an automatic placement refill", async () => {
  const [component, engine] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/lib/barcode-world/three-route-engine.mjs", "utf8"),
  ]);
  assert.match(component, /\{visibleCards\.length\} READY/);
  assert.match(component, /\{usableCount\} USABLE HERE/);
  assert.match(component, /\{pool\.drawPile\.length\} DRAW/);
  assert.match(component, /CYCLE · 1R/);
  assert.match(component, /Wait for a grant or reshuffle/);
  assert.match(engine, /drawUsedCategoryOnSuccess/);
  assert.match(engine, /emptyPoolFallback/);
  assert.match(engine, /breakDrawPerCategory/);
  assert.match(engine, /roundStart:\s*\{ movement: 1 \}/);
  assert.match(engine, /"SUCCESS · " \+ category\.toUpperCase\(\)/);
  assert.match(engine, /"CACHE TAP"/);
  assert.match(engine, /"PRESSURE BREAK"/);
  assert.doesNotMatch(engine, /placementRefill|refillOnPlacement/);
});

test("Health, Guard, enemy intent, and Control are persistent and visibly distinct", async () => {
  const [component, engine, types, css] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/lib/barcode-world/three-route-engine.mjs", "utf8"),
    readFile("src/lib/barcode-world/three-route-engine.d.mts", "utf8"),
    readFile("src/components/BarcodeWorldCardBattle.module.css", "utf8"),
  ]);

  assert.match(component, /HEALTH \{playerCondition\}\/\{playerMaximum\}/);
  assert.match(component, /HEALTH 0 = COMPROMISED/);
  assert.match(component, /POSITION · NOT HEALTH/);
  assert.match(component, /function intentLabel/);
  assert.match(component, /IMPACT/);
  assert.match(component, /styles\.combatHud/);
  assert.match(component, /styles\.healthMeter/);
  assert.doesNotMatch(component, /styles\.enemyHudList/);
  assert.match(engine, /conditionStart:\s*12/);
  assert.match(engine, /conditionMax:\s*12/);
  assert.match(engine, /const absorbed = Math\.min\(intent\.impact, output\.playerGuard\)/);
  assert.match(engine, /output\.playerCondition - remaining/);
  assert.match(engine, /outcome:\s*"compromised"/);
  assert.doesNotMatch(engine, /draft\.player\.guard = 0/);
  assert.match(types, /condition:\s*number/);
  assert.match(types, /impact:\s*number/);
  assert.match(css, /\.combatHud\s*\{/);
  assert.match(css, /\.healthMeter\s*\{/);
});

test("the compact surface preserves odds truth, causal detail, resets, and accessible interaction", async () => {
  const [component, css] = await Promise.all([
    readFile("src/components/BarcodeWorldCardBattle.tsx", "utf8"),
    readFile("src/components/BarcodeWorldCardBattle.module.css", "utf8"),
  ]);
  assert.match(component, /role="meter"/);
  assert.match(component, /aria-valuenow=\{choice\.forecast\.chance\}/);
  assert.match(component, /<b>SUCCESS<\/b>\{choice\.forecast\.successLabel\}/);
  assert.match(component, /<b>FAILURE<\/b>\{choice\.forecast\.failureLabel\}/);
  assert.match(component, /if \(chance < 45\) return "low"/);
  assert.match(component, /if \(chance < 70\) return "medium"/);
  assert.match(component, /odds, not promises/i);
  assert.doesNotMatch(component, /\b(?:GOOD|BAD|BEST)\b/i);
  assert.match(component, /ROUND DETAILS ·/);
  assert.match(component, /DETERMINISTIC EVENT RECORD/);
  assert.match(component, /styles\.selectedCardBar/);
  assert.match(component, /styles\.planDock/);
  assert.match(component, /REPLAY SAME STATE/);
  assert.match(component, /NEW SHUFFLE/);
  assert.match(component, /Reduce theater motion/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /aria-live="assertive"/);
  assert.match(component, /type="button"/);
  assert.match(component, /aria-pressed/);

  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*2\.65rem/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /forced-colors:\s*active/);
  assert.match(css, /animation-duration:\s*0\.001ms/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /--cyan:\s*#79e7ff/);
  assert.match(css, /--green:\s*#64ef9b/);
  assert.match(css, /\.categoryGrid\s*\{/);
  assert.match(css, /\.categoryDrawer\s*\{/);
  assert.match(css, /\.selectedCardBar\s*\{/);
  assert.match(css, /\.planDock\s*\{/);
  assert.match(
    css,
    /@media \(max-width: 420px\)[\s\S]*?\.categoryGrid,[\s\S]*?\.poolCards \{\s*grid-template-columns: repeat\(2,/,
  );
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
  }
  assert.match(liveProvider, /if \(isolatedPrototype\) return/);
  assert.match(bnlProvider, /if \(disabled\) return/);
  assert.match(
    liveProvider,
    /isLive:\s*isolatedPrototype \? false : isLive/,
  );
  assert.match(
    bnlProvider,
    /value=\{disabled \? null : controller\}/,
  );
  assert.match(siteChrome, /pathname === "\/world\/playtest"/);
  assert.match(siteChrome, /return children/);
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

test("core v0.3 battle colors clear WCAG AA normal-text contrast", () => {
  const pairs = [
    ["#f4f7f4", "#070a0c", "primary text"],
    ["#98a7aa", "#070a0c", "muted text"],
    ["#79e7ff", "#070a0c", "cyan labels"],
    ["#ffd66f", "#070a0c", "amber labels"],
    ["#071008", "#64ef9b", "primary action"],
    ["#ff6d78", "#070a0c", "low odds"],
    ["#64ef9b", "#070a0c", "high odds"],
  ];
  for (const [foreground, background, label] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${label} must be at least 4.5:1`);
  }
});
