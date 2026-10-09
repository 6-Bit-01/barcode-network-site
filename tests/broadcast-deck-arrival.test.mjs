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

function omitStyledJsxMarker(context) {
  // Next compiles this style marker before rendering; this test loader uses plain JSX.
  const visit = (node) => ts.isJsxAttribute(node) && node.name.text === "jsx" ? undefined : ts.visitEachChild(node, visit, context);
  return (source) => ts.visitNode(source, visit);
}

function publicTrack(id, title = id) {
  return { id, submittedArtistName: "Primary Artist", submittedSongTitle: title, collaboratorNames: "Guest A, Guest B", sourceType: "soundcloud", publicSourceUrl: `https://soundcloud.com/artist/${id}`, lane: "free", durationLabel: "3:00", estimatedDurationSeconds: 180, durationIsEstimate: true };
}

function ownedTrack(id, title = id) {
  return { id, artist: "Primary Artist", title, collaboratorNames: "Guest A, Guest B", note: "private host note", replacementRevision: 0, editUsed: false, canReplace: false, unavailableReason: "locked" };
}

function showFixture() {
  const snapshot = { revision: 1, sessionActive: true, session: { sessionId: "show-1", title: "Friday Radio", showDate: "2026-10-09", purpose: "live_broadcast", status: "live", broadcastPhase: "broadcast_active", showStarted: true, wheelSpinsOwed: 0 }, status: { isOpen: true, activeCount: 3, acceptedCount: 5, estimatedRuntimeSeconds: 540, capacity: 44, isFull: false, pressure: "low" }, nowPlaying: publicTrack("playing"), upNext: publicTrack("next"), queue: [publicTrack("waiting")], completed: [publicTrack("finished"), publicTrack("skipped")], ownedTracks: ["playing", "next", "waiting", "finished", "skipped", "removed"].map((id) => ownedTrack(id)), playbackTiming: null, wheelTiming: null };
  const stats = { currentShow: { sessionId: "show-1", title: "Friday Radio", showDate: "2026-10-09", submittedTrackCount: 6, finishedTrackCount: 1, skippedTrackCount: 1, removedTrackCount: 1, trackRoster: ["playing", "next", "waiting", "finished", "skipped", "removed"].map((id) => ({ sessionId: "show-1", trackId: id, projectLabel: "Corrected Primary", title: id, collaboratorNames: "Corrected Guest A; Corrected Guest B", outcome: ["finished", "skipped", "removed"].includes(id) ? id : "active", sourceType: "soundcloud", publicSourceUrl: `https://soundcloud.com/artist/${id}` })), milestones: [{ eventId: "show-play", eventType: "track_play_started", occurredAt: "2026-10-09T21:00:00.000Z", sequence: 1, headline: "The host started this song", detail: "The current song moved into the broadcast.", track: { projectLabel: "Corrected Primary" } }] }, personalHistory: { handles: [] } };
  return { snapshot, stats };
}

