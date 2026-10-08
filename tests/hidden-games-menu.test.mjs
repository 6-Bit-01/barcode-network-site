import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const seenLinks = [];
const mocks = {
  "next/link": ({ children, prefetch, ...props }) => {
    seenLinks.push({ ...props, prefetch, children });
    return React.createElement("a", props, children);
  },
  "next/image": (props) => { const imageProps = { ...props }; delete imageProps.unoptimized; return React.createElement("img", imageProps); },
  "@/content": {
    siteConfig: { logo: "/logo.png", name: "BARCODE Network" },
    externalLinks: { discord: "https://discord.example", tiktok: "https://tiktok.example" },
  },
};
const footerModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(read("src/components/Footer.tsx"), {
  fileName: "Footer.tsx",
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText, {
  module: footerModule,
  exports: footerModule.exports,
  require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
});
const markup = require("react-dom/server").renderToStaticMarkup(
  React.createElement(footerModule.exports.Footer, {
    submission: { external: false, href: "/submit", resourceLabel: "Submit Music", footerSummary: "Music participation." },
  }),
);

test("copyright remains the single hidden-games entry with prefetch disabled and its original keyboard focus treatment", () => {
  const entries = seenLinks.filter((link) => link.href === "/system-override");
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.children, "©");
  assert.equal(entry["aria-label"], "Open hidden games");
  assert.equal(entry.prefetch, false);
  assert.equal(entry.target, undefined);
  assert.equal(entry.className, "rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent focus-visible:outline-offset-4");
  assert.match(markup, /<a[^>]*href="\/system-override"[^>]*aria-label="Open hidden games"[^>]*>©<\/a>/);
});

test("hidden launch destinations remain local and distinct from music participation links", () => {
  const menu = read("src/app/system-override/page.tsx");
  const destinations = [...menu.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(destinations, ["/games/system-override/index.html", "/games/system-clash/play/index.html", "/games/dead-air/index.html"]);
  assert.doesNotMatch(menu, /target=|download=|https?:|<iframe|<canvas/);
  assert.match(markup, /href="\/releases"/);
  assert.match(markup, /href="\/radio"/);
});

test("hidden games are absent from the public header and sitemap", () => {
  for (const path of ["src/components/Header.tsx", "src/app/sitemap.ts"]) {
    assert.doesNotMatch(read(path), /(?:["'`])\/(?:system-override|games\/(?:system-clash|dead-air))(?:["'`/])/);
  }
  assert.doesNotMatch(read("src/app/system-override/page.tsx"), /password|signIn|authGate|middleware/i);
});
