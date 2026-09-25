import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(outputText, {
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
    module: cjsModule, exports: cjsModule.exports, process, URL, encodeURIComponent,
  }, { filename: file });
  return cjsModule.exports;
}
const { deriveRadioQueueEntryState, isPublicTikTokBroadcastLive } = load("src/lib/live-status-public.ts");
const { resolveQueueOperationalAccess } = load("src/lib/queue-production.ts");
const snapshot = (overrides = {}) => ({
  sessionActive: true,
  session: { sessionId: "public-night", purpose: "live_broadcast", status: "open", broadcastPhase: "submission_window", showStarted: false },
  status: { isOpen: true, isFull: false },
  queue: [], completed: [], nowPlaying: null, upNext: null,
  ...overrides,
});
const entry = (queueSnapshot = snapshot(), overrides = {}) => deriveRadioQueueEntryState({ queueProductionEnabled: true, readState: "ready", queueSnapshot, ...overrides });

test("TikTok live entry requires a current real broadcast, including full or closed intake", () => {
  const base = snapshot();
  const live = (queueSnapshot, overrides = {}) => isPublicTikTokBroadcastLive({ queueProductionEnabled: true, readState: "ready", queueSnapshot, ...overrides });
  assert.equal(live(base), false, "opening intake is not going live");
  const active = snapshot({ session: { ...base.session, broadcastPhase: "broadcast_active" } });
  for (const status of [{ isOpen: true, isFull: false }, { isOpen: false, isFull: false }, { isOpen: false, isFull: true }]) assert.equal(live({ ...active, status }), true);
  assert.equal(live(snapshot({ session: { ...base.session, showStarted: true } })), true);
  for (const purpose of ["rehearsal", "simulation", "internal_test", null, undefined]) assert.equal(live({ ...active, session: { ...active.session, purpose } }), false);
  for (const raw of [null, { ...active, session: null }, { ...active, sessionActive: false }, { ...active, suppressPublicLiveStatus: true }, { ...active, session: { ...active.session, status: "archived" } }, { ...active, session: { ...active.session, broadcastPhase: "ended" } }]) assert.equal(live(raw), false);
  for (const readState of ["loading", "unavailable", "disabled"]) assert.equal(live(active, { readState }), false, "failed reads must drop a stale live destination");
  assert.equal(live(active, { queueProductionEnabled: false }), false);
});

test("TikTok links render the profile offline and the configured live destination only on air", () => {
  let tiktokBroadcastLive = false;
  const { RadioTikTokLink } = load("src/components/RadioTikTokLink.tsx", {
    "@/content": { externalLinks: { tiktok: "https://www.tiktok.com/@six.bit", tiktokLive: "https://www.tiktok.com/@six.bit/live" } },
    "@/components/LiveStatusProvider": { useLiveStatus: () => ({ tiktokBroadcastLive, streamUrl: "https://www.tiktok.com/@six.bit/live?source=radio" }) },
  });
  const render = () => require("react-dom/server").renderToStaticMarkup(require("react").createElement(RadioTikTokLink));
  assert.match(render(), /href="https:\/\/www.tiktok.com\/@six.bit"/);
  assert.match(render(), /Visit TikTok/);
  assert.doesNotMatch(render(), /Watch LIVE/);
  tiktokBroadcastLive = true;
  assert.match(render(), /href="https:\/\/www.tiktok.com\/@six.bit\/live\?source=radio"/);
  assert.match(render(), /Watch LIVE on TikTok/);
});

test("Radio never mistakes initial, failed, or disabled reads for an open or closed queue", () => {
  for (const readState of ["loading", "unavailable", "disabled"]) {
    const result = entry(snapshot(), { readState });
    assert.equal(result.status, readState === "loading" ? "loading" : "unavailable");
    assert.equal(result.href, null, "stale successful data must not keep an entry link after failure");
  }
  assert.equal(entry(snapshot(), { queueProductionEnabled: false }).href, null);
});