function mountDeck({ snapshot, stats, search = "?sessionId=show-1&submitted=waiting", props = {}, token = "browser-token", storageUnavailable = false }) {
  const states = [];
  let cursor = 0;
  let effects = [];
  let poll;
  const requests = [];
  const storage = new Map(token ? [["barcode-radio-submitter-token", token]] : []);
  const window = { location: { origin: "https://barcode.test", search }, localStorage: { getItem: (key) => { if (storageUnavailable) throw new Error("Browser storage unavailable"); return storage.get(key) ?? null; }, setItem: (key, value) => storage.set(key, value) } };
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
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, transformers: { before: [omitStyledJsxMarker] } }).outputText;
    vm.runInNewContext(code, {
      module: cjsModule, exports: cjsModule.exports, URL, URLSearchParams, Date, window, document: { body: {} },
      fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => url.startsWith(props.statsEndpoint ?? "/api/queue/stats") ? stats : snapshot }; },
      require: (id) => {
        if (isDeck && id === "react") return hooks;
        if (isDeck && id === "react-dom") return { createPortal: (children) => children };
        if (id === "next/link") return { __esModule: true, default: ({ children, ...attributes }) => React.createElement("a", attributes, children) };
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
  return { render, requests, refresh: () => poll(), setStats: (value) => { stats = value; } };
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

function openOwnedSongs(deck) {
  const tab = findElement(deck.render().tree, (element) => element.props?.label === "Your songs");
  assert.ok(tab, "owned songs should be accessible from the secondary personal view");
  tab.props.onClick();
  return deck.render();
}

test("confirmed handoff keeps the shared show view and a secondary receipt without blocking orientation", async () => {
  const deck = mountDeck(showFixture());
  await deck.refresh();
  const { html, tree } = deck.render();
  assert.doesNotMatch(html, /role="dialog"/);
  assert.match(html, /Song accepted/);
  assert.match(html, /waiting/);
  assert.match(html, /aria-label="Live show activity log"/);
  assert.match(html, /The host started this song/);
  assert.doesNotMatch(html, /data-owned-track-id=/);
  assert.ok(html.indexOf('aria-label="Now Playing"') < html.indexOf("Song accepted"), "the live song should lead the receipt");
  assert.doesNotMatch(html, /private host note/);
  const orientationButton = findElement(tree, (element) => element.type === "button" && element.props.children === "How to use the Deck");
  assert.ok(orientationButton);
  orientationButton.props.onClick();
  assert.match(deck.render().html, /role="dialog"/);
});

test("passive direct arrival shows live songs and show movement without submission or browser identity", async () => {
  const fixture = showFixture();
  fixture.snapshot.ownedTracks = [];
  const deck = mountDeck({ ...fixture, search: "", token: "", storageUnavailable: true });
  await deck.refresh();
  const { html } = deck.render();
  assert.equal(deck.requests.length, 2);
  assert.deepEqual(deck.requests.map(({ url }) => url), ["/api/queue", "/api/queue/stats"]);
  assert.equal(deck.requests[1].options.headers, undefined);
  for (const text of ["Friday Radio", "Now Playing", "Next In Line", "Live show activity log", "The host started this song", "Show progress"]) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf('aria-label="Live show activity log"') < html.indexOf("Show progress"), "the shared feed should lead detailed show progress");
  assert.doesNotMatch(html, /Song accepted|Your songs|This browser|Manage My Songs|From this browser|Submit from this browser|role="dialog"/);
});

test("ordinary owned arrival also leads with the shared show and keeps personal tracks opt-in", async () => {
  const deck = mountDeck({ ...showFixture(), search: "" });
  await deck.refresh();
  const { html } = deck.render();
  assert.match(html, /aria-label="Live show activity log"/);
  assert.doesNotMatch(html, /Song accepted|data-owned-track-id=/);
  assert.match(html, /Your songs/);
  assert.match(openOwnedSongs(deck).html, /href="\/queue\/show-1#your-songs"/);
});

test("the optional personal view retains the existing browser project history", async () => {
  const fixture = showFixture();
  fixture.stats.personalHistory.handles = [{ tiktokHandle: "@browser", currentShow: null, submittedTrackCount: 9, projects: [{ projectKey: "saved project", projectLabel: "Saved Project", submittedTrackCount: 9 }] }];
  const deck = mountDeck(fixture);
  await deck.refresh();
  assert.doesNotMatch(deck.render().html, /@browser|Saved Project/);
  const { html } = openOwnedSongs(deck);
  assert.match(html, /@browser/);
  assert.match(html, /Saved Project/);
  assert.match(html, /submitted across shows/);
});

test("browser history without current owned songs remains optional without showing song management", async () => {
  const fixture = showFixture();
  fixture.snapshot.ownedTracks = [];
  fixture.stats.personalHistory.handles = [{ tiktokHandle: "@returning", currentShow: null, submittedTrackCount: 9, projects: [{ projectKey: "saved project", projectLabel: "Saved Project", submittedTrackCount: 9 }] }];
  const deck = mountDeck({ ...fixture, search: "" });
  await deck.refresh();
  const shared = deck.render().html;
  assert.match(shared, /aria-label="Live show activity log"/);
  assert.doesNotMatch(shared, /@returning|Saved Project|Manage My Songs|data-owned-track-id=/);
  const personal = openOwnedSongs(deck).html;
  assert.match(personal, /@returning/);
  assert.match(personal, /Saved Project/);
  assert.doesNotMatch(personal, /Your songs this show|Manage My Songs|data-owned-track-id=/);
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
  const { tree, html } = openOwnedSongs(deck);
  const rows = ["playing", "next", "waiting", "finished", "skipped", "removed"].map((id) => findElement(tree, (element) => element.props?.["data-owned-track-id"] === id));
  assert.ok(rows.every(Boolean), "all owned current-show tracks should appear in the personal view");
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
  const { tree } = openOwnedSongs(deck);
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
  const row = findElement(openOwnedSongs(deck).tree, (element) => element.props?.["data-owned-track-id"] === "waiting");
  assert.ok(row);
  const html = renderToStaticMarkup(row);
  assert.match(html, /waiting/);
  assert.doesNotMatch(html, /private-blob|Open music/);
});
