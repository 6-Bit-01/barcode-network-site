import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const filename = "src/components/PublicQueueSession.tsx";

function component(name) {
  const source = ts.createSourceFile(filename, fs.readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = source.statements.find(entry => ts.isFunctionDeclaration(entry) && entry.name?.text === name);
  assert.ok(node, `Missing queue component ${name}`);
  const compiled = ts.transpileModule(`${node.getText(source)}\nexports.component = ${name};`, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require,
    Link: ({ children, ...props }) => React.createElement("a", props, children),
  });
  return exports.component;
}

const render = (name, props) => renderToStaticMarkup(React.createElement(component(name), props));

test("a capped public queue offers the Deck instead of a dead-end limit label", () => {
  const html = render("QueueParticipationAction", { canSubmit: false, submitLabel: "Submission Limit Reached", limitReached: true, deckHref: "/radio/deck?sessionId=night", onSubmit() {} });
  assert.match(html, /href="\/radio\/deck\?sessionId=night"/);
  assert.match(html, /Open Broadcast Deck/);
  assert.doesNotMatch(html, /Submission Limit Reached/);
});

test("a capped rehearsal retains management without a public Deck handoff", () => {
  const html = render("QueueParticipationAction", { canSubmit: false, submitLabel: "Submission Limit Reached", limitReached: true, deckHref: null, onSubmit() {} });
  assert.match(html, /href="#your-songs"/);
  assert.match(html, /Manage My Songs/);
  assert.doesNotMatch(html, /\/radio\/deck/);
});

test("available intake stays a command and closed intake is not silently reopened", () => {
  let submissions = 0;
  const element = component("QueueParticipationAction")({ canSubmit: true, submitLabel: "Submit Track", limitReached: false, deckHref: "/radio/deck", onSubmit() { submissions += 1; } });
  assert.equal(element.type, "button");
  element.props.onClick();
  assert.equal(submissions, 1);
  const html = render("QueueParticipationAction", { canSubmit: false, submitLabel: "Queue Full", limitReached: false, deckHref: null, onSubmit() {} });
  assert.match(html, /Queue Full/);
  assert.doesNotMatch(html, /<button/);
});

const receipt = { artist: "Main Artist feat. Guest Artist", title: "Confirmed song", sessionTitle: "Friday night", sessionDate: "2026-10-09", trackCode: "ABC12345", trackId: "abc12345-full", sessionId: "night", remaining: 2, limit: 3, deckHref: "/radio/deck?sessionId=night&submitted=abc12345-full", checkoutPending: false };

test("acceptance keeps complete credits, server allowance, and next actions", () => {
  const html = render("QueueSubmissionReceiptPanel", { receipt, canSubmit: true, onSubmit() {}, onClose() {} });
  for (const text of ["Main Artist feat. Guest Artist", "Confirmed song", "ABC12345", "2 submissions remaining", "Submit Another", "Open Broadcast Deck", "Manage My Songs"]) assert.ok(html.includes(text), text);
  assert.match(html, /role="status"/);
});

test("final and unknown allowance receipts never promise another submission", () => {
  for (const remaining of [0, null]) {
    const html = render("QueueSubmissionReceiptPanel", { receipt: { ...receipt, remaining }, canSubmit: true, onSubmit() {}, onClose() {} });
    assert.doesNotMatch(html, /Submit Another/);
    assert.match(html, /Manage My Songs/);
  }
});

test("paid recovery takes priority over the Deck and another submission", () => {
  const html = render("QueueSubmissionReceiptPanel", { receipt: { ...receipt, remaining: 0, checkoutPending: true }, canSubmit: false, onSubmit() {}, onClose() {} });
  assert.match(html, /Review Payment/);
  assert.match(html, /href="#queue-payment-controls"/);
  assert.doesNotMatch(html, /Open Broadcast Deck|Submit Another/);
});

test("a rehearsal receipt never invents a public Deck destination", () => {
  const html = render("QueueSubmissionReceiptPanel", { receipt: { ...receipt, deckHref: null }, canSubmit: true, onSubmit() {}, onClose() {} });
  assert.doesNotMatch(html, /Open Broadcast Deck|\/radio\/deck/);
  assert.match(html, /Submit Another/);
});
