import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function loadHub(readArchive) {
  const file = "src/app/bnl/page.tsx";
  const code = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  const req = (id) => {
    if (id === "react/jsx-runtime") return require("react/jsx-runtime");
    if (id === "react") return React;
    if (id === "next/link")
      return function LinkMock({ href, children, ...props }) {
        return React.createElement(
          "a",
          { href: String(href), ...props },
          children,
        );
      };
    if (id === "@/components/BNLRelay")
      return {
        BNLRelayModule: ({ title }) =>
          React.createElement("div", { "data-relay": true }, title),
      };
    if (id === "@/components/journal/JournalArticle")
      return {
        JournalArticle: ({ entry }) =>
          React.createElement(
            "article",
            { "data-latest-entry": entry.entryId },
            entry.title,
          ),
        JournalArchiveCard: ({ entry }) =>
          React.createElement(
            "article",
            { "data-recent-entry": entry.entryId },
            entry.title,
          ),
      };
    if (id === "@/lib/bnl-journal-store")
      return { listBNLJournalArchive: readArchive };
    throw new Error(`unmocked import ${id} in ${file}`);
  };
  vm.runInNewContext(
    code,
    {
      require: req,
      exports: cjsModule.exports,
      module: cjsModule,
      process,
      console,
    },
    { filename: file },
  );
  return cjsModule.exports;
}

function entry(entryId, title) {
  return { entryId, title, revision: 1 };
}

test("public BNL hub reuses only the public relay and Journal read paths", () => {
  const hub = read("src/app/bnl/page.tsx");

  assert.match(hub, /export const dynamic = "force-dynamic"/);
  assert.match(hub, /BNLRelayModule/);
  assert.match(hub, /listBNLJournalArchive\(1\)/);
  assert.match(hub, /href="\/journal"/);
  assert.match(hub, /href="\/database\/bnl-01"/);
  assert.doesNotMatch(
    hub,
    /listBNLJournalAdminEntries|listAllBNLJournalEntries|journal-control|read-model|queue|api\/admin|relay-history/i,
  );
});

test("public BNL hub renders the newest entry and a bounded recent list", async () => {
  const entries = [
    entry("journal-latest", "Latest public observation"),
    entry("journal-recent-1", "First recent observation"),
    entry("journal-recent-2", "Second recent observation"),
    entry("journal-recent-3", "Third recent observation"),
    entry("journal-recent-4", "Fourth recent observation"),
    entry("journal-recent-5", "Fifth recent observation"),
  ];
  let calls = 0;
  const hub = loadHub(async (page) => {
    calls += 1;
    assert.equal(page, 1);
    return {
      ok: true,
      value: { entries, page: 1, hasOlder: false, hasNewer: false },
    };
  });

  const html = renderToStaticMarkup(await hub.default());

  assert.equal(calls, 1);
  assert.match(html, /data-relay="true"/);
  assert.match(html, /data-latest-entry="journal-latest"/);
  assert.match(html, /data-recent-entry="journal-recent-1"/);
  assert.match(html, /data-recent-entry="journal-recent-2"/);
  assert.match(html, /data-recent-entry="journal-recent-3"/);
  assert.match(html, /data-recent-entry="journal-recent-4"/);
  assert.doesNotMatch(html, /data-recent-entry="journal-recent-5"/);
});

test("public BNL hub distinguishes an unavailable Journal from an empty one", async () => {
  const unavailableHub = loadHub(async () => ({
    ok: false,
    unavailable: true,
  }));
  const unavailable = renderToStaticMarkup(await unavailableHub.default());
  assert.match(unavailable, /Journal signal unavailable/);
  assert.match(unavailable, /current BNL-01 relay above remains available/);

  const emptyHub = loadHub(async () => ({
    ok: true,
    value: { entries: [], page: 1, hasOlder: false, hasNewer: false },
  }));
  const empty = renderToStaticMarkup(await emptyHub.default());
  assert.match(empty, /No public Journal entries have been published yet/);
  assert.doesNotMatch(empty, /Journal signal unavailable/);
});

test("the homepage and sitemap expose the public BNL hub", () => {
  const home = read("src/app/page.tsx");
  const sitemap = read("src/app/sitemap.ts");

  assert.match(home, /href="\/bnl"/);
  assert.match(home, /Open the BNL-01 hub/);
  assert.match(sitemap, /`\$\{base\}\/bnl`/);
});
