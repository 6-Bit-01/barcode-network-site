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
  const radio = read("src/app/radio/page.tsx");
  const footer = read("src/components/Footer.tsx");
  const terminal = read("src/app/terminal/page.tsx");
  const readModel = read("src/app/api/bnl/read-model/route.ts");
  const content = read("src/content.ts");

  assert.match(radio, /getRadioSubmissionRouting/);
  assert.match(footer, /getRadioSubmissionRouting/);
  assert.match(terminal, /getRadioSubmissionRouting/);
  assert.match(readModel, /getRadioSubmissionRouting/);
  assert.doesNotMatch(radio, /externalLinks\.auxchord/);
  assert.doesNotMatch(footer, /externalLinks\.auxchord/);
  assert.doesNotMatch(terminal, /externalLinks\.auxchord/);
  assert.match(radio, /externalLinks\.tiktokLive/);
  assert.match(radio, /externalLinks\.discord/);
  assert.match(content, /auxchord: "https:\/\/aux\.fan\/@barcode_radio"/);
  assert.match(content, /tiktokLive: "https:\/\/www\.tiktok\.com\/@six\.bit\/live"/);
  assert.match(content, /discord: "https:\/\/discord\.gg\/4tHazmD528"/);
  assert.doesNotMatch(radio, /Broadcast Receipts|views|taps|ReceiptRow/);
  assert.doesNotMatch(content, /receipts:/);
});
