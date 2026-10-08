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

test("hidden games launches both standalone games with normal same-tab links", () => {
  const links = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 2);
  assert.match(links[0][1], /href="\/games\/system-override\/index\.html"/);
  assert.equal(links[0][2], "Play System Override");
  assert.match(links[1][1], /href="\/games\/system-clash\/play\/index\.html"/);
  assert.equal(links[1][2], "Play System Clash Demo");
  for (const link of links) {
    assert.doesNotMatch(link[1], /target=|download=/);
    assert.match(link[1], /focus-visible:outline-accent/);
  }
  assert.doesNotMatch(markup, /<iframe\b|<canvas\b/);
});

test("hidden games identifies both games while retaining its existing route", () => {
  assert.equal(pageModule.exports.metadata.title, "Hidden Games");
  assert.equal(pageModule.exports.metadata.alternates.canonical, "/system-override");
  assert.equal(pageModule.exports.metadata.description, "Play BARCODE: System Override and System Clash Demo in your browser.");
  assert.match(markup, /<h1\b[^>]*>Hidden Games<\/h1>/);
  const cards = [...markup.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, 2);
  for (const [, attributes, content] of cards) {
    const title = attributes.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(title);
    assert.match(content, new RegExp(`<h2[^>]*id="${title}"`));
  }
  assert.match(cards[0][2], />System Override<\/h2>/);
  assert.match(cards[1][2], />System Clash Demo<\/h2>/);
});

test("browser and Makko save copy remains specifically with System Override", () => {
  const cards = [...markup.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)];
  assert.match(cards[0][1], /Saved settings and progress belong to this browser on this site\./);
  assert.match(cards[0][1], /Saves from the Makko version do not transfer automatically\./);
  assert.doesNotMatch(cards[1][1], /Makko|transfer automatically/);
  assert.match(cards[1][1], /13 BARCODE fighters/);
  assert.match(cards[1][1], /Solo CPU or Local Two Player/);
  assert.doesNotMatch(cards[1][1], /Practice|Weapons|Tournament|18 playable/i);
});
