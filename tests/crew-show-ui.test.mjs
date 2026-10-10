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
function mount(name, access, fetcher, browser = {}) {
 const states = [], refs = [], effects = new Map(), listeners = new Map(), redirects = []; let cursor = 0, refCursor = 0, effectCursor = 0, pending = [];
 const react = { ...React, useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], value => { states[i] = typeof value === "function" ? value(states[i]) : value; }]; }, useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; }, useCallback(fn) { return fn; }, useEffect(fn, deps) { const i = effectCursor++, old = effects.get(i); const stableDeps = deps.filter(value => typeof value !== "function"); if (!old || stableDeps.some((value, j) => value !== old.deps[j])) { old?.cleanup?.(); effects.set(i, { deps: stableDeps, fn }); pending.push(i); } } };
 react.useLayoutEffect = react.useEffect;
 function load(relative) {
  const filename = [relative, relative + ".ts", relative + ".tsx"].map(file => path.join(root, "src", file)).find(file => fs.existsSync(file)), target = { exports: {} }, source = filename ? fs.readFileSync(filename, "utf8") : "";
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: target, exports: target.exports, fetch: fetcher, AbortController, Date: browser.Date ?? Date, URLSearchParams, navigator: browser.navigator ?? { clipboard: { writeText: async () => {} } }, document: browser.document, window: { addEventListener: (event, fn) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); }, removeEventListener: (event, fn) => listeners.get(event)?.delete(fn), location: { assign: value => redirects.push(value) } }, require: id => id === "react" ? react : id === "next/link" ? { __esModule: true, default: ({ children, ...rest }) => React.createElement("a", rest, children) } : id.startsWith("@/") ? load(id.slice(2)) : require(id) });
  return target.exports;
 }
 const target = load("components/" + name + ".tsx");
 assert.equal(typeof target[name], "function");
 function render() { cursor = refCursor = effectCursor = 0; return target[name]({ access }); }
 async function settle() { for (let pass = 0; pass < 3; pass++) { render(); const run = pending; pending = []; for (const i of run) effects.get(i).cleanup = effects.get(i).fn(); for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); } return render(); }
 return { render, settle, redirects, updateAccess: next => { access = next; return settle(); }, event: event => { for (const fn of listeners.get(event) ?? []) fn(); return settle(); } };
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
 const refresh = find(ui.render(), element => element.type === "button" && element.props["aria-label"] === "Refresh show information"); assert.ok(refresh); refresh.props.onClick(); await ui.settle(); assert.equal(calls.length, 4);
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