test("Radio entry reflects open, closed-intake, live and capacity states without hiding the active queue", () => {
  const open = snapshot();
  assert.equal(entry(open).status, "open");
  assert.equal(entry(open).href, "/queue/public-night");
  const closed = { ...open, status: { isOpen: false, isFull: false } };
  assert.equal(entry(closed).status, "standby");
  assert.equal(entry(closed).href, "/queue/public-night");
  for (const [isOpen, status] of [[true, "live_open"], [false, "live_closed"]]) {
    const live = snapshot({ session: { ...open.session, broadcastPhase: "broadcast_active" }, status: { isOpen, isFull: false } });
    assert.equal(entry(live).status, status);
    assert.equal(entry(live).href, "/queue/public-night");
  }
  assert.equal(entry(snapshot({ status: { isOpen: false, isFull: true } })).status, "full");
});

test("Radio does not advertise private, missing, stale, archived, ended or unknown-purpose sessions", () => {
  const base = snapshot();
  for (const purpose of ["rehearsal", "simulation", "internal_test", "unknown", undefined]) {
    const result = entry(snapshot({ session: { ...base.session, purpose } }));
    assert.equal(result.status, "closed");
    assert.equal(result.href, null);
  }
  for (const hidden of [snapshot({ session: null }), snapshot({ sessionActive: false }), snapshot({ session: { ...base.session, status: "archived" } }), snapshot({ session: { ...base.session, broadcastPhase: "ended" } })]) {
    assert.equal(entry(hidden).status, "closed");
    assert.equal(entry(hidden).href, null);
  }
  assert.equal(entry(snapshot({ session: { ...base.session, sessionId: "show / one" } })).href, "/queue/show%20%2F%20one");
});

async function route({ raw = snapshot(), production = true, adminToken, rehearsalToken, readFails = false, sessionPageId } = {}) {
  let reads = 0, sanitizations = 0;
  const env = { BARCODE_QUEUE_PRODUCTION_ENABLED: production ? "true" : "false" };
  const auth = {
    COOKIE_NAME: "admin", REHEARSAL_QUEUE_COOKIE_NAME: "rehearsal",
    verifyAdminToken: async (token) => token === "valid-admin",
    verifyRehearsalQueueToken: async (token, id) => token === `signed:${id}`,
  };
  const access = load("src/lib/queue-rehearsal-access.ts", {
    "@/lib/auth": auth,
    "@/lib/queue-production": { resolveQueueOperationalAccess: (authorities) => resolveQueueOperationalAccess(authorities, env) },
  });
  const React = require("react");
  const page = load(sessionPageId ? "src/app/queue/[sessionId]/page.tsx" : "src/app/queue/page.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "@/components/QueueEntryPortal": { QueueEntryPortal: ({ sessionId, detail }) => React.createElement("div", { "data-portal-session": sessionId, "data-portal-detail": detail }) },
    "@/components/PublicQueueSession": { PublicQueueSession: ({ sessionId }) => React.createElement("div", { "data-queue-session": sessionId }) },
    "next/headers": { cookies: async () => ({ get: (name) => ({ value: name === "admin" ? adminToken : rehearsalToken }) }) },
    "next/navigation": { redirect: (href) => { throw Object.assign(new Error("redirect"), { href }); } },
    "@/lib/auth": auth,
    "@/lib/queue-rehearsal-access": access,
    "@/lib/queue": {
      getPublicQueueSnapshot: async () => { reads++; if (readFails) throw new Error("fixture storage unavailable"); return raw; },
      sanitizeQueueSnapshotForPublic: (value) => {
        sanitizations++;
        assert.equal(value, raw);
        return value.session?.purpose === "live_broadcast" ? value : snapshot({ session: null, sessionActive: false });
      },
    },
  });
  let href;
  try {
    const result = await page.default({ params: Promise.resolve({ sessionId: sessionPageId }) });
    assert.ok(sessionPageId, "queue entry must redirect without rendering a gateway");
    return { markup: require("react-dom/server").renderToStaticMarkup(result), reads, sanitizations };
  }
  catch (error) { if (!error.href) throw error; href = error.href; }
  return { href, reads, sanitizations };
}

test("/queue immediately redirects open, closed-intake and full sessions after one sanitized read", async () => {
  for (const status of [{ isOpen: true }, { isOpen: false }, { isOpen: false, isFull: true }]) {
    assert.deepEqual(await route({ raw: snapshot({ status }) }), { href: "/queue/public-night", reads: 1, sanitizations: 1 });
  }
});

