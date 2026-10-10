import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");

function mount(view, { authorized = true, rejectMutation = false, route } = {}) {
  const scopes = new Map(), modules = new Map(), calls = [], intervals = new Map(), liveActions = [];
  let scope, pending = [], nextInterval = 0;
  const react = { ...React,
    useState(initial) { const owner = scope, i = owner.cursor++; if (!(i in owner.values)) owner.values[i] = typeof initial === "function" ? initial() : initial; return [owner.values[i], value => { owner.values[i] = typeof value === "function" ? value(owner.values[i]) : value; }]; },
    useEffect(fn, deps) { const owner = scope, i = owner.cursor++, previous = owner.effects.get(i); if (!previous || !deps || deps.some((value, j) => value !== previous.deps[j])) { previous?.cleanup?.(); const effect = { deps, fn }; owner.effects.set(i, effect); pending.push(effect); } },
  };
  const status = { status: "ONLINE", mode: "OBSERVATION", message: "Grounded public relay", currentDirective: "Monitor the broadcast", lastSeen: "2026-10-10T12:00:00Z", persisted: true };
  const flags = { websiteRelayEnabled: true, showdayDiscordPostsEnabled: true, heartbeatEnabled: true };
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/admin/verify") return Response.json({}, { status: authorized ? 200 : 401 });
    if (url === "/api/admin/auth") return Response.json({ ok: true });
    if (options.method === "POST") return Response.json(rejectMutation ? { error: "Operator write rejected" } : { ok: true, persisted: true }, { status: rejectMutation ? 503 : 200 });
    if (url === "/api/bnl/status") return Response.json(status);
    if (url === "/api/admin/bnl") return Response.json({ status, flags, history: [], forcePullRequestedAt: null, forcePullAttempt: null });
    throw Error("Unexpected request: " + url);
  };
  const live = { isLive: false, toggleLive: () => liveActions.push({ action: "toggleLive" }), streamUrl: "https://example.invalid/live", setStreamUrl: value => liveActions.push({ action: "setStreamUrl", value }), isScheduled: true, manualOverride: false, lastError: null, persisted: true };
  const window = { location: { hash: "" }, addEventListener() {}, removeEventListener() {}, setInterval(fn, delay) { const id = ++nextInterval; intervals.set(id, { fn, delay }); return id; }, clearInterval: id => intervals.delete(id), confirm: () => true };
  const document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const source = fs.readFileSync(new URL("../src/" + relative, import.meta.url), "utf8"), loaded = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, {
      module: loaded, exports: loaded.exports, fetch: fetcher, window, document, console, Date,
      require: id => id === "react" ? react : id === "next/link" ? "a" : id === "@/components/LiveStatusProvider" ? { useLiveStatus: () => live } : id.startsWith("@/") ? load(id.slice(2) + (id.startsWith("@/lib/") ? ".ts" : ".tsx")) : require(id),
    });
    modules.set(relative, loaded.exports); return loaded.exports;
  }
  const Component = route ? load(route).default : load("components/AdminControls.tsx").AdminControls;
  function evaluate(node) {
    if (Array.isArray(node)) return React.Children.toArray(node).map(evaluate);
    if (!node || typeof node !== "object" || !React.isValidElement(node)) return node;
    if (typeof node.type === "function") {
      const previousScope = scope; scope = scopes.get(node.type) ?? { values: [], effects: new Map(), cursor: 0 }; scopes.set(node.type, scope); scope.cursor = 0;
      const result = node.type(node.props); scope = previousScope; const evaluated = evaluate(result); return node.key !== null && React.isValidElement(evaluated) ? React.cloneElement(evaluated, { key: node.key }) : evaluated;
    }
    return React.cloneElement(node, {}, evaluate(node.props.children));
  }
  const render = () => evaluate(React.createElement(Component, { view }));
  async function settle() {
    for (let pass = 0; pass < 4; pass++) { render(); const effects = pending; pending = []; for (const effect of effects) effect.cleanup = effect.fn(); for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); }
    return render();
  }
  return { render, settle, calls, intervals, liveActions };
}
function find(tree, predicate) { if (!tree || typeof tree !== "object") return null; if (predicate(tree)) return tree; for (const child of React.Children.toArray(tree.props?.children)) { const found = find(child, predicate); if (found) return found; } return null; }
const markup = tree => renderToStaticMarkup(tree);
const button = (tree, label) => find(tree, node => node.type === "button" && node.props.children === label);

test("Relay destination opens the actual controls without the legacy dashboard's task menus", async () => {
  const ui = mount("relay"), html = markup(await ui.settle());
  assert.ok(/<h1[^>]*>Relay controls<\/h1>/.test(html), "Relay link must open the focused Relay page");
  assert.match(html, /BNL-01 Relay Control/);
  assert.doesNotMatch(html, /BARCODE Radio — Live Status|Open Ballad workspace|Open Show Management|Show and BNL controls/);
});