const copyIntroduction = ui => find(ui.render(), element => element.type === "button" && element.props["aria-label"] === "Copy introduction");
const creditedShow = { ...show, introduction: { ...show.introduction, collaborators: ["Orbit", "Static"], archive: { ...show.introduction.archive, firstShowDate: "2026-09-01", latestShowDate: "2026-09-30" }, bio: "Untrusted biography must not be copied", accountId: "unverified-account" } };
const creditedCopy = "Pulse — Next Song · feat. Orbit, Static\nSubmitted credits. Archive appearances describe a credited artist group; they do not verify an account or establish complete artist history.\n2 retained public shows · 3 credited tracks. Archive coverage begins 2026-08-24.";
test("introduction copy uses only the selected factual credits and retained archive coverage", async () => {
 const copied = [], calls = [], ui = mount("CrewShowOverview", crew, async url => { calls.push(url); return Response.json(url === "/api/member/access" ? crew : creditedShow); }, { navigator: { clipboard: { writeText: async value => { copied.push(value); } } } });
 await ui.settle(); const button = copyIntroduction(ui); assert.ok(button, "the selected introduction offers copy"); assert.equal(button.props.disabled, false); button.props.onClick();
 assert.deepEqual(copied, [creditedCopy]); assert.match(markup(await ui.settle()), /Introduction copied/i); assert.deepEqual(calls, ["/api/member/access", "/api/member/tools/show"]);
});
test("introduction copy reports a pending clipboard result and an honest failure", async () => {
 let rejectCopy; const ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? crew : creditedShow), { navigator: { clipboard: { writeText: () => new Promise((resolve, reject) => { rejectCopy = reject; }) } } });
 await ui.settle(); const button = copyIntroduction(ui); assert.ok(button); button.props.onClick(); await ui.settle(); assert.equal(copyIntroduction(ui).props.disabled, true); assert.equal(copyIntroduction(ui).props["aria-busy"], true);
 rejectCopy(Error("clipboard denied")); const html = markup(await ui.settle()); assert.match(html, /could not copy|copy failed/i); assert.doesNotMatch(html, /Introduction copied/i); assert.equal(copyIntroduction(ui).props.disabled, false);
});
test("a clipboard completion for the old song cannot replace the selected introduction copy state", async () => {
 const pending = [], copied = [], later = { ...creditedShow, introduction: { ...creditedShow.introduction, trackId: "later", artist: "Newcomer", title: "Later Song", collaborators: ["Guest"], creditSource: "reviewed_credit", archive: { ...creditedShow.introduction.archive, showCount: 1, trackCount: 1 } } };
 const ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? crew : url.includes("trackId=later") ? later : creditedShow), { navigator: { clipboard: { writeText: value => { copied.push(value); return new Promise(resolve => pending.push(resolve)); } } } });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); await ui.settle(); find(ui.render(), element => element.type === "select").props.onChange({ target: { value: "later" } }); await ui.settle();
 assert.equal(copyIntroduction(ui).props.disabled, false); assert.doesNotMatch(markup(ui.render()), /Introduction copied|Copying introduction/i); copyIntroduction(ui).props.onClick(); await ui.settle();
 pending[0](); await ui.settle(); assert.equal(copyIntroduction(ui).props["aria-busy"], true); assert.doesNotMatch(markup(ui.render()), /Introduction copied/i); pending[1](); assert.match(markup(await ui.settle()), /Introduction copied/i);
 assert.deepEqual(copied, [creditedCopy, "Newcomer — Later Song · feat. Guest\nReviewed credits. Archive appearances describe a credited artist group; they do not verify an account or establish complete artist history.\n1 retained public show · 1 credited track. Archive coverage begins 2026-08-24."]);
});
test("refresh clears copy feedback and a pending completion for the previous snapshot", async () => {
 let finishCopy; const ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? crew : creditedShow), { navigator: { clipboard: { writeText: () => new Promise(resolve => { finishCopy = resolve; }) } } });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); await ui.settle(); find(ui.render(), element => element.type === "button" && element.props["aria-label"] === "Refresh show information").props.onClick(); await ui.settle();
 assert.equal(copyIntroduction(ui).props.disabled, false); finishCopy(); assert.doesNotMatch(markup(await ui.settle()), /Introduction copied|Copying introduction/i);
});
test("an introduction without public archive data copies credits without invented history", async () => {
 const copied = [], ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? crew : { ...show, introduction: { ...show.introduction, creditSource: "inferred_credit", archive: { ...show.introduction.archive, available: false, showCount: null, trackCount: null } } }), { navigator: { clipboard: { writeText: async value => copied.push(value) } } });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); await ui.settle(); assert.deepEqual(copied, ["Pulse — Next Song\nInferred credit grouping. Archive appearances describe a credited artist group; they do not verify an account or establish complete artist history."]);
});
test("unavailable, empty and revoked show access never offer usable introduction copy", async () => {
 for (const response of [{ ...show, available: false }, { ...show, upcoming: [], introduction: null }, { ...show, upcoming: [] }]) {
  const copied = [], ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? crew : response), { navigator: { clipboard: { writeText: async value => copied.push(value) } } }); await ui.settle(); const button = copyIntroduction(ui); assert.ok(!button || button.props.disabled); assert.deepEqual(copied, []);
 }
 let finishCopy, revoked = false, showReads = 0;
 const ui = mount("CrewShowOverview", crew, async url => { if (url === "/api/member/access") return Response.json(revoked ? { ...crew, access: { ...crew.access, permissions: [] } } : crew); showReads++; return Response.json(show); }, { navigator: { clipboard: { writeText: () => new Promise(resolve => { finishCopy = resolve; }) } } });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); await ui.settle(); revoked = true; await ui.event("focus"); finishCopy(); const html = markup(await ui.settle()); assert.doesNotMatch(html, /Introduction copied|Current Song|Copying introduction/i); assert.equal(copyIntroduction(ui), null); assert.equal(showReads, 1); assert.deepEqual(ui.redirects, ["/account"]);
});
test("a changed account authority disables copy and drops an earlier completion", async () => {
 let finishCopy; const ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? crew : show), { navigator: { clipboard: { writeText: () => new Promise(resolve => { finishCopy = resolve; }) } } });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); await ui.settle(); await ui.updateAccess({ ...crew, access: { ...crew.access, permissions: [] } }); finishCopy(); const html = markup(await ui.settle()); const button = copyIntroduction(ui); assert.ok(!button || button.props.disabled); assert.doesNotMatch(html, /Introduction copied|Copying introduction/i);
});

