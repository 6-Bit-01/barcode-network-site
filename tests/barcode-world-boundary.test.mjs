import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gameFiles = [
  "middleware.ts",
  "src/app/world/playtest/page.tsx",
  "src/components/FracturedGatePrototype.tsx",
  "src/components/FracturedGatePrototype.module.css",
  "src/lib/barcode-world/constants.mjs",
  "src/lib/barcode-world/fractured-gate-engine.mjs",
];

test("Fractured Gate is production-gated, unlinked, local-only, and has no live-system dependency", async () => {
  const contents = await Promise.all(
    gameFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  );
  const combined = contents.map(([, source]) => source).join("\n");
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /process\.env\.NODE_ENV === "production"/,
  );
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /notFound\(\)/,
  );
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /FracturedGatePrototype/,
  );
  assert.doesNotMatch(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /BarcodeWorldGreybox/,
  );
  const middleware = contents.find(([path]) => path === "middleware.ts")[1];
  assert.match(middleware, /pathname === "\/world\/playtest"/);
  assert.match(middleware, /process\.env\.NODE_ENV === "production"/);
  assert.match(middleware, /status:\s*404/);
  assert.match(middleware, /Cache-Control/);
  assert.match(middleware, /X-Robots-Tag/);
  assert.doesNotMatch(
    combined,
    /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/,
  );
  assert.doesNotMatch(combined, /\b(localStorage|sessionStorage|indexedDB)\b/);
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

test("Fractured Gate preserves semantic input, focus, non-color cues, touch targets, and reduced motion", async () => {
  const component = await readFile(
    "src/components/FracturedGatePrototype.tsx",
    "utf8",
  );
  const css = await readFile(
    "src/components/FracturedGatePrototype.module.css",
    "utf8",
  );
  assert.match(component, /aria-label="The Fractured Gate tactical board"/);
  assert.match(component, /aria-label="Current battle phase"/);
  assert.match(component, /"Observe"/);
  assert.match(component, /"Plan actions"/);
  assert.match(component, /"Commit plans"/);
  assert.match(component, /"Action phase"/);
  assert.match(component, /"Aftermath"/);
  assert.match(component, /MOVE RANGE/);
  assert.match(component, /ENEMY PRESSURE/);
  assert.match(component, /CURRENT BUILD LINE/);
  assert.match(component, /62 PLAYABLE DIAMONDS · 4 ENEMIES/);
  assert.match(component, /data-action-shortcut="Move"/);
  assert.match(component, /data-action-shortcut="Attack"/);
  assert.match(component, /data-action-shortcut="Defend"/);
  assert.match(component, /data-action-shortcut="Use"/);
  assert.match(component, /BUILD TACTIC/);
  assert.match(component, /END PLANNING/);
  assert.match(component, /planned ·/);
  assert.match(component, /cyan ghost moves only when the Action Phase begins/);
  assert.match(component, /BEGIN EXCHANGE/);
  assert.match(component, /VIEW BATTLE RESULTS/);
  assert.match(component, /BEGIN FAST ACTIONS/);
  assert.match(component, /REVIEW AFTERMATH/);
  assert.match(component, /Command refunded after exchange/);
  assert.match(component, /Powered service feed/);
  assert.doesNotMatch(component, /window\.setTimeout/);
  assert.doesNotMatch(component, />\s*SETTLE\s*</);
  assert.match(component, /powered by Gate Actuator/);
  assert.match(component, /className=\{styles\.physicalGate\}/);
  assert.match(component, /className=\{styles\.physicalDivider\}/);
  assert.match(component, /className=\{styles\.physicalActuator\}/);
  assert.match(component, /className=\{styles\.physicalBollard\}/);
  for (const actorClass of [
    "enemy_breacher",
    "enemy_guard",
    "enemy_controller",
    "enemy_pressure",
  ]) {
    assert.match(css, new RegExp(`\\.${actorClass}`));
  }
  assert.match(component, /data-terrain=/);
  assert.match(component, /type="button"/);
  assert.match(component, /TARGET/);
  assert.match(component, /CONFIRMED/);
  assert.match(component, /Reduce motion/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /min-height:\s*max\(2\.75rem,\s*44px\)/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(
    css,
    /clip-path:\s*polygon\(50% 0,\s*100% 50%,\s*50% 100%,\s*0 50%\)/,
  );
  assert.match(css, /\.movementPassThrough/);
  assert.match(css, /grid-template-columns:\s*repeat\(6,\s*1fr\)/);
  assert.match(css, /\.actionDock/);
  assert.match(css, /\.intentSelectableFocus/);
  assert.match(css, /\.locationShell/);
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
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    .map((channel) => channelToLinear(Number.parseInt(channel, 16)));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const brighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (brighter + 0.05) / (darker + 0.05);
}

test("Fractured Gate core text color pairs clear WCAG AA normal-text contrast", () => {
  const pairs = [
    ["#f1f7f3", "#0b1117", "primary text"],
    ["#a8b8bd", "#0b1117", "muted text"],
    ["#61dcff", "#0b1117", "cyan labels"],
    ["#ffd166", "#0b1117", "amber labels"],
    ["#07130c", "#63ff9f", "primary action"],
    ["#171000", "#ffd166", "target cue"],
    ["#9da5a8", "#11171b", "disabled explanation"],
  ];
  for (const [foreground, background, label] of pairs) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${label} must be at least 4.5:1`,
    );
  }
});
