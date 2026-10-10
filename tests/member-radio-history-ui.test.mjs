import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url), React = require("react");
const html = tree => require("react-dom/server").renderToStaticMarkup(tree);
const active = { user: { id: "member-a", name: "Member A" }, session: { expiresAt: "2099-01-01T00:00:00Z" } };
const song = (key, title, extra = {}) => ({ key, title, artist: "Alice & Company", source: "native", showLabel: "Friday Radio", showDate: "2026-10-09", status: "finished", airplay: "unknown", completion: "unknown", coverage: "native_show_record", currentShow: false, ...extra });
const tracks = [song("native:show-a:one", "Red Signal"), song("native:show-a:two", "Blue Signal"), song("native:show-b:three", "Second Session", { artist: "BETA Project", status: "skipped" }), song("historical:" + "a".repeat(64) + ":four", "Older Recording", { source: "historical", coverage: "partial" })];
const response = (items = tracks, extra = {}) => ({ ...active, artists: [{ id: "approved-a", projectKey: "alice-company", projectLabel: "Alice & Company", archiveHref: "/radio/archive/artists/alice-company" }, { id: "approved-b", projectKey: "beta-project", projectLabel: null, archiveHref: null }], history: { currentShow: null, totals: { submitted: 104, shows: 8, finished: 71, skipped: 6, removed: 4, active: 3, unknown: 20 }, tracks: items, truncated: true }, ...extra });

// Fetch is the private service boundary. The component, handlers and derived view are real.
function mount(props = { memberId: "member-a" }, fetcher = async () => Response.json(response())) {
  const state = [], refs = [], effects = new Map(), listeners = new Map();
  let cursor = 0, refCursor = 0, effectCursor = 0, pending = [], currentProps = props;
  const react = { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; }, useRef(initial) { const i = refCursor++; return refs[i] ??= { current: initial }; }, useEffect(fn, deps) { const i = effectCursor++, previous = effects.get(i); if (!previous || deps.some((value, j) => value !== previous.deps[j])) { previous?.cleanup?.(); effects.set(i, { deps, fn }); pending.push(i); } } };
  function load(relative) {
    const target = { exports: {} };
    const source = fs.readFileSync(new URL("../src/" + relative + (relative.startsWith("lib/") ? ".ts" : ".tsx"), import.meta.url), "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: target, exports: target.exports, fetch: fetcher, window: { addEventListener: (event, fn) => listeners.set(event, fn), removeEventListener: (event, fn) => { if (listeners.get(event) === fn) listeners.delete(event); } }, AbortController, Date, require: id => id === "react" ? react : id === "next/link" ? { __esModule: true, default: ({ children, ...rest }) => React.createElement("a", rest, children) } : id.startsWith("@/") ? load(id.slice(2)) : require(id) });
    return target.exports;
  }
  const { MemberRadioHistory } = load("components/MemberRadioHistory");
  function render() { cursor = refCursor = effectCursor = 0; return MemberRadioHistory(currentProps); }
  async function settle() { render(); const queued = pending; pending = []; for (const i of queued) { const effect = effects.get(i); effect.cleanup = effect.fn(); } for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); return render(); }
  return { render, settle, setProps: next => { currentProps = next; return render(); }, event: event => { listeners.get(event)?.(); return settle(); } };
}
function all(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap(child => all(child, predicate))];
}
const find = (tree, predicate) => all(tree, predicate)[0];
const showControl = ui => find(ui.render(), el => el.type === "select" && el.props["aria-label"] === "Filter history by show");
const searchControl = ui => find(ui.render(), el => el.type === "input" && el.props.type === "search");
const groups = tree => all(tree, el => el.type === "section" && el.props["aria-label"]?.startsWith("History for "));
const resetControl = ui => find(ui.render(), el => el.type === "button" && el.props.children === "Reset filters");

