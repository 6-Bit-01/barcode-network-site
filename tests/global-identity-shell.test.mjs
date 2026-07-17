import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("fabricated SystemTicker metrics and duplicate LiveBanner surfaces are not rendered globally", () => {
  const layout = read("src/app/layout.tsx");
  const home = read("src/app/page.tsx");
  assert.doesNotMatch(layout, /SystemTicker|<LiveBanner/);
  assert.doesNotMatch(home, /<LiveBanner/);
  assert.ok(!fs.existsSync(new URL("../src/components/SystemTicker.tsx", import.meta.url)));
});

test("static footer operational claims are removed", () => {
  const footer = read("src/components/Footer.tsx");

  assert.doesNotMatch(footer, /Network Online|Systems Operational|all systems operational/i);
  assert.match(footer, /Host-led artist discovery/);
  assert.match(footer, /Terminal is the Network archive\/interface/);
});

test("Header is the only primary global BARCODE Radio live and submissions surface", () => {
  const layout = read("src/app/layout.tsx");
  const header = read("src/components/Header.tsx");

  assert.doesNotMatch(layout, /LiveBanner/);
  assert.match(header, /Primary BARCODE Radio live and submissions status/);
  assert.match(header, /siteShowMode === "broadcast_live"/);
  assert.match(header, /siteShowMode === "intake_open"/);
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

test("Radio page still links to existing Auxchord, TikTok Live, and Discord destinations without receipt metrics", () => {
  const radio = read("src/app/radio/page.tsx");
  const content = read("src/content.ts");

  assert.match(radio, /externalLinks\.auxchord/);
  assert.match(radio, /externalLinks\.tiktokLive/);
  assert.match(radio, /externalLinks\.discord/);
  assert.match(content, /auxchord: "https:\/\/aux\.fan\/@barcode_radio"/);
  assert.match(content, /tiktokLive: "https:\/\/www\.tiktok\.com\/@six\.bit\/live"/);
  assert.match(content, /discord: "https:\/\/discord\.gg\/4tHazmD528"/);
  assert.doesNotMatch(radio, /Broadcast Receipts|views|taps|ReceiptRow/);
  assert.doesNotMatch(content, /receipts:/);
});
