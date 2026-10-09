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
  new URL("../src/app/games/system-clash/page.tsx", import.meta.url), "utf8",
);
vm.runInNewContext(ts.transpileModule(source, {
  fileName: "page.tsx",
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText, { module: pageModule, exports: pageModule.exports, require });
const markup = require("react-dom/server").renderToStaticMarkup(
  React.createElement(pageModule.exports.default),
);

test("System Clash opens its same-origin standalone game in the current tab", () => {
  const launch = markup.match(/<a\b([^>]*)>Play System Clash Demo<\/a>/);
  assert(launch, "The launch action must be accessible text");
  assert.match(launch[1], /href="\/games\/system-clash\/play\/index\.html"/);
  assert.doesNotMatch(launch[1], /target=|download=/);
  assert.doesNotMatch(markup, /<iframe\b|<canvas\b/);
  assert.equal(pageModule.exports.metadata.alternates.canonical, "/games/system-clash");
});

test("System Clash identifies demo scope and keeps return paths to music and Radio", () => {
  assert.equal(pageModule.exports.metadata.title, "System Clash Demo");
  assert.match(pageModule.exports.metadata.description, /19 fighters/);
  assert.match(markup, /<h1\b[^>]*>System Clash Demo<\/h1>/);
  assert.match(markup, /Playable demo/);
  assert.match(markup, /19 BARCODE fighters/);
  assert.match(markup, /Solo CPU, Local Two Player, Tournament/);
  assert.doesNotMatch(markup, /first playable prototype|practice/i);
  assert.match(markup, /href="\/releases"/);
  assert.match(markup, /href="\/radio"/);
  assert.doesNotMatch(markup, /localhost|127\.0\.0\.1|prompt\.txt|portable\.html/i);
});
