import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), React = require("react"), root = path.resolve(import.meta.dirname, "..");
const crew = { user: { id: "crew-a", name: "Crew" }, session: { expiresAt: "2099-01-01T00:00:00Z" }, access: { owner: false, crew: true, permissions: ["show.overview", "insights.read"], availablePermissions: ["show.overview", "insights.read"] } };
const owner = { ...crew, access: { ...crew.access, owner: true, crew: false, permissions: [] } };
function mount(name, access, fetcher) {
 const states = [], refs = [], effects = new Map(), listeners = new Map(), redirects = []; let cursor = 0, refCursor = 0, effectCursor = 0, pending = [];
 const react = { ...React, useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; }, useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; }, useCallback(fn) { return fn; }, useEffect(fn, deps) { const i = effectCursor++, old = effects.get(i); const stableDeps = deps.filter(value => typeof value !== "function"); if (!old || stableDeps.some((value, j) => value !== old.deps[j])) { old?.cleanup?.(); effects.set(i, { deps: stableDeps, fn }); pending.push(i); } } };
 function load(relative) {
  const filename = path.join(root, "src", relative), target = { exports: {} }, source = fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "";
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: target, exports: target.exports, fetch: fetcher, AbortController, Date, URLSearchParams, window: { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: event => listeners.delete(event), location: { assign: value => redirects.push(value) } }, require: id => id === "react" ? react : id === "next/link" ? { __esModule: true, default: ({ children, ...rest }) => React.createElement("a", rest, children) } : id.startsWith("@/") ? load(id.slice(2) + ".ts") : require(id) });
  return target.exports;
 }
 const target = load("components/" + name + ".tsx");
 assert.equal(typeof target[name], "function");
 function render() { cursor = refCursor = effectCursor = 0; return target[name]({ access }); }
 async function settle() { render(); const run = pending; pending = []; for (const i of run) effects.get(i).cleanup = effects.get(i).fn(); for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); return render(); }
 return { render, settle, redirects, event: event => { listeners.get(event)?.(); return settle(); } };
}
const markup = tree => require("react-dom/server").renderToStaticMarkup(tree);
function find(tree, predicate) { if (!tree || typeof tree !== "object") return null; if (predicate(tree)) return tree; for (const child of React.Children.toArray(tree.props?.children)) { const match = find(child, predicate); if (match) return match; } return null; }
const show = { schemaVersion: "barcode_crew_show_v1", available: true, source: { readAt: "2026-10-01T22:00:00Z", historyCoverageStartedAt: "2026-08-24" }, session: { id: "public", title: "BARCODE Radio", showDate: "2026-10-01", submissionsOpen: true }, current: { id: "current", title: "Current Song", artist: "Echo", collaborators: [], durationSeconds: 300, durationKind: "estimated" }, next: { id: "next", title: "Next Song", artist: "Pulse", collaborators: [] }, upcoming: [{ id: "next", title: "Next Song", artist: "Pulse" }, { id: "later", title: "Later Song", artist: "Newcomer" }], pressure: { accepted: 30, capacity: 44, full: false, level: "medium" }, timing: { confidence: "low", remainingMusicSeconds: 600, remainingShowSeconds: 780, projectedEndAt: null, unknownDurationCount: 2, playbackEvidence: "unavailable", wheel: { spinsOwed: 1, status: "idle", estimatedSeconds: 120 }, commercial: { status: "not_due", eligible: false, estimatedSeconds: 720, estimatedRemainingSeconds: null, dueAfterTrackCount: 15 } }, introduction: { trackId: "next", title: "Next Song", artist: "Pulse", collaborators: [], creditSource: "submitted_credit", identityStatus: "credited_group_not_verified_identity", archive: { available: true, showCount: 2, trackCount: 3, historyCoverageStartedAt: "2026-08-24", href: "/radio/archive?view=artists&artist=pulse", appearances: [{ showDate: "2026-09-30", title: "Old Song", outcome: "finished" }] } } };
const insights = { schemaVersion: "barcode_crew_insights_v1", available: true, source: { historyCoverageStartedAt: "2026-08-24", archiveBuiltAt: "2026-10-01T22:00:00Z" }, overview: { showCount: 2, submitted: 8, finished: 5, skipped: 1, removed: 1, unknown: 1, creditedArtistGroups: 4, repeatArtistGroups: 2 }, shows: [], comparison: { latest: null, previous: null }, artists: [{ label: "Echo", showCount: 2, trackCount: 3 }], accounts: null, unavailable: [], financials: { available: true, basis: "recorded_confirmed_gross", scannedShows: 2, availableShows: 2, currencies: [{ currency: "USD", amountCents: 700, paymentCount: 1 }], refunds: null, net: null } };
test("Show tool renders working status and artist evidence without players or commands", async () => {
 const calls = [], ui = mount("CrewShowOverview", crew, async (url, options) => { calls.push(url); assert.equal(options.cache, "no-store"); return Response.json(url === "/api/member/access" ? crew : show); });
 const html = markup(await ui.settle());
 assert.match(html, /Current Song/); assert.match(html, /Next Song/); assert.match(html, /Artist introduction/); assert.match(html, /submitted credits/i); assert.match(html, /credited.*group/i); assert.match(html, /estimate/i); assert.match(html, /2026-08-24/);
 assert.doesNotMatch(html, /<iframe|<audio|<video|Start playback|Move track|Payment ID/);
 assert.deepEqual(calls, ["/api/member/access", "/api/member/tools/show"]);
 const refresh = find(ui.render(), element => element.type === "button" && element.props.children === "Refresh"); assert.ok(refresh); refresh.props.onClick(); await ui.settle(); assert.equal(calls.length, 4);
});
test("upcoming selection fetches its card through the freshly authorized Show API", async () => {
 const calls = [], ui = mount("CrewShowOverview", crew, async url => { calls.push(url); return Response.json(url === "/api/member/access" ? crew : url.includes("trackId=later") ? { ...show, introduction: { ...show.introduction, trackId: "later", artist: "Newcomer", title: "Later Song" } } : show); });
 await ui.settle(); find(ui.render(), element => element.type === "select").props.onChange({ target: { value: "later" } });
 const html = markup(await ui.settle()); assert.ok(calls.some(url => url.includes("trackId=later"))); assert.match(html, /Newcomer/);
});
test("focus hides stale Show data immediately and revoked access blocks later native reads", async () => {
 let revoked = false, unblock, calls = 0;
 const ui = mount("CrewShowOverview", crew, async url => { if (url === "/api/member/access") { if (revoked) await new Promise(resolve => { unblock = resolve; }); return Response.json(revoked ? { ...crew, access: { ...crew.access, permissions: [] } } : crew); } calls++; return Response.json(show); });
 assert.match(markup(await ui.settle()), /Current Song/); revoked = true; const pending = ui.event("focus"); assert.doesNotMatch(markup(ui.render()), /Current Song/); await new Promise(resolve => setImmediate(resolve)); unblock(); await pending;
 assert.doesNotMatch(markup(ui.render()), /Current Song/); assert.equal(calls, 1); assert.deepEqual(ui.redirects, ["/account"]);
});
test("analytics actual UI hides financial rows from Crew even if a malformed response includes them", async () => {
 for (const [access, expected] of [[crew, false], [owner, true]]) {
  const ui = mount("OwnerCrewAnalytics", access, async url => Response.json(url === "/api/member/access" ? access : insights));
  const html = markup(await ui.settle()); assert.match(html, /credited artist groups/i); assert.match(html, /Website visits.*unavailable/i); assert.match(html, /unique viewers.*unavailable/i);
  assert.equal(/Recorded confirmed gross/.test(html), expected); assert.equal(/USD/.test(html), expected); assert.match(html, /partial|retained/i);
 }
});
test("unavailable and empty tool data present honest status instead of fabricated zeros", async () => {
 const ui = mount("OwnerCrewAnalytics", crew, async url => Response.json(url === "/api/member/access" ? crew : { ...insights, available: false, overview: null, shows: [], artists: [], accounts: null, financials: undefined }));
 const html = markup(await ui.settle()); assert.match(html, /archive.*unavailable/i); assert.match(html, /Account.*unavailable/i); assert.doesNotMatch(html, /0 shows|0 members/);
});
