import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

function publicTrack(id, title = id) {
  return { id, submittedArtistName: "Primary Artist", submittedSongTitle: title, collaboratorNames: "Guest A, Guest B", sourceType: "soundcloud", publicSourceUrl: `https://soundcloud.com/artist/${id}`, lane: "free", durationLabel: "3:00", estimatedDurationSeconds: 180, durationIsEstimate: true };
}

function ownedTrack(id, title = id) {
  return { id, artist: "Primary Artist", title, collaboratorNames: "Guest A, Guest B", note: "private host note", replacementRevision: 0, editUsed: false, canReplace: false, unavailableReason: "locked" };
}

function showFixture() {
  const snapshot = { revision: 1, sessionActive: true, session: { sessionId: "show-1", title: "Friday Radio", showDate: "2026-10-09", purpose: "live_broadcast", status: "live", broadcastPhase: "broadcast_active", showStarted: true, wheelSpinsOwed: 0 }, status: { isOpen: true, activeCount: 3, acceptedCount: 5, estimatedRuntimeSeconds: 540, capacity: 44, isFull: false, pressure: "low" }, nowPlaying: publicTrack("playing"), upNext: publicTrack("next"), queue: [publicTrack("waiting")], completed: [publicTrack("finished"), publicTrack("skipped")], ownedTracks: ["playing", "next", "waiting", "finished", "skipped", "removed"].map((id) => ownedTrack(id)), playbackTiming: null, wheelTiming: null };
  const stats = { currentShow: { sessionId: "show-1", title: "Friday Radio", showDate: "2026-10-09", submittedTrackCount: 6, finishedTrackCount: 1, skippedTrackCount: 1, removedTrackCount: 1, trackRoster: ["playing", "next", "waiting", "finished", "skipped", "removed"].map((id) => ({ sessionId: "show-1", trackId: id, projectLabel: "Corrected Primary", title: id, collaboratorNames: "Corrected Guest A; Corrected Guest B", outcome: ["finished", "skipped", "removed"].includes(id) ? id : "active", sourceType: "soundcloud", publicSourceUrl: `https://soundcloud.com/artist/${id}` })), milestones: [] }, personalHistory: { handles: [] } };
  return { snapshot, stats };
}

