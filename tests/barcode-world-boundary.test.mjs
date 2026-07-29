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
  "src/lib/barcode-world/fractured-gate-director-engine.mjs",
  "src/lib/barcode-world/fractured-gate-director-engine.d.mts",
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

test("the director cut is a one-screen semantic board with touch-safe controls", async () => {
  const component = await readFile(
    "src/components/FracturedGatePrototype.tsx",
    "utf8",
  );
  const css = await readFile(
    "src/components/FracturedGatePrototype.module.css",
    "utf8",
  );
  assert.match(component, /aria-label="The Fractured Gate tactical board"/);
  assert.match(component, /SAVE THE GATE/);
  assert.match(component, /POWER 2 ANCHORS/);
  assert.match(component, /REACH THE GATE/);
  assert.match(component, /SURVIVE 1 ENEMY TURN/);
  assert.match(component, /RAM breaks the Gate after three Slow smashes/);
  assert.match(component, /SELECT AGAIN TO EXECUTE/);
  assert.match(component, /NO TARGET IN RANGE/);
  assert.match(component, /ENEMIES ACT/);
  assert.match(component, /END TURN/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /DIRECTOR_CARDS/);
  assert.match(component, /IntentLines/);
  assert.match(component, /data-terrain=/);
  assert.match(component, /type="button"/);
  assert.match(component, /reduce motion/i);
  assert.doesNotMatch(component, /PLAN TRAY|PIVOT|LOCK PLAN|SETTLE/i);
  assert.doesNotMatch(component, /build dropdown|mission briefing/i);
  assert.match(css, /\.battleShell\s*\{/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /overflow:\s*hidden/);
  assert.match(css, /grid-template-rows:/);
  assert.match(css, /\.commandDock\s*\{/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /min-height:\s*max\(2\.75rem,\s*44px\)/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(
    css,
    /clip-path:\s*polygon\(50% 0,\s*100% 50%,\s*50% 100%,\s*0 50%\)/,
  );
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation-duration:\s*0\.001ms/);

  const referencedClasses = [
    ...component.matchAll(/styles\.([A-Za-z0-9_]+)/g),
  ].map((match) => match[1]);
  const definedClasses = new Set(
    [...css.matchAll(/^\.([A-Za-z0-9_-]+)/gm)].map((match) => match[1]),
  );
  assert.deepEqual(
    [...new Set(referencedClasses)].filter(
      (className) => !definedClasses.has(className),
    ),
    [],
    "every CSS-module reference must have a real class definition",
  );
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

test("Fractured Gate core text color pairs clear WCAG AA normal-text contrast", () => {
  const pairs = [
    ["#f3f8f5", "#090f16", "primary text"],
    ["#9aadb3", "#090f16", "muted text"],
    ["#62dcff", "#090f16", "cyan labels"],
    ["#ffd166", "#090f16", "amber labels"],
    ["#06130c", "#5eff9d", "primary action"],
    ["#171004", "#ffd166", "target cue"],
    ["#c5d0d3", "#0d1820", "card explanation"],
  ];
  for (const [foreground, background, label] of pairs) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${label} must be at least 4.5:1`,
    );
  }
});