test("the digital portal belongs to the current authorized session, including closed and full intake", async () => {
  for (const status of [{ isOpen: true, isFull: false }, { isOpen: false, isFull: false }, { isOpen: false, isFull: true }]) {
    const result = await route({ raw: snapshot({ status }), sessionPageId: "public-night" });
    assert.match(result.markup, /data-portal-session="public-night"/);
    assert.match(result.markup, /data-queue-session="public-night"/);
    assert.equal(result.reads, 1, "the portal adds no queue read");
    assert.equal(result.sanitizations, 1);
  }
  const live = snapshot({ session: { ...snapshot().session, broadcastPhase: "broadcast_active" }, status: { isOpen: false } });
  assert.match((await route({ raw: live, sessionPageId: "public-night" })).markup, /BROADCAST LIVE \/ INTAKE SEALED/);
});

test("portal rendering cannot bypass access, current-session routing or private isolation", async () => {
  const privateSnapshot = snapshot({ session: { ...snapshot().session, sessionId: "private-night", purpose: "rehearsal" } });
  assert.equal((await route({ production: false, sessionPageId: "public-night" })).href, "/radio");
  assert.equal((await route({ sessionPageId: "old-night" })).href, "/queue/public-night");
  for (const raw of [snapshot({ session: null }), privateSnapshot, snapshot({ session: { ...snapshot().session, status: "archived" } })]) {
    assert.doesNotMatch((await route({ raw, sessionPageId: "public-night" })).markup, /data-portal-session|data-queue-session/);
  }
  assert.match((await route({ raw: privateSnapshot, production: false, rehearsalToken: "signed:private-night", sessionPageId: "private-night" })).markup, /data-portal-session="private-night"/);
  assert.equal((await route({ raw: privateSnapshot, production: false, rehearsalToken: "signed:old-night", sessionPageId: "private-night" })).href, "/radio");
});

test("/queue sends missing, ended and private public sessions back to Radio without a redirect loop", async () => {
  const base = snapshot();
  for (const raw of [snapshot({ session: null }), snapshot({ sessionActive: false }), snapshot({ session: { ...base.session, status: "archived" } }), snapshot({ session: { ...base.session, broadcastPhase: "ended" } }), snapshot({ session: { ...base.session, purpose: "rehearsal" } })]) {
    assert.equal((await route({ raw })).href, "/radio#queue-status");
  }
});

test("/queue rejects disabled anonymous access before reading the queue", async () => {
  assert.deepEqual(await route({ production: false }), { href: "/radio", reads: 0, sanitizations: 0 });
});

test("/queue returns failed reads to Radio's recoverable status view", async () => {
  assert.deepEqual(await route({ readFails: true }), { href: "/radio#queue-status", reads: 1, sanitizations: 0 });
});

test("/queue retains admin and exact current rehearsal access, with no privilege for stale or invalid tokens", async () => {
  const raw = snapshot({ session: { ...snapshot().session, sessionId: "private-night", purpose: "rehearsal" } });
  assert.deepEqual(await route({ raw, production: false, adminToken: "valid-admin" }), { href: "/queue/private-night", reads: 1, sanitizations: 0 });
  assert.deepEqual(await route({ raw, production: false, rehearsalToken: "signed:private-night" }), { href: "/queue/private-night", reads: 1, sanitizations: 0 });
  for (const rehearsalToken of ["signed:other-night", "invalid"]) assert.equal((await route({ raw, production: false, rehearsalToken })).href, "/radio");
  assert.equal((await route({ raw: { ...raw, sessionActive: false }, production: false, rehearsalToken: "signed:private-night" })).href, "/radio");
  assert.equal((await route({ raw: snapshot(), production: false, rehearsalToken: "signed:public-night" })).href, "/radio");
});