function mountDeck({ snapshot, stats, search = "?sessionId=show-1&submitted=waiting", props = {} }) {
  const states = [];
  let cursor = 0;
  let effects = [];
  let poll;
  const storage = new Map([["barcode-radio-submitter-token", "browser-token"]]);
  const window = { location: { origin: "https://barcode.test", search }, localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  const hooks = {
    ...React,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useCallback: (callback) => callback,
    useMemo: (calculate) => calculate(),
    useEffect: (effect) => { effects.push(effect); },
  };
  const modules = new Map();
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const cjsModule = { exports: {} };
    modules.set(filename, cjsModule);
    const isDeck = filename.endsWith("BroadcastDeck.tsx");
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      module: cjsModule, exports: cjsModule.exports, URL, URLSearchParams, Date, window, document: { body: {} },
      fetch: async (url) => ({ ok: true, json: async () => url.startsWith(props.statsEndpoint ?? "/api/queue/stats") ? stats : snapshot }),
      require: (id) => {
        if (isDeck && id === "react") return hooks;
        if (isDeck && id === "react-dom") return { createPortal: (children) => children };
        if (id === "next/link") return { __esModule: true, default: ({ children, ...attributes }) => React.createElement("a", attributes, children) };
        if (id === "@/components/BroadcastActivityLog") return { BroadcastActivityLog: () => null };
        if (id === "@/lib/session-bound-polling") return { hasActiveQueueSession: (value) => Boolean(value?.session), startSessionBoundPolling: ({ poll: next }) => { poll = next; return () => {}; } };
        if (id.startsWith("@/") || id.startsWith(".")) {
          const stem = id.startsWith("@/") ? path.join(root, "src", id.slice(2)) : path.resolve(path.dirname(filename), id);
          const resolved = [stem, `${stem}.ts`, `${stem}.tsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
          if (!resolved) throw new Error(`Missing local module ${id}`);
          return load(resolved);
        }
        return require(id);
      },
    }, { filename });
    return cjsModule.exports;
  }
  const { BroadcastDeck } = load(path.join(root, "src/components/BroadcastDeck.tsx"));
  function render() {
    cursor = 0;
    effects = [];
    const tree = BroadcastDeck(props);
    return { tree, html: renderToStaticMarkup(tree) };
  }
  render();
  for (const effect of effects) effect();
  return { render, refresh: () => poll(), setStats: (value) => { stats = value; } };
}

function findElement(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test("confirmed handoff arrives at owned current songs without blocking orientation", async () => {
  const deck = mountDeck(showFixture());
  await deck.refresh();
  const { html, tree } = deck.render();
  assert.doesNotMatch(html, /role="dialog"/);
  assert.match(html, /Song accepted/);
  assert.match(html, /waiting/);
  assert.match(html, /href="\/queue\/show-1#your-songs"/);
  assert.doesNotMatch(html, /private host note/);
  const orientationButton = findElement(tree, (element) => element.type === "button" && element.props.children === "How to use the Deck");
  assert.ok(orientationButton);
  orientationButton.props.onClick();
  assert.match(deck.render().html, /role="dialog"/);
});

test("arbitrary submitted IDs and other-session arrivals cannot produce an acceptance receipt", async () => {
  for (const search of ["?sessionId=show-1&submitted=not-owned", "?sessionId=another-show&submitted=waiting", "?submitted=waiting"]) {
    const deck = mountDeck({ ...showFixture(), search });
    await deck.refresh();
    assert.doesNotMatch(deck.render().html, /Song accepted/, search);
  }
});

test("current browser track rows show grounded lifecycle statuses and complete corrected credits", async () => {
  const deck = mountDeck(showFixture());
  await deck.refresh();
  const { tree, html } = deck.render();
  const rows = ["playing", "next", "waiting", "finished", "skipped", "removed"].map((id) => findElement(tree, (element) => element.props?.["data-owned-track-id"] === id));
  assert.ok(rows.every(Boolean), "all owned current-show tracks should appear immediately");
  for (const [index, status] of ["Now Playing", "Next In Line", "Waiting", "Completed", "Skipped", "Removed"].entries()) {
    const row = renderToStaticMarkup(rows[index]);
    assert.match(row, new RegExp(status));
    assert.match(row, /Corrected Primary/);
    assert.match(row, /Corrected Guest A/);
    assert.match(row, /Corrected Guest B/);
  }
  assert.doesNotMatch(html, /private host note/);
});

test("missing matching outcome evidence never labels a removed or skipped submission completed", async () => {
  const { snapshot } = showFixture();
  const deck = mountDeck({ snapshot, stats: null });
  await deck.refresh();
  const { tree } = deck.render();
  const removed = findElement(tree, (element) => element.props?.["data-owned-track-id"] === "removed");
  const skipped = findElement(tree, (element) => element.props?.["data-owned-track-id"] === "skipped");
  assert.ok(removed && skipped);
  assert.match(renderToStaticMarkup(removed), /Status unavailable/);
  assert.doesNotMatch(renderToStaticMarkup(skipped), />Completed</);
});

test("owned uploaded songs render metadata without exposing upload file URLs", async () => {
  const fixture = showFixture();
  fixture.snapshot.queue[0] = { ...fixture.snapshot.queue[0], sourceType: "upload", publicSourceUrl: "https://private-blob.example/upload.mp3", uploadUrl: "https://private-blob.example/raw.mp3" };
  fixture.stats.currentShow.trackRoster.find((track) => track.trackId === "waiting").sourceType = "upload";
  const deck = mountDeck(fixture);
  await deck.refresh();
  const row = findElement(deck.render().tree, (element) => element.props?.["data-owned-track-id"] === "waiting");
  assert.ok(row);
  const html = renderToStaticMarkup(row);
  assert.match(html, /waiting/);
  assert.doesNotMatch(html, /private-blob|Open music/);
});
