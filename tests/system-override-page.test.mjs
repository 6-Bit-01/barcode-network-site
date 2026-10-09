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
  new URL("../src/app/secret-menu/page.tsx", import.meta.url),
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

test("hidden games launches all three standalone games with normal same-tab links", () => {
  const links = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.equal(links.length, 3);
  assert.match(links[0][1], /href="\/games\/system-override\/index\.html"/);
  assert.equal(links[0][2], "Play System Override");
  assert.match(links[1][1], /href="\/games\/system-clash\/play\/index\.html"/);
  assert.equal(links[1][2], "Play System Clash Demo");
  assert.match(links[2][1], /href="\/games\/dead-air\/index\.html"/);
  assert.equal(links[2][2], "Play Dead Air");
  for (const link of links) {
    assert.doesNotMatch(link[1], /target=|download=/);
    assert.match(link[1], /focus-visible:outline-accent/);
  }
  assert.doesNotMatch(markup, /<iframe\b|<canvas\b/);
});

test("hidden games identifies all three games at its renamed secret-menu route", () => {
  assert.equal(pageModule.exports.metadata.title, "Hidden Games");
  assert.equal(pageModule.exports.metadata.alternates.canonical, "/secret-menu");
  assert.equal(pageModule.exports.metadata.description, "Play BARCODE: System Override, System Clash Demo and Dead Air in your browser.");
  assert.match(markup, /<h1\b[^>]*>Hidden Games<\/h1>/);
  const cards = [...markup.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length, 3);
  for (const [, attributes, content] of cards) {
    const title = attributes.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(title);
    assert.match(content, new RegExp(`<h2[^>]*id="${title}"`));
  }
  assert.match(cards[0][2], />System Override<\/h2>/);
  assert.match(cards[1][2], />System Clash Demo<\/h2>/);
  assert.match(cards[2][2], />Dead Air<\/h2>/);
  assert.match(cards[2][2], /Story-led tutorials teach each mechanic/);
  assert.match(cards[2][2], /keyboard, controller or touch/);
});

test("browser save guidance stays with System Override while hidden games omit old Makko copy", () => {
  const cards = [...markup.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)];
  assert.match(cards[0][1], /Saved settings and progress belong to this browser on this site\./);
  assert.doesNotMatch(markup, /Makko|transfer automatically/i);
  assert.doesNotMatch(cards[1][1], /Makko|transfer automatically/);
  assert.match(cards[1][1], /19 BARCODE fighters/);
  assert.match(cards[1][1], /Solo CPU, Local Two Player, Tournament or Online Sessions across seven interactive arenas/);
  assert.doesNotMatch(cards[1][1], /Practice|Weapons|19 playable/i);
});
