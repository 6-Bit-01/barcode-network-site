import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const pageModule = { exports: {} };
const source = fs.readFileSync(
  new URL("../src/app/system-override/page.tsx", import.meta.url),
  "utf8",
);

vm.runInNewContext(
  ts.transpileModule(source, {
    fileName: "page.tsx",
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText,
  { module: pageModule, exports: pageModule.exports, require },
);

const markup = require("react-dom/server").renderToStaticMarkup(
  React.createElement(pageModule.exports.default),
);

test("System Override launches the standalone game with a normal same-tab link", () => {
  const links = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 1);
  assert.match(links[0][1], /href="\/games\/system-override\/index\.html"/);
  assert.doesNotMatch(links[0][1], /target=|download=/);
  assert.equal(links[0][2], "Play System Override");
  assert.doesNotMatch(markup, /<iframe\b|<canvas\b/);
});

test("System Override identifies its public route and game", () => {
  assert.equal(pageModule.exports.metadata.title, "System Override");
  assert.equal(pageModule.exports.metadata.alternates.canonical, "/system-override");
  assert.equal(pageModule.exports.metadata.description, "Play BARCODE: System Override in your browser.");
  assert.match(markup, /<h1\b[^>]*>System Override<\/h1>/);
});

test("System Override explains that existing Makko saves do not migrate automatically", () => {
  assert.match(markup, /Saved settings and progress belong to this browser on this site\./);
  assert.match(markup, /Saves from the Makko version do not transfer automatically\./);
});