test("Radio's primary card renders a direct session link only from current public state", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const render = (radioQueueEntry) => {
    const { RadioQueueEntry } = load("src/components/RadioQueueEntry.tsx", {
      "next/link": ({ children, prefetch, ...props }) => { void prefetch; return React.createElement("a", props, children); },
      "@/components/LiveStatusProvider": { useLiveStatus: () => ({ radioQueueEntry, refreshQueueStatus: () => {} }) },
    });
    return renderToStaticMarkup(React.createElement(RadioQueueEntry));
  };
  assert.match(render(entry()), /href="\/queue\/public-night"/);
  assert.match(render(entry()), /Submit a track/);
  assert.match(render(entry(snapshot({ status: { isOpen: false } }))), /View current queue/);
  assert.doesNotMatch(render(entry(snapshot({ session: null }))), /href="\/queue/);
  const closed = render(entry(snapshot({ session: null })));
  assert.match(closed, /href="#broadcast-archive"/);
  assert.match(closed, /Explore past broadcasts/);
  assert.match(closed, /Next broadcast/);
  assert.doesNotMatch(closed, /href="\/radio\/archive"|Open Broadcast Archive/);
  for (const status of ["loading", "unavailable", "standby", "open", "live_open", "live_closed", "full"]) {
    assert.doesNotMatch(render({ status, href: ["loading", "unavailable"].includes(status) ? null : "/queue/public-night" }), /Open Broadcast Archive/, `${status} must retain its current queue action`);
  }
  assert.match(render(entry(snapshot(), { readState: "unavailable" })), /Status unavailable/);
  assert.match(render(entry(snapshot(), { readState: "loading" })), /Checking the queue/);
  const source = fs.readFileSync(new URL("../src/components/RadioQueueEntry.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(|setInterval|startSessionBoundPolling/, "the card must reuse the existing queue read");
  assert.equal(fs.existsSync(new URL("../src/components/PublicQueueGateway.tsx", import.meta.url)), false);
});

test("Radio discovery retains Archive paths without claiming a broadcast from missing data", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { RadioBroadcastFeatureView } = load("src/components/RadioBroadcastFeature.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "@/components/RadioTikTokLink": { RadioTikTokLink: () => React.createElement("a", { href: "https://www.tiktok.com/@six.bit/live" }, "Watch LIVE on TikTok") },
    "@/lib/radio-show-feature": { radioShowDate: value => value, radioShowDuration: seconds => String(seconds) },
    "@/lib/session-bound-polling": {},
    "./RadioBroadcastFeature.module.css": new Proxy({}, { get: (_, key) => String(key) }),
  });
  const render = props => renderToStaticMarkup(React.createElement(RadioBroadcastFeatureView, props));
  for (const unavailable of [false, true]) {
    const html = render({ feature: null, unavailable });
    assert.match(html, /href="\/radio\/archive"/);
    assert.match(html, /Explore BARCODE Radio/);
    assert.doesNotMatch(html, /On air now|Between broadcasts|href="\/radio\/deck"/);
    assert.match(html, unavailable ? /temporarily unavailable/ : /Loading the latest show/);
  }
  const show = { title: "Public show", showDate: "2026-09-18", href: "/radio/archive?show=public-night", tracksInShow: 44, artistCredits: 30, wheelSpins: 10, durationSeconds: 20000, hostFinishedExternalTracks: 2, artists: [{ name: "Public artist", href: "/radio/archive?artist=public-artist" }] };
  const base = { schemaVersion: "radio_show_feature_v2", mode: "archive", show, submissionsOpen: false, queueHref: null };
  const archive = render({ feature: base });
  assert.match(archive, /href="\/radio\/archive\?show=public-night"/);
  assert.match(archive, /href="\/radio\/archive\?view=artists"/);
  assert.match(archive, /href="\/bnl\/music"/);
  assert.match(archive, /Full-length playback is not confirmed/);
  assert.doesNotMatch(archive, /Watch LIVE|Enter the live Deck/);
  const intake = render({ feature: { ...base, submissionsOpen: true, queueHref: "/queue/next-night" } });
  assert.match(intake, /href="\/queue\/next-night"/);
  assert.match(intake, /The Broadcast Archive/);
  const live = render({ feature: { ...base, mode: "live", show: { ...show, href: "/radio/deck" } } });
  assert.match(live, /href="\/radio\/deck"/);
  assert.match(live, /On air now/);
  assert.match(live, /Browse all past shows/);
  assert.doesNotMatch(live, /Between broadcasts|href="\/bnl\/music"/);
});


