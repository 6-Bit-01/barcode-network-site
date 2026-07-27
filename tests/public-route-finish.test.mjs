import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public discovery metadata, robots, sitemap, and RSS standardize on www without rotating legacy GUIDs", () => {
  const layout = read("src/app/layout.tsx");
  const home = read("src/app/page.tsx");
  const robots = read("src/app/robots.ts");
  const sitemap = read("src/app/sitemap.ts");
  const feed = read("src/app/transmissions/feed/route.ts");

  assert.match(layout, /metadataBase: new URL\("https:\/\/www\.barcode-network\.com"\)/);
  assert.doesNotMatch(layout, /canonical: "\/"/);
  assert.doesNotMatch(layout, /url: "https:\/\/www\.barcode-network\.com"|url: "\/"/);
  assert.match(layout, /manifest: "\/site\.webmanifest"/);
  assert.doesNotMatch(layout, /\/barcode-radio\.png|\/og-image\.png|\/radio-og-image\.png|\/icon-192\.png|\/icon-512\.png|\/favicon/);
  assert.match(home, /alternates: \{ canonical: "\/" \}/);
  assert.match(home, /url: "\/"/);
  assert.match(home, /siteName: "BARCODE Network"/);
  assert.match(home, /images: \[\{ url: "\/barcode-radio\.png", width: 1200, height: 630/);
  assert.match(robots, /https:\/\/www\.barcode-network\.com\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/www\.barcode-network\.com/);
  assert.match(sitemap, /`\$\{base\}\/contact`/);
  assert.match(sitemap, /`\$\{base\}\/legal`/);
  assert.doesNotMatch(sitemap, /const now = new Date\(\)/);
  assert.match(feed, /const siteUrl = "https:\/\/www\.barcode-network\.com"/);
  assert.match(feed, /const legacyGuidSiteUrl = "https:\/\/barcode-network\.com"/);
  assert.match(feed, /<guid isPermaLink="true">\$\{legacyGuidSiteUrl\}\/transmissions\/\$\{post.slug\}<\/guid>/);
});

test("manifest stays truthful until correctly sized binary icons are available", () => {
  const manifest = read("public/site.webmanifest");
  const radio = read("src/app/radio/page.tsx");

  assert.match(manifest, /"id": "https:\/\/www\.barcode-network\.com\/"/);
  assert.match(manifest, /"start_url": "https:\/\/www\.barcode-network\.com\/"/);
  assert.doesNotMatch(manifest, /"icons"|\/logos\/emblem\.png|\/icon-192\.png|\/icon-512\.png/);
  assert.doesNotMatch(radio, /\/barcode-radio\.png|\/radio-og-image\.png|\/og-image\.png|width: 1200|height: 630/);
  assert.match(radio, /twitter: \{ card: "summary" \}/);
});

test("public route finish corrections cover Auxchord, PT scheduling, BNL routing, OBS noindex, and dossier link classification", () => {
  const content = read("src/content.ts");
  const links = read("src/lib/dossier-links.ts");
  const obs = read("src/app/obs/page.tsx");
  assert.match(content, /auxchord: "https:\/\/www\.auxchord\.app\/91"/);
  assert.doesNotMatch(content, /6:40 PM PST|7:00 PM PST|7:05 PM PST/);
  assert.match(content, /6:40 PM PT/);
  assert.match(content, /label: "BNL-01",[\s\S]*href: "\/bnl"/);
  assert.match(links, /auxchord\.app/);
  assert.match(obs, /robots: \{ index: false, follow: false \}/);
  assert.match(obs, /title: "OBS Overlay"/);
  assert.doesNotMatch(obs, /alternates: \{ canonical: "\/obs" \}/);
});

test("accessibility and reduced-motion finish remains explicit while protected mechanics are untouched", () => {
  const siteChrome = read("src/components/SiteChrome.tsx");
  const header = read("src/components/Header.tsx");
  const css = read("src/app/globals.css");
  const broadcastVideo = read("src/components/BroadcastVideo.tsx");
  const queueProduction = read("src/lib/queue-production.ts");
  const trustedOrigin = read("src/lib/trusted-requesting-site-origin.ts");
  const dossierWorkflow = read("src/lib/dossier-workflow.ts");

  assert.match(siteChrome, /href="#main-content"/);
  assert.ok(siteChrome.indexOf('className="skip-link"') < siteChrome.indexOf('<DataStream />'));
  assert.ok(siteChrome.indexOf('className="skip-link"') < siteChrome.indexOf('<Header />'));
  assert.ok(siteChrome.indexOf('className="skip-link"') < siteChrome.indexOf('<BNLNetworkRelayShell />'));
  assert.match(header, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(header, /aria-expanded=\{open\}/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.bnl-relay-scroll-track > span\[aria-hidden\]/);
  assert.match(broadcastVideo, /title="BARCODE Network intro broadcast"/);
  assert.match(queueProduction, /BARCODE_QUEUE_PRODUCTION_ENABLED/);
  assert.match(trustedOrigin, /PRODUCTION_SITE_ORIGIN = "https:\/\/barcode-network\.com"/);
  assert.match(dossierWorkflow, /PENDING|RESTRICTED|UNKNOWN/);
});
