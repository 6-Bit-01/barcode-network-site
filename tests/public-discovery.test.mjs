import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      module: cjsModule,
      exports: cjsModule.exports,
      require: (id) => (Object.hasOwn(mocks, id) ? mocks[id] : require(id)),
    },
  );
  return cjsModule.exports;
}
const content = load("src/content.ts");
const Link = ({ children, ...props }) =>
  React.createElement("a", props, children);
const Home = () =>
  load("src/app/page.tsx", {
    "next/link": Link,
    "next/image": (input) => {
      const props = { ...input };
      for (const key of ["fill", "unoptimized", "priority"]) delete props[key];
      return React.createElement("img", props);
    },
    "@/content": content,
    "@/components/LiveEffects": {
      StatusBadge: ({ status }) => status,
      SectionDot: () => null,
    },
    "@/components/PublicIcon": { PublicIcon: () => null },
    "@/components/BNLRelay": {
      BNLRelayModule: () =>
        React.createElement("div", { "data-existing-relay": true }),
    },
    "@/components/RadioBroadcastFeature": {
      RadioBroadcastFeature: ({ compact }) =>
        React.createElement("div", { "data-existing-feature": compact }),
    },
  }).default;
const plain = (markup) =>
  markup
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");

test("homepage keeps full background information behind native disclosures and retains each discovery destination", () => {
  const markup = renderToStaticMarkup(React.createElement(Home()));
  assert.match(
    markup,
    /<details[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?About BARCODE/,
  );
  const text = plain(markup);
  const { homePage, externalLinks } = content;
  for (const value of [
    homePage.hero.description,
    homePage.orientation.heading,
    ...homePage.orientation.paragraphs,
    homePage.routeSection.heading,
    homePage.routeSection.introduction,
    homePage.mission.heading,
    homePage.mission.statement,
    homePage.mission.body,
    homePage.deeperTransmission.heading,
    homePage.deeperTransmission.body,
    ...homePage.programs.map((p) => p.description),
  ])
    assert.ok(text.includes(value), `Retains: ${value}`);
  for (const href of [
    "/releases",
    "/radio",
    "/database",
    "/transmissions",
    "/terminal",
    "/bnl",
    externalLinks.discord,
    externalLinks.tiktok,
  ])
    assert.ok(markup.includes(`href="${href}"`), `Retains ${href}`);
  assert.match(markup, /data-existing-feature="true"/);
  assert.match(markup, /data-existing-relay="true"/);
});
