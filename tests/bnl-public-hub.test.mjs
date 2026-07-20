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

function loadHub(
  readArchive,
  readRelayHistory = async () => ({ ok: true, value: [] }),
) {
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
    if (id === "@/components/BNLRelayHistory")
      return {
        BNLRelayHistoryModule: ({ entries, unavailable }) =>
          React.createElement("div", {
            "data-relay-history": true,
            "data-relay-count": entries.length,
            "data-relay-unavailable": unavailable,
          }),
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
    if (id === "@/lib/bnl-status-store")
      return { listBNLPublicRelayHistory: readRelayHistory };
    if (id === "@/content")
      return { externalLinks: { discord: "https://discord.gg/4tHazmD528" } };
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

function loadRelayHistoryComponent() {
  const file = "src/components/BNLRelayHistory.tsx";
  const code = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    code,
    {
      require: (id) => {
        if (id === "react/jsx-runtime") return require("react/jsx-runtime");
        if (id === "react") return React;
        if (id === "@/components/BNLRelayTimestamp")
          return {
            BNLRelayTimestamp: ({ value }) =>
              React.createElement("time", { dateTime: value }, value),
          };
        throw new Error(`unmocked import ${id} in ${file}`);
      },
      exports: cjsModule.exports,
      module: cjsModule,
      Intl,
      Date,
    },
    { filename: file },
  );
  return cjsModule.exports;
}

function intlWithDefaultTimeZone(defaultTimeZone) {
  function DateTimeFormat(locales, options = {}) {
    return new Intl.DateTimeFormat(locales, {
      ...options,
      timeZone: options.timeZone ?? defaultTimeZone,
    });
  }

  return { DateTimeFormat };
}

function loadRelayTimestampComponent({
  hydrated = false,
  defaultTimeZone = "UTC",
} = {}) {
  const file = "src/components/BNLRelayTimestamp.tsx";
  const code = ts.transpileModule(read(file), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    code,
    {
      require: (id) => {
        if (id === "react/jsx-runtime") return require("react/jsx-runtime");
        if (id === "react")
          return { ...React, useSyncExternalStore: () => hydrated };
        throw new Error(`unmocked import ${id} in ${file}`);
      },
      exports: cjsModule.exports,
      module: cjsModule,
      Intl: intlWithDefaultTimeZone(defaultTimeZone),
      Date,
    },
    { filename: file },
  );
  return cjsModule.exports;
}

function entry(entryId, title) {
  return { entryId, title, revision: 1 };
}

test("public BNL hub uses only the bounded public relay and Journal read paths", () => {
  const hub = read("src/app/bnl/page.tsx");
  const relayStore = read("src/lib/bnl-status-store.ts");
  const publicReader = relayStore.slice(
    relayStore.indexOf("export async function listBNLPublicRelayHistory"),
    relayStore.indexOf("export async function appendLegacyBNLHistory"),
  );

  assert.match(hub, /export const dynamic = "force-dynamic"/);
  assert.match(hub, /BNLRelayHistoryModule/);
  assert.match(hub, /listBNLPublicRelayHistory\(\)/);
  assert.match(hub, /listBNLJournalArchive\(1\)/);
  assert.match(hub, /href="\/journal"/);
  assert.match(hub, /href="\/database\/bnl-01"/);
  assert.doesNotMatch(
    hub,
    /listBNLJournalAdminEntries|listAllBNLJournalEntries|journal-control|read-model|queue|api\/admin/i,
  );
  assert.match(publicReader, /BNL_V2_RELAY_HISTORY_KEY/);
  assert.doesNotMatch(publicReader, /BNL_V1_HISTORY_KEY|readBNLAdminState/);
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
  let journalCalls = 0;
  let relayCalls = 0;
  const hub = loadHub(
    async (page) => {
      journalCalls += 1;
      assert.equal(page, 1);
      return {
        ok: true,
        value: { entries, page: 1, hasOlder: false, hasNewer: false },
      };
    },
    async () => {
      relayCalls += 1;
      return {
        ok: true,
        value: [
          {
            message: "Latest relay",
            currentDirective: "Observe",
            publishedAt: "2026-07-19T00:00:00.000Z",
          },
        ],
      };
    },
  );

  const html = renderToStaticMarkup(await hub.default());

  assert.equal(journalCalls, 1);
  assert.equal(relayCalls, 1);
  assert.match(html, /data-relay-history="true"/);
  assert.match(html, /data-relay-count="1"/);
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
  assert.match(unavailable, /recent BNL-01 relay history above remains available/);

  const combinedFailureHub = loadHub(
    async () => ({ ok: false, unavailable: true }),
    async () => ({
      ok: false,
      value: [],
      persisted: true,
      unavailable: true,
    }),
  );
  const combinedFailure = renderToStaticMarkup(
    await combinedFailureHub.default(),
  );
  assert.match(
    combinedFailure,
    /public Journal archive and relay history cannot be read right now/,
  );
  assert.doesNotMatch(
    combinedFailure,
    /relay history above remains available/,
  );

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
  assert.match(home, /Open the BNL-01 Hub/);
  assert.match(sitemap, /`\$\{base\}\/bnl`/);
});

test("the Hub relay box renders at most 20 newest-first public projections", () => {
  const relayHistory = loadRelayHistoryComponent();
  const relayEntries = Array.from({ length: 21 }, (_, index) => ({
    message: `surface-reading-${String(index).padStart(2, "0")}`,
    currentDirective: `network-posture-${String(index).padStart(2, "0")}`,
    publishedAt: `2026-07-${String(19 - Math.floor(index / 2)).padStart(2, "0")}T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
  }));
  const html = renderToStaticMarkup(
    React.createElement(relayHistory.BNLRelayHistoryModule, {
      entries: relayEntries,
    }),
  );

  assert.equal((html.match(/Surface reading/g) ?? []).length, 20);
  assert.equal((html.match(/Network posture/g) ?? []).length, 20);
  assert.equal((html.match(/<time/g) ?? []).length, 20);
  assert.match(html, /surface-reading-00/);
  assert.match(html, /surface-reading-19/);
  assert.doesNotMatch(html, /surface-reading-20/);
  assert.match(html, /dateTime="2026-07-19T00:00:00.000Z"/);
  assert.match(html, /max-h-\[34rem\]/);
  assert.match(html, /overflow-y-auto/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-labelledby="recent-bnl-relays-heading"/);
  assert.doesNotMatch(html, /Signal condition|Signal origin/i);
});

test("relay timestamps hydrate from UTC into the visitor's browser timezone", () => {
  const value = "2026-07-19T19:40:00.000Z";
  const serverTimestamp = loadRelayTimestampComponent({
    hydrated: false,
    defaultTimeZone: "America/Los_Angeles",
  });
  const pacificTimestamp = loadRelayTimestampComponent({
    hydrated: true,
    defaultTimeZone: "America/Los_Angeles",
  });

  const serverHtml = renderToStaticMarkup(
    React.createElement(serverTimestamp.BNLRelayTimestamp, { value }),
  );
  const pacificHtml = renderToStaticMarkup(
    React.createElement(pacificTimestamp.BNLRelayTimestamp, { value }),
  );

  assert.match(serverHtml, /Jul 19, 2026, 7:40 PM UTC/);
  assert.match(pacificHtml, /Jul 19, 2026, 12:40 PM PDT/);
  assert.match(pacificHtml, /datetime="2026-07-19T19:40:00.000Z"/i);
});

test("relay timestamp formatting handles DST, date rollover, and invalid input", () => {
  const timestamp = loadRelayTimestampComponent();

  assert.equal(
    timestamp.formatTransmissionTime(
      "2026-01-19T19:40:00.000Z",
      "America/Los_Angeles",
    ),
    "Jan 19, 2026, 11:40 AM PST",
  );
  assert.equal(
    timestamp.formatTransmissionTime(
      "2026-07-19T19:40:00.000Z",
      "America/New_York",
    ),
    "Jul 19, 2026, 3:40 PM EDT",
  );
  assert.equal(
    timestamp.formatTransmissionTime(
      "2026-07-19T19:40:00.000Z",
      "Asia/Tokyo",
    ),
    "Jul 20, 2026, 4:40 AM GMT+9",
  );
  assert.equal(
    timestamp.formatTransmissionTime("not-a-timestamp"),
    "Time unavailable",
  );
});

test("the Hub relay box distinguishes empty history from an unavailable read", () => {
  const relayHistory = loadRelayHistoryComponent();
  const empty = renderToStaticMarkup(
    React.createElement(relayHistory.BNLRelayHistoryModule, { entries: [] }),
  );
  const unavailable = renderToStaticMarkup(
    React.createElement(relayHistory.BNLRelayHistoryModule, {
      entries: [],
      unavailable: true,
    }),
  );

  assert.match(empty, /No public BNL-01 relays have been published yet/);
  assert.doesNotMatch(empty, /Relay history unavailable/);
  assert.match(unavailable, /Relay history unavailable/);
  assert.doesNotMatch(
    unavailable,
    /No public BNL-01 relays have been published yet/,
  );
});

test("Terminal BNL public experience uses bounded readers, commands, timestamps, and keeps operational boundaries", () => {
  const page = read("src/app/terminal/page.tsx");
  const terminal = read("src/components/NetworkArchiveTerminal.tsx");
  const apiRoutes = [
    "src/app/api/bnl/status/route.ts",
    "src/app/api/bnl/journal/route.ts",
    "src/app/api/bnl/read-model/route.ts",
  ].map(read).join("\n");

  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /Promise\.all\(\[/);
  assert.match(page, /listBNLPublicRelayHistory\(\)/);
  assert.match(page, /listBNLJournalArchive\(1\)/);
  assert.match(page, /relays: \(relayHistory\.ok \? relayHistory\.value : \[\]\)\.slice\(0, 20\)\.map/);
  assert.match(page, /message: entry\.message/);
  assert.match(page, /currentDirective: entry\.currentDirective/);
  assert.match(page, /publishedAt: entry\.publishedAt/);
  assert.match(page, /entryKind: entry\.entryKind \?\? "manual"/);
  assert.doesNotMatch(page, /sourceClass|trigger|adminNote|sections|hash|sourceWindow|memory/i);

  assert.match(terminal, /const primaryButtons = \["HELP", "MAP", "ORIGINS"\]/);
  assert.match(terminal, /const bnlButtons = \[\{ label: "STATUS", command: "STATUS" \}, \{ label: "TRACE", command: "BNL-01" \}, \{ label: "RELAYS", command: "RELAYS" \}, \{ label: "JOURNAL", command: "BNL LOG" \}, \{ label: "HUB", command: "BNL HUB" \}\]/);
  assert.match(terminal, /const archiveButtons = \["DATABASE", "WHOIS 6 BIT", "TRANSMISSIONS", "RADIO", "RELEASES", "CLEAR", "LOCK"\]/);
  assert.match(terminal, /<nav aria-label="Archive command shortcuts"/);
  assert.match(terminal, /role="group" aria-labelledby="archive-index-bnl"/);
  assert.match(terminal, /id="archive-index-bnl"[^>]*>BNL-01<\/p>/);
  assert.match(terminal, /bnlButtons\.map\(\(item\) => <button type="button" key=\{item\.command\} onClick=\{\(\) => execute\(item\.command\)\}/);
  assert.match(terminal, /command === "TRACE BNL-01" \|\| command === "BNL-01" \|\| command === "BNL"\) return pushLive\(raw, "trace"\)/);
  assert.match(terminal, /command === "LIST RELAYS" \|\| command === "RELAYS"/);
  assert.match(terminal, /command === "BNL LOG"/);
  assert.match(terminal, /command === "BNL HUB"/);
  assert.match(terminal, /command === "STATUS"\) return pushLive\(raw, "status"\)/);
  assert.match(terminal, /liveView\?: "status" \| "trace"/);
  assert.match(terminal, /entry\.liveView === "trace" \? <TraceBNL data=\{bnl\}/);
  assert.match(terminal, /entry\.liveView === "status" \? <Status data=\{bnl\}/);
  assert.match(terminal, /discordHref=\{archive\.radio\.links\.discord\}/);
  assert.doesNotMatch(terminal, /<TraceBNL data=\{bnl\} loading=\{loading\} dossier=\{bnlDossier\} \/>/);
  assert.match(terminal, /<BNLRelayTimestamp value=\{entry\.publishedAt\}/);
  assert.match(terminal, /h-\[calc\(100dvh-7rem\)\]/);
  assert.match(terminal, /overflow-y-auto/);
  assert.match(terminal, /Up\/Down recalls command history/);
  assert.match(terminal, /clearTerminalSession\(\); onLock\(\)/);
  assert.doesNotMatch(terminal, /textarea|message input|fetch\([^)]*method:\s*["']POST/i);
  assert.doesNotMatch(apiRoutes, /chat|conversation|messageInput/i);
});

test("BNL public paths are connected without adding modules to unrelated operational surfaces", () => {
  const combined = [
    "src/app/bnl/page.tsx",
    "src/components/BNLRelay.tsx",
    "src/app/page.tsx",
    "src/app/radio/page.tsx",
    "src/app/journal/page.tsx",
    "src/app/journal/[entryId]/page.tsx",
    "src/content.ts",
    "src/app/transmissions/[slug]/page.tsx",
  ].map(read).join("\n");
  const untouched = [
    "src/app/merch/page.tsx",
    "src/app/contact/page.tsx",
    "src/app/legal/page.tsx",
    "src/app/queue/page.tsx",
  ].filter((file) => fs.existsSync(file)).map(read).join("\n");

  assert.match(combined, /href="\/bnl"/);
  assert.match(combined, /href="\/radio"/);
  assert.match(combined, /href="\/terminal"/);
  assert.match(combined, /href="\/database\/bnl-01"/);
  assert.doesNotMatch(combined, /discord\.gg\/barcode/);
  assert.match(combined, /externalLinks\.discord/);
  assert.match(combined, /post\.tags\.some/);
  assert.doesNotMatch(untouched, /BNL-01 Hub|BNLRelayModule|BNLNetworkRelayTicker/);
});
