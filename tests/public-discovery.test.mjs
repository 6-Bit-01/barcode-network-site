import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import postcss from "postcss";
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

function homeNodes() {
  const markup = renderToStaticMarkup(React.createElement(Home()));
  const nodes = [], stack = [];
  let cursor = 0;
  for (const match of markup.matchAll(/<(\/?)([\w-]+)\b([^>]*)>/g)) {
    for (const ancestor of stack) ancestor.text += markup.slice(cursor, match.index);
    cursor = match.index + match[0].length;
    if (match[1]) { stack.pop(); continue; }
    const attrs = Object.fromEntries([...match[3].matchAll(/(?:^|\s)([\w:-]+)(?:="([^"]*)")?/g)].map((attr) => [attr[1], attr[2] ?? ""]));
    const node = { tag: match[2], attrs, parent: stack.at(-1), text: "" };
    nodes.push(node);
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(node.tag)) stack.push(node);
  }
  return nodes;
}
const hasClass = (node, name) => (node.attrs.class ?? "").split(/\s+/).includes(name);
function within(node, ancestor) {
  for (let current = node; current; current = current.parent) if (current === ancestor) return true;
  return false;
}
function motionSelectorMatches(node, selector, pseudo, checked, checkbox) {
  const [body, selectedPseudo = ""] = selector.trim().split("::");
  if (selectedPseudo !== pseudo) return false;
  const matches = (candidate, token) => {
    const condition = token.match(/:has\(\.([\w-]+):checked\)/);
    if (condition && !(checked && hasClass(checkbox, condition[1]) && within(checkbox, candidate))) return false;
    const simple = token.replace(/:has\([^)]+\)/, "");
    return simple === "*" || (/^(\.[\w-]+)+$/.test(simple) && [...simple.matchAll(/\.([\w-]+)/g)].every((part) => hasClass(candidate, part[1])));
  };
  const parts = body.split(/\s+/).reverse();
  let current = node;
  if (!matches(current, parts[0])) return false;
  for (const part of parts.slice(1)) {
    do { current = current.parent; } while (current && !matches(current, part));
    if (!current) return false;
  }
  return true;
}
function motionMedia(rule, preference) {
  for (let current = rule.parent; current; current = current.parent)
    if (current.type === "atrule" && current.name === "media" && new RegExp("prefers-reduced-motion:\\s*" + preference + "\\b").test(current.params)) return true;
  return false;
}

test("HQ native pause and reduced-motion rules cover every rendered animated layer", () => {
  const nodes = homeNodes();
  const label = nodes.find((node) => node.tag === "label" && /\bpause\b.*\banimation\b/i.test(node.text));
  assert.ok(label, "Motion has a visible native label");
  const checkbox = nodes.find((node) => node.tag === "input" && node.attrs.type === "checkbox" && within(node, label));
  assert.ok(checkbox, "Pause uses a native keyboard-operable checkbox");
  assert.ok(!Object.hasOwn(checkbox.attrs, "disabled") && checkbox.attrs.tabindex !== "-1");
  for (let current = checkbox; current; current = current.parent)
    assert.notEqual(current.attrs["aria-hidden"], "true", "Pause stays outside hidden decorative artwork");
  const art = nodes.find((node) => node.attrs["aria-hidden"] === "true" && nodes.some((child) => child.parent === node && child.tag === "svg"));
  assert.ok(art, "Artwork remains decorative");
  const svg = nodes.find((node) => node.parent === art && node.tag === "svg");
  assert.equal(svg.attrs.focusable, "false");
  assert.ok(svg.attrs.tabindex === undefined || svg.attrs.tabindex === "-1");
  const logo = nodes.find((node) => node.tag === "img" && within(node, art));
  assert.ok(logo, "The center logo is retained");
  const css = postcss.parse(fs.readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8"));
  const rules = [];
  css.walkRules((rule) => rules.push(rule));
  const targets = nodes.filter((node) => within(node, art)).flatMap((node) => ["", "before", "after"].map((pseudo) => ({ node, pseudo })));
  const declares = (rule, property, value) => rule.nodes.some((entry) => entry.type === "decl" && entry.prop === property && value.test(entry.value));
  const selected = (rule, target, checked = false) => rule.selectors.some((selector) => motionSelectorMatches(target.node, selector, target.pseudo, checked, checkbox));
  assert.ok(rules.some((rule) => !motionMedia(rule, "reduce") && declares(rule, "display", /^(?:inline-)?(?:flex|block|grid)$/) && selected(rule, { node: label, pseudo: "" })), "Pause is visible in the same no-preference context as the motion");
  const motion = [];
  for (const rule of rules.filter((rule) => declares(rule, "animation", /^(?!none\b).+/))) {
    const layers = targets.filter((target) => selected(rule, target));
    if (declares(rule, "animation", /\bpublic-signal-/)) assert.ok(layers.length, "Motion selectors must reach the actual rendered artwork");
    for (const target of layers) {
      assert.ok(motionMedia(rule, "no-preference"), "Motion only starts without a reduced-motion preference");
      assert.ok(target.pseudo || !within(logo, target.node), "The center logo stays stationary");
      motion.push(target);
    }
  }
  assert.ok(motion.length, "The artwork has animated layers");
  for (const target of motion) {
    const pause = rules.filter((rule) => !motionMedia(rule, "reduce") && declares(rule, "animation-play-state", /^paused$/));
    assert.ok(pause.some((rule) => selected(rule, target, true)), "Checking pause freezes every animated layer, including pseudo-elements");
    assert.ok(!pause.some((rule) => selected(rule, target, false)), "Unchecking pause allows every layer to resume");
    assert.ok(rules.some((rule) => motionMedia(rule, "reduce") && declares(rule, "animation", /^none$/) && selected(rule, target)), "Reduced motion disables every animated layer");
  }
  assert.ok(rules.some((rule) => motionMedia(rule, "reduce") && declares(rule, "display", /^none$/) && selected(rule, { node: label, pseudo: "" })), "The unused pause control is hidden for reduced motion");
});
