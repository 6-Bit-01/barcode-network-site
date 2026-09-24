import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual components and hooks across edits/server updates, without
// a live admin session or payment services.
const source = fs.readFileSync(new URL("../src/components/AdminShowManagement.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(`${source}\nexport { CurrentSession, StartNewSession };`, { fileName: "AdminShowManagement.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function harness(name, initialProps) {
  const slots = [], effectDeps = [];
  let cursor, effectCursor, effects, dirty, tree, props = initialProps;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => { const value = typeof next === "function" ? next(slots[index]) : next; if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; } }];
    },
    useEffect(run, deps) {
      const index = effectCursor++;
      if (!effectDeps[index] || deps.some((value, i) => !Object.is(value, effectDeps[index][i]))) effects.push(run);
      effectDeps[index] = deps;
    },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const cjsModule = { exports: {} };
  vm.runInNewContext(code, { module: cjsModule, exports: cjsModule.exports, Intl, window: { setTimeout: () => 1 }, require: id => id === "react" ? react : id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" } : id === "@/lib/queue-types" ? { formatRuntime: () => "0:00" } : {} });
  function render(next = props) {
    props = next;
    let runs = 0;
    do {
      cursor = 0; effectCursor = 0; effects = []; dirty = false;
      tree = cjsModule.exports[name](props);
      effects.forEach(run => run());
      if (++runs > 12) throw new Error("unstable render");
    } while (dirty);
    return tree;
  }
  render();
  function nodes(node) { return Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === "object" ? [node, ...nodes(node.props.children)] : []; }
  function textOf(node) { return Array.isArray(node) ? node.map(textOf).join("") : node && typeof node === "object" ? textOf(node.props.children) : node === false || node == null ? "" : String(node); }
  return { render, nodes: () => nodes(tree), text: () => textOf(tree), button: label => nodes(tree).find(node => node.type === "button" && textOf(node) === label), price: () => nodes(tree).find(node => node.type === "label" && textOf(node).startsWith("Signal Hold price"))?.props.children.find(node => node.type === "input") };
}
const session = { sessionId: "show", title: "Rehearsal", purpose: "rehearsal", signalHoldPriceCents: 0, signalHoldCurrency: "usd", signalHoldPaymentsEnabled: false, priorityUpgradePriceCents: 1000, priorityUpgradeCurrency: "usd", submissionCooldownSeconds: 300 };

test("active show does not display unrelated new-session default prices", () => {
  const view = harness("StartNewSession", { locked: true, sessionId: "show", signalHoldPriceCents: 0, priorityUpgradePriceCents: 1000 });
  assert.match(view.text(), /CURRENT SESSION EXISTS/);
  assert.equal(view.nodes().filter(node => node.type === "input").length, 0);
  assert.doesNotMatch(view.text(), /Display price|\$0\.00/);
});

test("Signal Hold preview follows typing, survives server refresh, and Cancel restores saved settings", () => {
  const props = { session, onPost: async () => null };
  const view = harness("CurrentSession", props);
  view.button("Edit Session Options").props.onClick(); view.render();
  assert.equal(view.price().props.disabled, undefined, "price can be configured before enabling payment");
  view.price().props.onChange({ target: { value: "725" } }); view.render();
  assert.match(view.text(), /\$7\.25 USD/);
  const refreshed = { ...props, session: { ...session, signalHoldPriceCents: 100 } };
  view.render(refreshed);
  assert.equal(view.price().props.value, 725);
  assert.match(view.text(), /\$7\.25 USD/);
  view.button("Cancel").props.onClick(); view.render();
  view.button("Edit Session Options").props.onClick(); view.render();
  assert.equal(view.price().props.value, 100);
});

test("saving session options preserves the typed Hold price through intermediate response refreshes", async () => {
  const calls = [];
  let saved = { ...session }, view;
  const props = { session: saved, onPost: async body => {
    calls.push(body);
    if (body.action === "updateSignalHoldSettings") saved = { ...saved, signalHoldPriceCents: body.priceCents, signalHoldPaymentsEnabled: body.paymentsEnabled };
    view.render({ ...props, session: { ...saved } });
    return { session: saved };
  } };
  view = harness("CurrentSession", props);
  view.button("Edit Session Options").props.onClick(); view.render();
  view.price().props.onChange({ target: { value: "650" } }); view.render();
  await view.button("Save Session Options").props.onClick(); view.render({ ...props, session: saved });
  assert.equal(calls.find(body => body.action === "updateSignalHoldSettings").priceCents, 650);
  assert.match(view.text(), /\$6\.50 USD/);
  assert.match(view.text(), /Session options saved/);
});