test("default history groups distinct source shows with matching dates and labels without changing global totals", async () => {
  const ui = mount(); const tree = await ui.settle();
  assert.equal(groups(tree).length, 3, "two native sessions and one historical source must remain separate");
  const select = showControl(ui); assert.ok(select, "full history needs its show filter");
  assert.equal(select.props.value, "");
  const options = all(select, el => el.type === "option"); assert.equal(options.length, 4); assert.equal(new Set(options.map(option => option.props.value)).size, 4);
  assert.match(html(tree), /Red Signal/); assert.match(html(tree), /Second Session/); assert.match(html(tree), /Older Recording/);
  const totals = find(tree, el => el.props["aria-label"] === "All eligible participation totals"); assert.ok(totals); assert.match(html(totals), />104</); assert.match(html(totals), />8</);
  select.props.onChange({ target: { value: options[2].props.value } });
  const filtered = ui.render(); assert.equal(groups(filtered).length, 1); assert.match(html(filtered), /Second Session/); assert.doesNotMatch(html(filtered), /Red Signal|Older Recording/);
  assert.equal(html(find(filtered, el => el.props["aria-label"] === "All eligible participation totals")), html(totals));
});

test("optional song and artist search trims and ignores case; blank search restores records and no-match remains explicit", async () => {
  const ui = mount(); await ui.settle(); const input = searchControl(ui); assert.ok(input, "full history needs optional song or artist search");
  input.props.onChange({ target: { value: "  blue SIGNAL  " } }); assert.match(html(ui.render()), /Blue Signal/); assert.doesNotMatch(html(ui.render()), /Red Signal|Second Session|Older Recording/);
  searchControl(ui).props.onChange({ target: { value: "beta" } }); assert.match(html(ui.render()), /Second Session/); assert.doesNotMatch(html(ui.render()), /Red Signal|Blue Signal|Older Recording/);
  searchControl(ui).props.onChange({ target: { value: "   " } }); assert.equal(groups(ui.render()).length, 3);
  searchControl(ui).props.onChange({ target: { value: "not in these records" } }); assert.equal(groups(ui.render()).length, 0); assert.match(html(ui.render()), /No songs match/); assert.doesNotMatch(html(ui.render()), /No approved show participation/);
});

test("reset clears show and search together so another show cannot stay hidden", async () => {
  const ui = mount(); await ui.settle(); const select = showControl(ui); assert.ok(select);
  select.props.onChange({ target: { value: all(select, el => el.type === "option")[2].props.value } });
  searchControl(ui).props.onChange({ target: { value: "impossible" } }); assert.equal(groups(ui.render()).length, 0);
  const reset = resetControl(ui); assert.ok(reset); reset.props.onClick();
  assert.equal(showControl(ui).props.value, ""); assert.equal(searchControl(ui).props.value, ""); assert.equal(groups(ui.render()).length, 3);
});

test("unsupported or ambiguous native keys never merge unrelated shows", async () => {
  const ui = mount(undefined, async () => Response.json(response([song("unrecognized-one", "One"), song("unrecognized-two", "Two"), song("native:show:with-colon:one", "Three"), song("native:show:with-colon:two", "Four")])));
  assert.equal(groups(await ui.settle()).length, 4);
});

test("approved project cards use only existing archive destinations and keep unlinked projects visible", async () => {
  const ui = mount(); const tree = await ui.settle();
  const archive = find(tree, el => el.props.href === "/radio/archive/artists/alice-company"); assert.ok(archive); assert.match(html(archive), /Alice &amp; Company/);
  const projects = find(tree, el => el.props["aria-label"] === "Approved Artist projects"); assert.ok(projects); assert.match(html(projects), /beta-project/);
  assert.equal(all(projects, el => Boolean(el.props.href)).length, 1);
});

