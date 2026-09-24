import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const require = createRequire(import.meta.url);
const React = require("react");
let renderedPathname = "/";
const headerModule = { exports: {} };
const headerMocks = {
  react: { ...React, useState: () => [true, () => {}] },
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  "next/image": ({ unoptimized: _unoptimized, ...props }) => React.createElement("img", props),
  "next/navigation": { usePathname: () => renderedPathname },
  "./LiveStatusProvider": { useLiveStatus: () => ({ siteShowMode: "standby", queueHref: null, streamUrl: null }) },
  "./GlitchText": { GlitchText: ({ text }) => React.createElement("span", null, text) },
  "@/content": { siteConfig: { logo: "/logo.png", name: "BARCODE Network" } },
};
vm.runInNewContext(ts.transpileModule(read("src/components/Header.tsx"), {
  fileName: "Header.tsx",
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, {
  module: headerModule,
  exports: headerModule.exports,
  require: (id) => Object.hasOwn(headerMocks, id) ? headerMocks[id] : require(id),
});

function assertActiveNavigation(pathname, expectedHref) {
  renderedPathname = pathname;
  const markup = require("react-dom/server").renderToStaticMarkup(React.createElement(headerModule.exports.Header));
  for (const label of ["Primary navigation", "Mobile primary navigation"]) {
    const nav = markup.match(new RegExp(`<nav[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</nav>`))?.[1];
    assert.ok(nav, `${label} renders at ${pathname}`);
    const active = [...nav.matchAll(/<a\b([^>]*)>/g)]
      .filter((match) => match[1].includes('aria-current="page"'))
      .map((match) => match[1].match(/href="([^"]+)"/)?.[1]);
    assert.deepEqual(active, expectedHref ? [expectedHref] : [], `${label} at ${pathname}`);
  }
}

test("desktop and mobile navigation retain Radio and BNL parent sections on child pages", () => {
  for (const pathname of ["/radio", "/radio/", "/radio/archive", "/radio/deck"]) assertActiveNavigation(pathname, "/radio");
  for (const pathname of ["/bnl", "/bnl/", "/bnl/music", "/journal", "/journal/saved-entry"]) assertActiveNavigation(pathname, "/bnl");
});

test("parent navigation matches whole path segments and preserves other exact destinations", () => {
  for (const pathname of ["/radioactive", "/bnl-old", "/journalism", "/admin/queue", "/admin/ballads", "/queue", "/releases/other"]) assertActiveNavigation(pathname, null);
  for (const pathname of ["/", "/terminal", "/database", "/releases", "/transmissions", "/merch"]) assertActiveNavigation(pathname, pathname);
});

test("fabricated SystemTicker metrics and duplicate LiveBanner surfaces are not rendered globally", () => {
  const layout = read("src/app/layout.tsx");
  const home = read("src/app/page.tsx");
  assert.doesNotMatch(layout, /SystemTicker|<LiveBanner/);
  assert.doesNotMatch(home, /<LiveBanner/);
  assert.ok(!fs.existsSync(new URL("../src/components/SystemTicker.tsx", import.meta.url)));
});

test("static footer operational claims are removed", () => {
  const footer = read("src/components/Footer.tsx");
  const submissionRouting = read("src/lib/radio-submission-routing.ts");

  assert.doesNotMatch(footer, /Network Online|Systems Operational|all systems operational/i);
  assert.match(footer, /Host-led artist discovery/);
  assert.match(footer, /submission\.footerSummary/);
  assert.match(submissionRouting, /Terminal is the Network archive\/interface/);
});

test("Header is the only primary global BARCODE Radio live and submissions surface", () => {
  const layout = read("src/app/layout.tsx");
  const header = read("src/components/Header.tsx");

  assert.doesNotMatch(layout, /LiveBanner/);
  assert.match(header, /Primary BARCODE Radio live and submissions status/);
  assert.match(header, /siteShowMode === "broadcast_live"/);
  assert.match(header, /siteShowMode === "intake_open"/);
});

test("Header navigation remains compact until xl and switches consistently", () => {
  const header = read("src/components/Header.tsx");

  assert.doesNotMatch(header, /hidden md:flex/);
  assert.doesNotMatch(header, /md:hidden/);
  assert.match(header, /hidden xl:flex/);
  assert.match(header, /xl:hidden/);
  assert.match(header, /\{ href: "\/terminal", label: "Terminal" \}/);
  assert.match(header, /label: "Terminal Archive"/);
});

test("BNL-01 Hub replaces Journal in global navigation while Journal routes remain active aliases", () => {
  const header = read("src/components/Header.tsx");
  const footer = read("src/components/Footer.tsx");

  assert.match(header, /\{ href: "\/bnl", label: "BNL-01 Hub" \}/);
  assert.doesNotMatch(header, /\{ href: "\/journal", label: "Journal" \}/);
  assert.match(header, /pathname === "\/journal"/);
  assert.match(header, /pathname\.startsWith\("\/journal\/"\)/);
  assert.match(footer, /href="\/bnl"/);
  assert.match(footer, />\s*BNL-01 Hub\s*</);
  assert.doesNotMatch(footer, /BNL Journal/);
});

test("Header live CTA has compact mobile labels and full accessible labels", () => {
  const header = read("src/components/Header.tsx");

  assert.match(header, /sm:hidden/);
  assert.match(header, /"LIVE"/);
  assert.match(header, /"SUBMIT"/);
  assert.match(header, /hidden sm:inline/);
  assert.match(header, /BARCODE RADIO LIVE/);
  assert.match(header, /SUBMISSIONS OPEN/);
  assert.match(header, /aria-label=\{`Primary BARCODE Radio live and submissions status: \$\{liveLabel\}`\}/);
});

test("Header mobile menu exposes truthful expanded state and controls relationship", () => {
  const header = read("src/components/Header.tsx");

  assert.match(header, /const menuId = "primary-mobile-navigation"/);
  assert.match(header, /aria-expanded=\{open\}/);
  assert.match(header, /aria-controls=\{menuId\}/);
  assert.match(header, /id=\{menuId\}/);
});

test("LiveStatusProvider still derives public state from verified admin and queue contracts", () => {
  const provider = read("src/components/LiveStatusProvider.tsx");

  assert.match(provider, /fetch\("\/api\/admin\/live"/);
  assert.match(provider, /capabilities\?\.queueProduction === true/);
  assert.match(provider, /fetch\("\/api\/queue"/);
  assert.match(provider, /derivePublicShowState/);
});

test("BNL relay surfaces loading, confirmed, degraded sync, and unavailable retrying states", () => {
  const relay = read("src/components/BNLRelay.tsx");
  const card = read("src/components/BNLStatusCard.tsx");

  assert.match(relay, /FETCHING RELAY/);
  assert.match(relay, /LINK ACTIVE|LINK QUIET/);
  assert.match(relay, /RELAY SYNC DEGRADED/);
  assert.match(relay, /RELAY SYNC FAILURE/);
  assert.match(relay, /SYNC UNAVAILABLE — RETRYING/);
  assert.match(card, /FETCHING RELAY/);
});

test("operational Radio submission surfaces share the gated route while historical Auxchord identity remains intact", () => {
  const layout = read("src/app/layout.tsx");
  const radio = read("src/app/radio/page.tsx");
  const footer = read("src/components/Footer.tsx");
  const siteChrome = read("src/components/SiteChrome.tsx");
  const terminal = read("src/app/terminal/page.tsx");
  const readModel = read("src/app/api/bnl/read-model/route.ts");
  const content = read("src/content.ts");

  assert.match(radio, /getRadioSubmissionRouting/);
  assert.match(layout, /getRadioSubmissionRouting/);
  assert.match(layout, /radioSubmission=\{radioSubmission\}/);
  assert.doesNotMatch(footer, /getRadioSubmissionRouting/);
  assert.match(footer, /submission: RadioSubmissionRouting/);
  assert.match(siteChrome, /<Footer submission=\{radioSubmission\}/);
  assert.match(terminal, /getRadioSubmissionRouting/);
  assert.match(readModel, /getRadioSubmissionRouting/);
  assert.doesNotMatch(radio, /externalLinks\.auxchord/);
  assert.doesNotMatch(footer, /externalLinks\.auxchord/);
  assert.doesNotMatch(terminal, /externalLinks\.auxchord/);
  assert.match(radio, /<RadioTikTokLink/);
  assert.match(radio, /externalLinks\.discord/);
  assert.match(content, /auxchord: "https:\/\/www\.auxchord\.app\/91"/);
  assert.match(content, /tiktokLive: "https:\/\/www\.tiktok\.com\/@six\.bit\/live"/);
  assert.match(content, /discord: "https:\/\/discord\.gg\/4tHazmD528"/);
  assert.doesNotMatch(radio, /Broadcast Receipts|views|taps|ReceiptRow/);
  assert.doesNotMatch(content, /receipts:/);
});