test("HQ compact discovery preserves exact archived-show links and only uses the Deck for live broadcasts", () => {
  const React = require("react");
  const { RadioBroadcastFeatureView } = load("src/components/RadioBroadcastFeature.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "@/components/RadioTikTokLink": { RadioTikTokLink: () => React.createElement("a", { href: "https://www.tiktok.com/@six.bit/live" }, "Watch LIVE on TikTok") },
    "@/lib/radio-show-feature": { radioShowDate: value => value, radioShowDuration: seconds => String(seconds) },
    "@/lib/session-bound-polling": {},
    "./RadioBroadcastFeature.module.css": new Proxy({}, { get: (_, key) => String(key) }),
  });
  const render = props => require("react-dom/server").renderToStaticMarkup(React.createElement(RadioBroadcastFeatureView, { ...props, compact: true }));
  const feature = { mode: "archive", show: { title: "Public night", showDate: "2026-09-18", href: "/radio/archive?view=shows&show=public-night" }, submissionsOpen: false };
  for (const submissionsOpen of [false, true]) {
    const html = render({ feature: { ...feature, submissionsOpen } });
    assert.ok(html.includes('href="/radio/archive?view=shows&amp;show=public-night"'));
    assert.match(html, /Latest archived show/);
    assert.match(html, /Public night/);
    assert.match(html, /href="\/radio\/archive\?view=artists"/);
    assert.match(html, /href="\/bnl\/music"/);
    assert.doesNotMatch(html, /On air now|Watch LIVE|href="\/radio\/deck"/);
  }
  const live = render({ feature: { ...feature, mode: "live", show: { ...feature.show, href: "/radio/deck" } } });
  assert.match(live, /href="\/radio\/deck"/);
  assert.match(live, /Watch LIVE|Current show/);
  assert.match(live, /All past shows/);
  for (const props of [{ feature: null }, { feature: null, unavailable: true }, { feature: { ...feature, show: null } }]) {
    const html = render(props);
    assert.match(html, /href="\/radio\/archive"/);
    assert.doesNotMatch(html, /On air now|Current show|Latest archived show|Public night/);
    assert.match(html, props.unavailable ? /temporarily unavailable/ : props.feature ? /as new broadcasts are added/ : /Loading the latest show/);
  }
});

test("Radio keeps the Archive panel during live shows and never offers the Deck", () => {
  const React = require("react");
  const render = require("react-dom/server").renderToStaticMarkup;
  const { RadioBroadcastFeatureView } = load("src/components/RadioBroadcastFeature.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "@/components/RadioTikTokLink": { RadioTikTokLink: () => null },
    "@/lib/radio-show-feature": { radioShowDate: value => value, radioShowDuration: seconds => String(seconds) },
    "@/lib/session-bound-polling": {},
    "./RadioBroadcastFeature.module.css": {},
  });
  for (const mode of ["live", "archive"]) {
    const feature = { mode, submissionsOpen: true, queueHref: "/queue/live-show", show: {
      title: mode === "live" ? "Current live show" : "Previous public show", href: mode === "live" ? "/radio/deck" : "/radio/archive?show=past",
      showDate: "2026-09-18", artists: [], tracksInShow: 12,
    } };
    const html = render(React.createElement(RadioBroadcastFeatureView, { feature, archiveOnly: true }));
    assert.match(html, /The Broadcast Archive/);
    assert.doesNotMatch(html, /Broadcast Deck|\/radio\/deck|\/queue\/live-show|Current live show|Between broadcasts/);
  }
  for (const live of [false, true]) {
    const { RadioQueueEntry } = load("src/components/RadioQueueEntry.tsx", {
      "next/link": ({ children, prefetch, ...props }) => { void prefetch; return React.createElement("a", props, children); },
      "@/components/LiveStatusProvider": { useLiveStatus: () => ({ radioQueueEntry: { status: live ? "live_open" : "closed", href: live ? "/queue/live-show" : null }, tiktokBroadcastLive: live, refreshQueueStatus() {} }) },
    });
    const html = render(React.createElement(RadioQueueEntry, null, "Scheduled show date"));
    assert.doesNotMatch(html, /Broadcast Deck|\/radio\/deck|Watch &amp; follow/);
    assert.equal(html.includes('href="#broadcast-archive"'), !live);
    assert.equal(html.includes("Scheduled show date"), !live);
    if (live) assert.match(html, /Submit a track/);
  }
});
