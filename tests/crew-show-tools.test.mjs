import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), root = path.resolve(import.meta.dirname, "..");
const clean = value => JSON.parse(JSON.stringify(value));
function load(relative, mocks = {}) {
 const filename = path.join(root, relative), target = { exports: {} };
 const source = fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "";
 vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
  module: target, exports: target.exports, Date, URL, Request, Response, Headers, AbortController, console,
  require: id => {
   if (Object.hasOwn(mocks, id)) return mocks[id];
   if (id === "server-only") return {};
   if (id.startsWith("@/") || id.startsWith(".")) {
    const resolved = id.startsWith("@/") ? path.join(root, "src", id.slice(2)) : path.resolve(path.dirname(filename), id);
    return load(path.relative(root, resolved + (fs.existsSync(resolved + ".ts") ? ".ts" : ".tsx")), mocks);
   }
   return require(id);
  },
 });
 return target.exports;
}
const day = "2026-10-01", now = new Date("2026-10-01T22:00:00Z");
const secret = "canary-private-financial-contact-upload";
function track(id, changes = {}) { return { id, artist: "Echo", submittedArtistName: "Echo", title: id, submittedSongTitle: id, lane: "regular", status: "queued", sourceType: "upload", durationIsEstimate: true, estimatedDurationSeconds: 300, createdAt: now.toISOString(), note: secret, contactEmail: secret + "@example.test", fileUrl: "https://private.test/" + secret, priorityUpgradePaymentId: secret, ...changes }; }
function session(id = "public-one", changes = {}) { return { sessionId: id, title: "BARCODE Radio", showDate: day, purpose: "live_broadcast", status: "open", queueOpen: true, queueCapacity: 44, acceptedCount: 2, completedCount: 0, activeCount: 2, broadcastStartedAt: "2026-10-01T21:00:00Z", showStarted: true, sponsorBreakStatus: "not_due", wheelSpinsOwed: 1, description: secret, sponsorBreakManualNote: secret, ...changes }; }
const publicTrack = (id, changes = {}) => ({ sessionId: "archived-one", sessionTitle: "Last show", showDate: "2026-09-30", trackId: id, title: id, projectLabel: "Echo", projectKey: "echo", outcome: "finished", lane: "regular", sourceType: "upload", collaboratorNames: null, ...changes });
function stats() { return { schemaVersion: "queue_public_history_projection_v1", visibility: "public_safe", historyCoverageStartedAt: "2026-08-24", builtAt: now.toISOString(), sourceRevision: 4, shows: [{ sessionId: "archived-one", title: "Last show", showDate: "2026-09-30", status: "archived", trackRoster: [publicTrack("old")] }, { sessionId: "archived-two", title: "Previous", showDate: "2026-09-29", status: "archived", trackRoster: [publicTrack("older", { sessionId: "archived-two" })] }], artists: [{ projectKey: "echo", projectLabel: "Echo", aliases: [], showCount: 2, tracks: [publicTrack("old"), publicTrack("older", { sessionId: "archived-two" })] }] }; }
function state(changes = {}) { return { revision: 5, session: session(), nowPlaying: null, nextInLine: track("next"), queue: [track("next"), track("later")], history: [], removed: [], publicStatus: { acceptedCount: 2, capacity: 44, isFull: false, pressure: "low" }, ...changes }; }
const crew = { user: { id: "crew-a", name: "Crew" }, session: { expiresAt: "2099-01-01T00:00:00Z" }, access: { owner: false, crew: true, permissions: ["show.overview", "insights.read"], availablePermissions: ["show.overview", "insights.read"] } };
function report(changes = {}) { return { timeline: { broadcastDurationSeconds: 3600 }, outcomes: { played: 2, finished: 1, skipped: 1, removed: 0, unplayed: 0 }, pacing: { modeledMusicAirtimeSeconds: 600, directlyObservedMusicAirtimeSeconds: 200, directlyObservedTrackCount: 1, fallbackTrackCount: 1, observedTrackCoveragePercent: 50, tracksPerBroadcastHour: 2, averageTransitionSeconds: null, sponsorBreakSeconds: 0, wheelCeremonySeconds: 120 }, calibration: { status: "review_required", reasons: [secret] }, secret, ...changes }; }