function introductionClipboardDocument() {
 const state = { value: null, calls: 0, removed: 0, restored: 0 };
 let selected;
 const document = { activeElement: { focus: () => state.restored++ }, body: { appendChild() {} }, createElement: () => ({ value: "", style: {}, setAttribute() {}, focus() {}, select() { selected = this.value; }, setSelectionRange() {}, remove() { state.removed++; } }), execCommand(command) { assert.equal(command, "copy"); state.calls++; state.value = selected; return true; } };
 return { document, state };
}
test("the introduction copy browser fallback preserves full factual text and restores focus", async () => {
 const fixture = introductionClipboardDocument(), ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? crew : creditedShow), { navigator: {}, document: fixture.document });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); assert.match(markup(await ui.settle()), /Introduction copied/i); assert.equal(fixture.state.value, creditedCopy); assert.equal(fixture.state.removed, 1); assert.equal(fixture.state.restored, 1);
});
test("a denied old clipboard operation cannot invoke the fallback after access revalidation", async () => {
 let rejectCopy, revoked = false; const fixture = introductionClipboardDocument();
 const ui = mount("CrewShowOverview", crew, async url => Response.json(url === "/api/member/access" ? revoked ? { ...crew, access: { ...crew.access, permissions: [] } } : crew : creditedShow), { document: fixture.document, navigator: { clipboard: { writeText: () => new Promise((resolve, reject) => { rejectCopy = reject; }) } } });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); await ui.settle(); revoked = true; await ui.event("focus"); rejectCopy(Error("denied")); assert.doesNotMatch(markup(await ui.settle()), /Introduction copied|Copying introduction/i); assert.equal(fixture.state.calls, 0);
});
test("a clipboard denial after the account session expires cannot copy through the fallback", async () => {
 let now = Date.parse("2026-10-10T00:00:00Z"), rejectCopy;
 class BrowserDate extends Date { static now() { return now; } }
 const access = { ...crew, session: { expiresAt: "2026-10-10T01:00:00Z" } }, fixture = introductionClipboardDocument();
 const ui = mount("CrewShowOverview", access, async url => Response.json(url === "/api/member/access" ? access : creditedShow), { Date: BrowserDate, document: fixture.document, navigator: { clipboard: { writeText: () => new Promise((resolve, reject) => { rejectCopy = reject; }) } } });
 await ui.settle(); assert.ok(copyIntroduction(ui)); copyIntroduction(ui).props.onClick(); await ui.settle(); now = Date.parse("2026-10-10T01:00:01Z"); rejectCopy(Error("denied")); const html = markup(await ui.settle()); assert.equal(fixture.state.calls, 0); assert.doesNotMatch(html, /Introduction copied|Copying introduction/i);
});