test("Live settings opens its controls without mounting or polling BNL", async () => {
  const ui = mount("settings"), html = markup(await ui.settle());
  assert.ok(/<h1[^>]*>Live status &amp; stream<\/h1>/.test(html), "Live settings link must open the focused settings page");
  assert.match(html, /GO LIVE/); assert.match(html, /Update Stream URL/);
  assert.doesNotMatch(html, /BNL-01 Relay Control|Open Ballad workspace|Open Show Management|Show and BNL controls/);
  assert.deepEqual(ui.calls.map(call => call.url), ["/api/admin/verify"]);
  assert.equal(ui.intervals.size, 0);
});

test("both focused destinations keep the existing access-code sign-in ahead of private controls", async () => {
  for (const view of ["relay", "settings"]) {
    const ui = mount(view, { authorized: false }), html = markup(await ui.settle());
    assert.match(html, /ADMIN ACCESS REQUIRED/); assert.match(html, /Authenticate/);
    assert.doesNotMatch(html, /BNL-01 Relay Control|GO LIVE|Update Stream URL/);
    assert.deepEqual(ui.calls.map(call => call.url), ["/api/admin/verify"]);
  }
});

test("focused Relay edits send the existing operator action and show only confirmed success", async () => {
  const ui = mount("relay"); await ui.settle();
  find(ui.render(), node => node.type === "textarea").props.onChange({ target: { value: "Reviewed operator relay" } });
  await button(ui.render(), "Update BNL Relay").props.onClick();
  const post = ui.calls.find(call => call.options.method === "POST");
  assert.equal(post.url, "/api/admin/bnl");
  assert.deepEqual(JSON.parse(post.options.body), { action: "updateStatus", status: "ONLINE", mode: "OBSERVATION", message: "Reviewed operator relay" });
  assert.match(markup(await ui.settle()), /Relay update confirmed/);
  assert.ok([...ui.intervals.values()].some(interval => interval.delay === 15000));
});

test("focused Relay keeps provider failures visible without claiming a successful update", async () => {
  const ui = mount("relay", { rejectMutation: true }); await ui.settle();
  await button(ui.render(), "Update BNL Relay").props.onClick();
  const html = markup(await ui.settle()); assert.match(html, /Operator write rejected/); assert.doesNotMatch(html, /Relay update confirmed/);
});

test("focused live settings retains the live toggle and submits the edited stream address", async () => {
  const ui = mount("settings"); await ui.settle();
  button(ui.render(), "GO LIVE").props.onClick();
  find(ui.render(), node => node.type === "input" && node.props.type === "url").props.onChange({ target: { value: "https://stream.example.invalid/broadcast" } });
  button(ui.render(), "Update Stream URL").props.onClick();
  assert.deepEqual(ui.liveActions, [{ action: "toggleLive" }, { action: "setStreamUrl", value: "https://stream.example.invalid/broadcast" }]);
});


test("registered focused routes reach their named task while the existing dashboard keeps all tools", async () => {
  for (const [route, title] of [["app/admin/relay/page.tsx", "Relay controls"], ["app/admin/broadcast-settings/page.tsx", "Live status &amp; stream"]]) {
    const html = markup(await mount(undefined, { route }).settle());
    assert.ok(html.includes(title), route + " must reach its named task");
    assert.doesNotMatch(html, /Open Ballad workspace|Open Show Management/);
  }
  const html = markup(await mount(undefined, { route: "app/admin/page.tsx" }).settle());
  assert.match(html, /Show and BNL controls/); assert.match(html, /BNL-01 Relay Control/); assert.match(html, /GO LIVE/);
  assert.match(html, /Open Show Management/); assert.match(html, /Open Ballad workspace/);
});

test("access-code login opens the originally selected focused task directly", async () => {
  for (const [view, visible] of [["relay", /BNL-01 Relay Control/], ["settings", /Update Stream URL/]]) {
    const ui = mount(view, { authorized: false }); await ui.settle();
    find(ui.render(), node => node.type === "input" && node.props.type === "password").props.onChange({ target: { value: "synthetic-access-code" } });
    await button(ui.render(), "Authenticate").props.onClick();
    const auth = ui.calls.find(call => call.url === "/api/admin/auth");
    assert.deepEqual(JSON.parse(auth.options.body), { password: "synthetic-access-code" });
    const html = markup(await ui.settle()); assert.match(html, visible); assert.doesNotMatch(html, /ADMIN ACCESS REQUIRED|Open Ballad workspace|Open Show Management/);
  }
});

test("the combined dashboard keeps a direct breadcrumb back to its Owner category", async () => {
  const tree = await mount(undefined, { route: "app/admin/page.tsx" }).settle();
  const breadcrumb = markup(find(tree, node => node.type === "nav" && node.props["aria-label"] === "Breadcrumb"));
  assert.ok(/href="\/account\/owner\/radio"/.test(breadcrumb), "dashboard breadcrumb must link to Radio & shows");
  assert.match(breadcrumb, /aria-current="page"[^>]*>Show &amp; BNL controls<\/span>/);
});