test("show projection permits only current genuine broadcast data and never private fields", () => {
 const { buildCrewShowOverview } = load("src/lib/crew-show.ts");
 assert.equal(typeof buildCrewShowOverview, "function");
 const dto = buildCrewShowOverview(state(), stats(), "later", now);
 assert.equal(dto.current, null); assert.equal(dto.next.id, "next"); assert.equal(dto.introduction.trackId, "later");
 assert.equal(dto.introduction.creditSource, "submitted_credit"); assert.equal(dto.introduction.identityStatus, "credited_group_not_verified_identity");
 assert.equal(dto.introduction.archive.showCount, 2); assert.equal(dto.introduction.archive.historyCoverageStartedAt, "2026-08-24");
 assert.equal(dto.timing.kind, "estimate"); assert.equal(dto.timing.unknownDurationCount, 2); assert.ok(dto.timing.remainingMusicSeconds > 0);
 assert.doesNotMatch(JSON.stringify(dto), new RegExp(secret));
});
test("private sessions, stale selections and simulation tracks do not enter Crew show DTO", () => {
 const { buildCrewShowOverview } = load("src/lib/crew-show.ts"); assert.equal(typeof buildCrewShowOverview, "function");
 for (const purpose of ["rehearsal", "simulation", "internal_test", "unknown"]) {
  const dto = buildCrewShowOverview(state({ session: session("private", { purpose }) }), stats(), undefined, now);
  assert.equal(dto.session, null); assert.equal(dto.upcoming.length, 0); assert.equal(dto.introduction, null);
 }
 const dto = buildCrewShowOverview(state({ queue: [track("sim", { isTestTrack: true }), track("later")], nextInLine: null }), stats(), "old-private-track", now);
 assert.equal(dto.upcoming.length, 1); assert.equal(dto.introduction.trackId, "later");
});
test("intro distinguishes reviewed credits, unrecorded history and unavailable archive", () => {
 const { buildCrewShowOverview } = load("src/lib/crew-show.ts"); assert.equal(typeof buildCrewShowOverview, "function");
 const selected = track("new", { artistCredit: { primary: "New artist", collaborators: ["Feature"], original: "New artist", decision: "whole", source: "admin" }, approvedArtistId: secret });
 const dto = buildCrewShowOverview(state({ nextInLine: selected, queue: [selected] }), stats(), undefined, now);
 assert.equal(dto.introduction.creditSource, "reviewed_credit"); assert.deepEqual(clean(dto.introduction.collaborators), ["Feature"]);
 assert.equal(dto.introduction.archive.showCount, 0); assert.equal(dto.introduction.identityStatus, "credited_group_not_verified_identity");
 assert.equal(buildCrewShowOverview(state(), null, undefined, now).introduction.archive.available, false);
});
test("maximum queue pressure remains visible and invalid archive contracts stay unavailable", () => {
 const { buildCrewShowOverview } = load("src/lib/crew-show.ts"), { buildCrewShowAnalytics } = load("src/lib/crew-show-analytics.ts");
 const dto = buildCrewShowOverview(state({ queue: Array.from({length:44},(_,i)=>track("real-"+i)), nextInLine:null, publicStatus: { acceptedCount: 44, capacity: 44, isFull: true, pressure: "max" } }), { ...stats(), visibility: "private" }, undefined, now);
 assert.equal(dto.pressure.level, "max"); assert.equal(dto.introduction.archive.available, false); assert.equal(dto.introduction.archive.showCount, null);
 const analytics = buildCrewShowAnalytics({ stats: { ...stats(), visibility: "private" }, reports: [], accounts: null, owner: true }, now);
 assert.equal(analytics.available, false); assert.equal(analytics.overview, null); assert.equal(analytics.financials.available, false);
});
test("archive outcomes exclude private, simulation, active and pre-coverage records", () => {
 const { buildCrewShowAnalytics } = load("src/lib/crew-show-analytics.ts"); assert.equal(typeof buildCrewShowAnalytics, "function");
 const source = stats(); source.shows.push(
  { ...source.shows[0], sessionId: "private", purpose: "rehearsal" },
  { ...source.shows[0], sessionId: "old", showDate: "2026-08-01" },
  { ...source.shows[0], sessionId: "current", status: "open" });
 source.shows[0].trackRoster.push(publicTrack("simulation", { isSimulation: true }));
 const dto = buildCrewShowAnalytics({ stats: source, reports: [], accounts: null, owner: false }, now);
 assert.equal(dto.overview.showCount, 2); assert.equal(dto.overview.submitted, 2); assert.equal(dto.overview.finished, 2);
 assert.equal(dto.artists[0].showCount, 2); assert.equal(dto.artists[0].identityStatus, "credited_group_not_verified_identity");
 assert.ok(dto.unavailable.includes("website_visits_and_referral_funnel")); assert.ok(dto.unavailable.includes("tiktok_unique_viewers"));
 assert.equal("financials" in dto, false); assert.equal(dto.accounts, null);
});
test("analytics reports compare modeled and directly observed music without promoting incomplete traces", () => {
 const { buildCrewShowAnalytics } = load("src/lib/crew-show-analytics.ts"); assert.equal(typeof buildCrewShowAnalytics, "function");
 const dto = buildCrewShowAnalytics({ stats: stats(), reports: [{ sessionId: "archived-one", report: report() }, { sessionId: "archived-two", report: report({ timeline: { broadcastDurationSeconds: null } }) }], accounts: { total: 10, verified: 7, active: 9, suspended: 1, signupsByMonth: [{ month: "2026-10", count: 3 }], privateAccounts: secret }, owner: false }, now);
 assert.equal(dto.comparison.latest.pacing.modeledMusicSeconds, 600); assert.equal(dto.comparison.latest.pacing.observedMusicSeconds, 200);
 assert.equal(dto.comparison.latest.pacing.observedCoveragePercent, 50); assert.equal(dto.comparison.latest.coverage, "partial");
 assert.equal(dto.comparison.previous.broadcastSeconds, null); assert.equal(dto.accounts.total, 10);
 assert.doesNotMatch(JSON.stringify(dto), new RegExp(secret));
});
test("Owner financials use confirmed amounts and dedup purchased/gifted overlap per payment", () => {
 const { buildCrewShowAnalytics } = load("src/lib/crew-show-analytics.ts"); assert.equal(typeof buildCrewShowAnalytics, "function");
 const paid = track("paid", { priorityUpgradeStatus: "paid", priorityUpgradePaidAt: now.toISOString(), priorityUpgradePaymentProvider: "stripe", priorityUpgradePaymentId: "pi_real", priorityUpgradeAmountCents: 700, priorityUpgradeCurrency: "usd", priorityGiftAttribution: { supporterName: "Fan", recipientName: "Echo" } });
 const euros = track("euros", { signalHoldStatus: "fulfilled", signalHoldPaidAt: now.toISOString(), signalHoldPaymentProvider: "stripe", signalHoldPaymentId: "pi_euros", signalHoldAmountCents: 300, signalHoldCurrency: "eur" });
 const pending = track("pending", { priorityUpgradeStatus: "checkout_pending", priorityUpgradeAmountCents: 9000, priorityUpgradePriceCents: 9000 });
 const input = { stats: stats(), reports: [], accounts: null, paymentStates: [state({ session: session("archived-one", { status: "archived" }), queue: [], nextInLine: null, history: [paid, { ...paid, id: "gift-overlap" }, euros, pending] })] };
 const owner = buildCrewShowAnalytics({ ...input, owner: true }, now);
 assert.deepEqual(clean(owner.financials.currencies), [{ currency: "EUR", amountCents: 300, paymentCount: 1 }, { currency: "USD", amountCents: 700, paymentCount: 1 }]);
 assert.equal(owner.financials.basis, "recorded_confirmed_gross"); assert.equal(owner.financials.refunds, null); assert.equal(owner.financials.net, null);
 assert.doesNotMatch(JSON.stringify(owner), /pi_real|pi_euros/);
 const crewDto = buildCrewShowAnalytics({ ...input, owner: false }, now); assert.equal("financials" in crewDto, false); assert.doesNotMatch(JSON.stringify(crewDto), /amountCents|paymentCount|recorded_confirmed_gross/);
});
test("conflicting payment records and unconfirmed amounts never become revenue estimates", () => {
 const { buildCrewShowAnalytics } = load("src/lib/crew-show-analytics.ts"); assert.equal(typeof buildCrewShowAnalytics, "function");
 const paid = track("paid", { priorityUpgradeStatus: "paid", priorityUpgradePaidAt: now.toISOString(), priorityUpgradePaymentProvider: "stripe", priorityUpgradePaymentId: "pi_conflict", priorityUpgradeAmountCents: 700, priorityUpgradeCurrency: "usd" });
 const dto = buildCrewShowAnalytics({ stats: stats(), reports: [], owner: true, accounts: null, paymentStates: [state({ session: session("archived-one", { status: "archived" }), history: [paid, { ...paid, id: "other", priorityUpgradeAmountCents: 800 }] })] }, now);
 assert.deepEqual(clean(dto.financials.currencies), []); assert.equal(dto.financials.coverage, "partial");
 const missing = buildCrewShowAnalytics({ stats: null, reports: [], owner: true, accounts: null }, now);
 assert.equal(missing.overview, null); assert.equal(missing.financials.available, false);
});
test("show route freshly checks exact permission and guest/revoked grants before native reads", async () => {
 let calls = 0, allowed = false;
 const mocks = { "@/lib/member-tools": { lookupMemberToolAccess: async (_req, permission) => { assert.equal(permission, "show.overview"); return allowed ? { ok: true, access: crew } : { ok: false, response: Response.json({ code: "ACCESS_DENIED" }, { status: 403 }) }; } }, "@/lib/live-overlay": { getLiveOverlayRuntimeState: async () => ({ playerSync: null, overlayState: null }) }, "@/lib/queue": { getRadioLiveQueueState: async () => { calls++; return state(); }, getPublicQueueStats: async () => stats() } };
 const route = load("src/app/api/member/tools/show/route.ts", mocks); assert.equal(typeof route.GET, "function");
 const req = new Request("https://www.barcode-network.com/api/member/tools/show");
 assert.equal((await route.GET(req)).status, 403); assert.equal(calls, 0);
 allowed = true; const result = await route.GET(req); assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "private, no-store");
 allowed = false; assert.equal((await route.GET(req)).status, 403); assert.equal(calls, 1);
});
test("Crew analytics never reads raw payment states, and financial failures cannot leak secrets", async () => {
 let owner = false, rawReads = 0;
 const mocks = { "@/lib/member-tools": { lookupMemberToolAccess: async (_req, permission) => { assert.equal(permission, "insights.read"); return { ok: true, access: { ...crew, access: { ...crew.access, owner } } }; }, fetchMemberToolInsights: async () => ({ accounts: { total: 2, verified: 1, active: 2, suspended: 0, signupsByMonth: [] } }) }, "@/lib/queue": { getPublicQueueStats: async () => stats(), getQueueSessionShowLog: async () => ({ report: report() }), getRadioQueueState: async () => { rawReads++; throw new Error(secret); } } };
 const route = load("src/app/api/member/tools/analytics/route.ts", mocks); assert.equal(typeof route.GET, "function");
 const req = new Request("https://www.barcode-network.com/api/member/tools/analytics");
 const crewResponse = await route.GET(req); assert.equal(crewResponse.status, 200); assert.equal(rawReads, 0); assert.equal("financials" in await crewResponse.json(), false);
 owner = true; const response = await route.GET(req); assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.financials.available, false); assert.doesNotMatch(JSON.stringify(body), new RegExp(secret));
});
test("analytics denies guests and role changes before sending a previously Owner-authorized payload", async () => {
 let denial = true, checks = 0, reads = 0;
 const mocks = { "@/lib/member-tools": { lookupMemberToolAccess: async () => { checks++; if (denial) return { ok: false, response: Response.json({ code: "AUTH_REQUIRED" }, { status: 401 }) }; return { ok: true, access: { ...crew, access: { ...crew.access, owner: checks === 1 } } }; }, fetchMemberToolInsights: async () => null }, "@/lib/queue": { getPublicQueueStats: async () => { reads++; return stats(); }, getQueueSessionShowLog: async sessionId => ({ session: { sessionId, status: "archived" }, report: report() }), getRadioQueueState: async sessionId => state({ session: session(sessionId, { status: "archived" }) }) } };
 const route = load("src/app/api/member/tools/analytics/route.ts", mocks), req = new Request("https://www.barcode-network.com/api/member/tools/analytics");
 assert.equal((await route.GET(req)).status, 401); assert.equal(reads, 0);
 denial = false; checks = 0; const response = await route.GET(req); assert.equal(response.status, 403); assert.deepEqual(await response.json(), { code: "ACCESS_CHANGED" }); assert.doesNotMatch(await response.text().catch(() => ""), /financial/);
});
test("analytics binds comparison reports to their exact archived session and bounds Owner ledger reads", async () => {
 const archive = stats(); archive.shows = Array.from({ length: 24 }, (_, i) => ({ ...archive.shows[0], sessionId: "archived-" + i, showDate: `2026-09-${String(30 - i).padStart(2, "0")}`, trackRoster: [publicTrack("track-" + i)] })); let reads = 0;
 const mocks = { "@/lib/member-tools": { lookupMemberToolAccess: async () => ({ ok: true, access: { ...crew, access: { ...crew.access, owner: true } } }), fetchMemberToolInsights: async () => null }, "@/lib/queue": { getPublicQueueStats: async () => archive, getQueueSessionShowLog: async () => ({ session: { sessionId: "private-fallback", status: "open" }, report: report() }), getRadioQueueState: async sessionId => { reads++; return state({ session: session(sessionId, { status: "archived" }), queue: [], nextInLine: null }); } } };
 const route = load("src/app/api/member/tools/analytics/route.ts", mocks); const response = await route.GET(new Request("https://www.barcode-network.com/api/member/tools/analytics")); const dto = await response.json();
 assert.equal(reads, 20); assert.equal(dto.financials.scannedShows, 20); assert.equal(dto.financials.availableShows, 24); assert.equal(dto.comparison.latest.pacing, null); assert.equal(dto.overview.showCount, 24);
});

test("simulation load and unrelated playback evidence cannot influence real show pressure or timing",()=>{
 const {buildCrewShowOverview}=load("src/lib/crew-show.ts");
 const synthetic=Array.from({length:44},(_,i)=>track("sim-"+i,{isTestTrack:true,detectedDurationSeconds:9999}));
 const dto=buildCrewShowOverview(state({queue:synthetic,publicStatus:{acceptedCount:1,capacity:44,isFull:false,pressure:"max"},playbackTiming:{trackId:"sim-0",source:"player_sync",durationSeconds:9999,currentTimeSeconds:1,playbackState:"playing",observedAt:now.toISOString()}}),stats(),undefined,now);
 assert.equal(dto.upcoming.length,1);assert.equal(dto.pressure.level,"low");assert.equal(dto.timing.playbackEvidence,"unavailable");assert.ok(dto.timing.remainingMusicSeconds<9999);
});