test("outcome stays separate from expandable airplay, completion, source and coverage evidence", async () => {
  const ui = mount(); const tree = await ui.settle();
  const details = all(tree, el => el.type === "details"); assert.equal(details.length, 4);
  assert.match(html(tree), /finished outcome does not prove full airplay/);
  assert.match(html(details[0]), /Airplay: unknown/); assert.match(html(details[0]), /Completion: unknown/); assert.match(html(details[0]), /Coverage: native show record/);
  assert.match(html(details[3]), /Historical record/); assert.match(html(details[3]), /Coverage: partial/);
  assert.match(html(tree), /Showing the latest 100 songs/); assert.doesNotMatch(html(tree), /first appearance|full airplay confirmed/i);
});

test("focus refetch clears cached private songs and resets filters before new data or a failed response", async () => {
  let next = response(), release, waiting = false;
  const ui = mount(undefined, async (url, options) => { assert.equal(url, "/api/member/radio-history"); assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store"); if (waiting) await new Promise(resolve => { release = resolve; }); return Response.json(next); });
  await ui.settle(); const input = searchControl(ui); assert.ok(input); input.props.onChange({ target: { value: "red" } });
  waiting = true; const inFlight = ui.event("focus"); assert.doesNotMatch(html(ui.render()), /Red Signal|Alice &amp; Company/);
  next = response([song("native:new-show:new-song", "New Eligible Song")]); await new Promise(resolve => setImmediate(resolve)); waiting = false; release(); await inFlight;
  assert.match(html(ui.render()), /New Eligible Song/); assert.equal(searchControl(ui).props.value, ""); assert.equal(showControl(ui).props.value, "");
  next = { ...next, user: { id: "other-member", name: "Other" } }; await ui.event("pageshow"); assert.doesNotMatch(html(ui.render()), /New Eligible Song|Alice &amp; Company/); assert.match(html(ui.render()), /unavailable/);
});

test("member change hides prior songs synchronously and an aborted prior response cannot repopulate them", async () => {
  let next = response(), hold = false, release;
  const ui = mount(undefined, async () => { const captured = next; if (hold) await new Promise(resolve => { release = resolve; }); return Response.json(captured); });
  await ui.settle(); assert.match(html(ui.render()), /Red Signal/);
  assert.doesNotMatch(html(ui.setProps({ memberId: "member-b" })), /Red Signal|Alice &amp; Company/);
  next = response([song("native:b:one", "Member B Song")], { user: { id: "member-b", name: "Member B" } }); await ui.settle(); assert.match(html(ui.render()), /Member B Song/);
  hold = true; const oldRead = ui.event("focus"); await new Promise(resolve => setImmediate(resolve));
  hold = false; next = response([song("native:c:one", "Member C Song")], { user: { id: "member-c", name: "Member C" } }); ui.setProps({ memberId: "member-c" }); await ui.settle(); release(); await oldRead;
  assert.match(html(ui.render()), /Member C Song/); assert.doesNotMatch(html(ui.render()), /Member B Song|Red Signal/);
});

test("compact Deck history keeps five recent songs with no show groups or filter controls", async () => {
  const many = Array.from({ length: 7 }, (_, i) => song(`native:show-${i}:song`, `Recent Song ${i}`));
  const ui = mount({ compact: true }, async () => Response.json(response(many))); const tree = await ui.settle();
  for (let i = 0; i < 5; i++) assert.match(html(tree), new RegExp(`Recent Song ${i}`));
  assert.doesNotMatch(html(tree), /Recent Song 5|Recent Song 6/); assert.equal(showControl(ui), undefined); assert.equal(searchControl(ui), undefined); assert.equal(groups(tree).length, 0);
  assert.match(html(tree), /Showing up to five recent songs/); assert.match(html(tree), /Open your account for full private history/);
});

test("empty eligible history uses the available-history empty state instead of a filter mismatch", async () => {
  const ui = mount(undefined, async () => Response.json(response([], { artists: [], history: { currentShow: null, totals: { submitted: 0, shows: 0, finished: 0, skipped: 0, removed: 0, active: 0, unknown: 0 }, tracks: [], truncated: false } })));
  const tree = await ui.settle(); assert.match(html(tree), /No approved show participation/); assert.doesNotMatch(html(tree), /No songs match/); assert.equal(groups(tree).length, 0);
});
