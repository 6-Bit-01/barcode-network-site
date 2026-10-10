import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), React = require("react");
const read = path => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const active = { user: { id: "member-a", name: "Member A" }, session: { expiresAt: "2099-01-01T00:00:00Z" } };
function mount(name, props, fetcher) {
 const state = [], refs = [], effects = new Map(), listeners = new Map(); let cursor = 0, refCursor = 0, effectCursor = 0, pending = [];
 const react = { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; }, useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; }, useEffect(fn, deps) { const i = effectCursor++, previous = effects.get(i); if (!previous || deps.some((value, j) => value !== previous.deps[j])) { previous?.cleanup?.(); effects.set(i, { deps, fn }); pending.push(i); } } };
 const target = { exports: {} }, redirects = [];
 const window = { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: (event, fn) => { if (listeners.get(event) === fn) listeners.delete(event); }, location: { assign: url => redirects.push(url) } };
 function load(relative) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read("src/" + relative + (relative.startsWith("lib/") ? ".ts" : ".tsx")), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, fetch: fetcher, window, AbortController, Date, URLSearchParams, crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" }, require: id => id === "react" ? react : id === "next/link" ? { __esModule: true, default: ({ children, ...rest }) => React.createElement("a", rest, children) } : id.startsWith("@/") ? load(id.slice(2)) : require(id) });
  return loaded.exports;
 }
 Object.assign(target.exports, load("components/" + name));
 function render() { cursor = refCursor = effectCursor = 0; return target.exports[name](props); }
 async function settle() { render(); const queued = pending; pending = []; for (const i of queued) { const effect = effects.get(i); effect.cleanup = effect.fn(); } for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); return render(); }
 return { render, settle, redirects, event: async event => { listeners.get(event)?.(); return settle(); } };
}
function find(tree, predicate) { if (!tree || typeof tree !== "object") return null; if (predicate(tree)) return tree; for (const child of React.Children.toArray(tree.props?.children)) { const result = find(child, predicate); if (result) return result; } return null; }
const text = tree => require("react-dom/server").renderToStaticMarkup(tree);
test("private history clears immediately on focus and rejects another account or an expired session", async () => {
 let value = { ...active, artists: [], history: { currentShow: null, totals: { submitted: 1, shows: 1, finished: 0, skipped: 0, removed: 0, active: 0, unknown: 1 }, tracks: [{ key: "legacy-one", title: "Private Song", artist: "Artist", source: "historical", showLabel: "August Radio", showDate: "2026-08-24", status: "unknown", airplay: "unknown", completion: "unknown", coverage: "partial", currentShow: false }], truncated: false } };
 let unblock;
 const ui = mount("MemberRadioHistory", { memberId: "member-a" }, async (_url, options) => { assert.equal(options.cache, "no-store"); if (unblock) await new Promise(resolve => { unblock = resolve; }); return Response.json(value); });
 assert.match(text(await ui.settle()), /Private Song/);
 value = { ...value, user: { id: "member-b", name: "B" } }; unblock = true;
 const waiting = ui.event("focus"); assert.doesNotMatch(text(ui.render()), /Private Song/); await new Promise(resolve => setImmediate(resolve)); unblock(); unblock = null; await waiting;
 assert.doesNotMatch(text(ui.render()), /Private Song/);
 value = { ...value, ...active, session: { expiresAt: "2000-01-01T00:00:00Z" } }; await ui.event("pageshow"); assert.doesNotMatch(text(ui.render()), /Private Song/);
});
test("Artist selector auto-selects one approved identity, leaves several optional, and clears on lost authentication", async () => {
 let data = { ...active, revision: 0, artists: [{ id: "artist-a", projectKey: "artist-one" }], legacyReferences: [] }, status = 200;
 const choices = [], ui = mount("ApprovedArtistSelector", { onChange: value => choices.push(value) }, async () => Response.json(data, { status }));
 await ui.settle(); assert.equal(choices.at(-1), "artist-a");
 data = { ...data, artists: [...data.artists, { id: "artist-b", projectKey: "artist-two" }] }; await ui.event("focus"); assert.equal(choices.at(-1), ""); assert.match(text(ui.render()), /Personal Member submission/);
 find(ui.render(), element => element.type === "select").props.onChange({ target: { value: "artist-b" } }); assert.equal(choices.at(-1), "artist-b");
 status = 401; await ui.event("pageshow"); assert.equal(choices.at(-1), undefined); assert.doesNotMatch(text(ui.render()), /artist-two/);
});
test("a single Artist default allows explicit personal selection and preserves it only for the same fresh account", async () => {
 let data = { ...active, revision: 0, artists: [{ id: "artist-a", projectKey: "artist-one" }], legacyReferences: [] };
 const choices = [], ui = mount("ApprovedArtistSelector", { onChange: value => choices.push(value) }, async () => Response.json(data));
 await ui.settle(); assert.equal(choices.at(-1), "artist-a");
 find(ui.render(), element => element.type === "select").props.onChange({ target: { value: "" } }); assert.equal(choices.at(-1), "");
 await ui.event("focus"); assert.equal(choices.at(-1), "", "fresh same-account read preserves explicit personal choice");
 data = { ...data, user: { id: "member-b", name: "B" }, artists: [{ id: "artist-b", projectKey: "artist-two" }] };
 await ui.event("pageshow"); assert.equal(choices.at(-1), "artist-b", "other account starts from its own current grants");
});
test("Owner focus revalidation hides private reviews when identity, role or session is lost and fails closed offline", async () => {
 for (const failure of ["identity", "role", "expired", "offline"]) {
  let checking = false;
  const ui = mount("OwnerArtistWorkspace", { access: { ...active, access: { owner: true, crew: false, permissions: [], availablePermissions: [] } } }, async url => {
   if (url === "/api/member/access") { if (failure === "offline") throw new Error("offline"); return Response.json({ ...active, user: failure === "identity" ? { id: "other-owner", name: "Other" } : active.user, session: failure === "expired" ? { expiresAt: "2000-01-01" } : active.session, access: { owner: failure !== "role" } }); }
   assert.equal(checking, false, "denied authority must not start fresh private reads");
   if (url.includes("/accounts?")) return Response.json({ accounts: [{ id: "member-a", name: "Private Member", email: "private@example.com", emailVerified: true, suspended: false }], nextCursor: null });
   if (url.includes("/artist-catalog?")) return Response.json({ artists: [], nextCursor: null });
   return Response.json({ candidates: [], nextCursor: null });
  });
  assert.match(text(await ui.settle()), /private@example.com/); checking = true;
  await ui.event("focus"); assert.doesNotMatch(text(ui.render()), /private@example.com|Private Member/);
  assert.equal(ui.redirects.length, failure === "offline" ? 0 : 1);
 }
});
test("Owner lost mutation response retries the identical nonce/body while pausing new approvals", async () => {
 const posts = []; let lose = true;
 const state = { targetId: "member-a", revision: 0, artists: [], legacyReferences: [] };
 const ui = mount("OwnerArtistWorkspace", { access: { ...active, access: { owner: true, crew: false, permissions: [], availablePermissions: [] } } }, async (url, options) => {
  if (options.method === "POST") { posts.push(options.body); if (lose) { lose = false; throw new Error("lost response"); } return Response.json({ ok: true, state: { ...state, revision: 1 } }); }
  if (url === "/api/member/access") return Response.json({ ...active, access: { owner: true } });
  if (url.includes("/accounts?")) return Response.json({ accounts: [{ id: "member-a", name: "A", email: "a@example.com", emailVerified: true, suspended: false }], nextCursor: null });
  if (url.includes("/artist-catalog?")) return Response.json({ artists: [{ projectKey: "artist-one", projectLabel: "Artist One" }], nextCursor: null });
  if (url.includes("/radio-candidates?")) return Response.json({ candidates: [], nextCursor: null });
  return Response.json(state);
 });
 await ui.settle(); find(ui.render(), el => el.props?.["aria-label"] === "Review Artist access for A").props.onClick(); await ui.settle();
 find(ui.render(), el => el.type === "select" && el.props["aria-label"] === "Artist project").props.onChange({ target: { value: "artist-one" } });
 const approve = find(ui.render(), el => el.type === "button" && el.props.children === "Approve Artist project"); await approve.props.onClick(); await ui.settle();
 assert.equal(posts.length, 1); assert.equal(find(ui.render(), el => el.type === "button" && el.props.children === "Approve Artist project").props.disabled, true);
 await find(ui.render(), el => el.type === "button" && el.props.children === "Retry unconfirmed Artist action").props.onClick(); await ui.settle(); assert.equal(posts.length, 2); assert.equal(posts[0], posts[1]);
});
test("Owner approves one individually reviewed exact song and keeps all catalog/account/source pages bounded", async () => {
 const requests = [], ref = { kind: "historical", bundleDigest: "a".repeat(64), recoveryTrackId: "recovery-song-7" };
 const state = { targetId: "member-a", revision: 3, artists: [{ id: "artist-a", projectKey: "artist-one", approved: true }], legacyReferences: [] };
 const candidate = { reference: ref, showLabel: "August Radio", showDate: "2026-08-24", title: "Reviewed Song", artist: "Artist One", status: "finished", airplay: "unknown", completion: "unknown", coverage: "partial" };
 const ui = mount("OwnerArtistWorkspace", { access: { ...active, access: { owner: true, crew: false, permissions: [], availablePermissions: [] } } }, async (url, options) => {
  requests.push({ url, options });
  if (options.method === "POST") return Response.json({ ok: true, state: { ...state, revision: 4 } });
  if (url.includes("/accounts?")) return Response.json({ accounts: [{ id: "member-a", name: "A", email: "a@example.com", emailVerified: true, suspended: false }], nextCursor: null });
  if (url.includes("/artist-catalog?")) return Response.json({ artists: [{ projectKey: "artist-one", projectLabel: "Artist One" }], nextCursor: null });
  if (url.includes("/radio-candidates?")) return Response.json({ candidates: [candidate, { ...candidate, reference: { ...ref, recoveryTrackId: "another-song" } }], nextCursor: null });
  return Response.json(state);
 });
 await ui.settle(); find(ui.render(), el => el.props?.["aria-label"] === "Review Artist access for A").props.onClick(); await ui.settle();
 const artistLabel = find(ui.render(), el => el.type === "label" && React.Children.toArray(el.props.children)[0] === "Associate with approved Artist");
 find(artistLabel, el => el.type === "select").props.onChange({ target: { value: "artist-a" } });
 assert.equal(requests.filter(request => request.options.method === "POST").length, 0, "choosing an Artist never approves songs");
 find(ui.render(), el => el.type === "button" && el.props.children === "Review this exact song").props.onClick();
 const html = text(ui.render()); assert.match(html, /Reviewed Song/); assert.match(html, /recovery-song-7/); assert.match(html, /Airplay: unknown/); assert.match(html, /Coverage: partial/);
 await find(ui.render(), el => el.type === "button" && el.props.children === "Approve this exact song").props.onClick();
 const body = JSON.parse(requests.find(request => request.options.method === "POST").options.body);
 assert.equal(body.action, "approve-history"); assert.equal(body.targetId, "member-a"); assert.equal(body.expectedRevision, 3); assert.equal(body.artistId, "artist-a"); assert.deepEqual(body.reference, ref);
 for (const { url } of requests.filter(request => /accounts\?|artist-catalog\?|radio-candidates\?/.test(request.url))) { const query = new URL(url, "https://barcode.test").searchParams; assert.ok(Number(query.get("limit")) <= (url.includes("catalog") ? 50 : 25)); }
});
test("Artist page keeps Owner guard and intake preserves server attribution and guest/edit boundaries", () => {
 assert.match(read("src/app/account/owner/artists/page.tsx"), /requireMemberWorkspaceAccess\("owner"\)/);
 assert.match(read("src/app/account/owner/artists/page.tsx"), /OwnerArtistWorkspace key=\{access.user.id\}/, "a new Owner identity remounts private review state");
 const form = read("src/components/RadioQueueForm.tsx"); assert.match(form, /ApprovedArtistSelector/); assert.match(form, /if \(selectedArtistId !== undefined\) body.artistId = selectedArtistId/); assert.doesNotMatch(form, /body\.(memberId|submissionMemberId|approvedArtistId|approvedArtistLinkRevision)/);
 assert.match(read("src/components/MemberAccount.tsx"), /MemberRadioHistory key=\{member.id\} memberId=\{member.id\}/);
 const deck = read("src/components/BroadcastDeck.tsx"); assert.match(deck, /Artist &amp; show participation/); assert.doesNotMatch(deck, /From this browser/); assert.match(deck, /snapshot\?\.ownedTracks/); assert.match(deck, /!previewMode && <MemberRadioHistory/);
});
