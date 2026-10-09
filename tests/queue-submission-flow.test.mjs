import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const helperPath = new URL("../src/lib/queue-submission-flow.ts", import.meta.url);
const helperModule = { exports: {} };
if (fs.existsSync(helperPath)) {
  const source = fs.readFileSync(helperPath, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: helperModule, exports: helperModule.exports, URLSearchParams });
}
const flow = helperModule.exports;

function loadTypeScript(entry, globals = {}, overrides = {}) {
  const loaded = new Map();
  const load = file => {
    if (loaded.has(file.href)) return loaded.get(file.href);
    const mod = { exports: {} };
    loaded.set(file.href, mod.exports);
    const source = fs.readFileSync(file, "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, URLSearchParams, ...globals, require: id => {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.startsWith("@/")) return load(new URL(`../src/${id.slice(2)}.${id.startsWith("@/components/") ? "tsx" : "ts"}`, import.meta.url));
      if (id.startsWith(".")) return load(new URL(`${id}.ts`, file));
      return require(id);
    } });
    return mod.exports;
  };
  return load(entry);
}

function snapshot(overrides = {}) {
  return {
    revision: 12,
    session: { sessionId: "show / 1", title: "Friday Radio", showDate: "2026-10-09", purpose: "live_broadcast" },
    status: { activeCount: 7, acceptedCount: 9, capacity: 44, isOpen: true, isFull: false },
    queue: [{ id: "confirmed&song", submittedArtistName: "The Whole Project", submittedSongTitle: "Saved Song", collaboratorNames: "Guest One, Guest Two", lane: "regular", sourceType: "soundcloud", durationLabel: "3:10", durationIsEstimate: false }],
    completed: [], nowPlaying: null, upNext: null,
    submitterStatus: { used: 6, limit: 7, remaining: 1, cooldownRemainingSeconds: 15, submitted: [] },
    ...overrides,
  };
}

test("public Deck URLs encode one explicit live session and an optional confirmed song", () => {
  assert.equal(typeof flow.publicQueueDeckHref, "function");
  assert.equal(flow.publicQueueDeckHref(snapshot().session), "/radio/deck?sessionId=show+%2F+1");
  assert.equal(flow.publicQueueDeckHref(snapshot().session, "confirmed&song"), "/radio/deck?sessionId=show+%2F+1&submitted=confirmed%26song");
  for (const purpose of ["rehearsal", "simulation", "internal_test", "unknown", undefined]) {
    assert.equal(flow.publicQueueDeckHref({ ...snapshot().session, purpose }, "confirmed&song"), null);
  }
  assert.equal(flow.publicQueueDeckHref(null), null);
});

test("saved acceptance uses persisted full credits and the server allowance instead of a three-song cap", async () => {
  assert.equal(typeof flow.confirmQueueSubmission, "function");
  const confirmed = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot(), wait: async () => {} });
  assert.equal(confirmed.receipt.artist, "The Whole Project feat. Guest One, Guest Two");
  assert.equal(confirmed.receipt.title, "Saved Song");
  assert.equal(confirmed.receipt.remaining, 1);
  assert.equal(confirmed.receipt.limit, 7);
  assert.equal(confirmed.receipt.trackId, "confirmed&song");
  assert.equal(confirmed.receipt.trackCode, "CONFIRME");
});

test("confirmation retries missing tracks and never accepts an unconfirmed final song", async () => {
  assert.equal(typeof flow.confirmQueueSubmission, "function");
  const reads = [], waits = [];
  const result = await flow.confirmQueueSubmission({ trackId: "failed-final", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => { reads.push(true); return snapshot({ queue: [], submitterStatus: { used: 7, limit: 7, remaining: 0, cooldownRemainingSeconds: 15, submitted: [] } }); }, wait: async ms => waits.push(ms) });
  assert.equal(result, null);
  assert.equal(reads.length, 5);
  assert.deepEqual(waits, [500, 500, 500, 500]);
});

test("session changes cannot confirm the old submission or produce a Deck handoff", async () => {
  assert.equal(typeof flow.confirmQueueSubmission, "function");
  const result = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "old-show", checkoutPending: false, readSnapshot: async () => snapshot(), wait: async () => {} });
  assert.equal(result, null);
});

test("owned saved credits can confirm a completed song without copying private fields", async () => {
  assert.equal(typeof flow.confirmQueueSubmission, "function");
  const result = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot({ queue: [], ownedTracks: [{ id: "confirmed&song", artist: "Saved Project", title: "Saved Version", collaboratorNames: "Full Guest Credit", note: "private host note", replacementRevision: 0, editUsed: false, canReplace: false, unavailableReason: null }] }), wait: async () => {} });
  assert.equal(result.receipt.artist, "Saved Project feat. Full Guest Credit");
  assert.equal(result.receipt.title, "Saved Version");
  assert.equal("note" in result.receipt, false);
});

test("the confirmed final free song opens Deck only after its brief completion callback", async () => {
  assert.equal(typeof flow.completeFreeQueueSubmission, "function");
  const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot({ submitterStatus: { used: 7, limit: 7, remaining: 0, cooldownRemainingSeconds: 15, submitted: [] } }), wait: async () => {} });
  const events = [];
  await flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: false, wait: async ms => events.push(["wait", ms]), onComplete: () => events.push(["complete"]), navigate: href => events.push(["navigate", href]) });
  assert.deepEqual(events, [["wait", 1000], ["complete"], ["navigate", "/radio/deck?sessionId=show+%2F+1&submitted=confirmed%26song"]]);
});

for (const scenario of [
  { name: "more songs remain", remaining: 1 },
  { name: "allowance is unknown", remaining: undefined },
  { name: "allowance is malformed", remaining: "0" },
  { name: "paid checkout is pending", remaining: 0, checkoutPending: true },
  { name: "the session is private", remaining: 0, purpose: "rehearsal" },
]) {
  test(`completion stays on intake when ${scenario.name}`, async () => {
    assert.equal(typeof flow.completeFreeQueueSubmission, "function");
    const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: scenario.checkoutPending ?? false, readSnapshot: async () => snapshot({ session: { ...snapshot().session, purpose: scenario.purpose ?? "live_broadcast" }, submitterStatus: { used: 7, limit: 7, remaining: scenario.remaining, cooldownRemainingSeconds: 15, submitted: [] } }), wait: async () => {} });
    const events = [];
    await flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: true, wait: async ms => events.push(["wait", ms]), onComplete: () => events.push(["complete"]), navigate: href => events.push(["navigate", href]) });
    assert.deepEqual(events, [["complete"]]);
    if (scenario.checkoutPending || scenario.purpose) assert.equal(accepted.receipt.deckHref, null);
  });
}

test("intake renders source input before artist details and leaves the providers disclosure collapsed", () => {
  const form = loadTypeScript(new URL("../src/components/RadioQueueForm.tsx", import.meta.url), {}, { "@vercel/blob/client": { upload: async () => { throw new Error("unexpected upload"); } } });
  const html = require("react-dom/server").renderToStaticMarkup(require("react").createElement(form.RadioQueueForm));
  assert.ok(html.indexOf('type="url"') < html.indexOf("Primary artist name"));
  const disclosure = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(disclosure, "supported providers should be inside a disclosure");
  assert.doesNotMatch(disclosure, /^<details[^>]*\bopen(?:\s|=|>)/);
  assert.match(disclosure, /Spotify/);
  assert.match(disclosure, /Bandcamp/);
});

function submissionForm({ postOk = true, confirmationMissing = false, choice = "free", purpose = "live_broadcast", remaining = 0 } = {}) {
  const events = [], receipts = [], requests = [], storage = new Map(), state = { publicQueue: [], fileInputKey: 0 };
  const session = { ...snapshot().session, purpose };
  let posted = false;
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === "POST" && url === "/api/queue") {
      posted = true;
      return { ok: postOk, json: async () => postOk ? { track: snapshot().queue[0], cooldownRemainingSeconds: 15 } : { error: "Submission rejected" } };
    }
    if (options.method === "POST") return { ok: false, json: async () => ({ error: "Checkout unavailable" }) };
    return { ok: true, json: async () => snapshot({ session, queue: posted && !confirmationMissing ? snapshot().queue : [], submitterStatus: { used: posted ? 7 : 6, limit: 7, remaining: posted ? remaining : 1, cooldownRemainingSeconds: 15, submitted: [] } }) };
  };
  const window = {
    location: { origin: "https://queue.example", assign: href => events.push(["navigate", href]) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    matchMedia: () => ({ matches: false }),
    crypto: require("node:crypto").webcrypto,
  };
  const globals = { window, URL, URLSearchParams, AbortSignal, fetch };
  const contracts = loadTypeScript(new URL("../src/lib/queue-types.ts", import.meta.url), globals);
  const realFlow = loadTypeScript(helperPath, globals);
  const realCheckout = loadTypeScript(new URL("../src/lib/queue-submission-checkout.ts", import.meta.url), globals);
  const setters = Object.fromEntries(["Status", "Session", "SubmitterStatus", "PublicQueue", "NowPlaying", "UpNext", "PlaybackTiming", "WheelTiming", "Error", "LegalError", "Submitting", "WarpData", "TransmissionState", "Artist", "TikTokHandle", "ContactEmail", "Title", "Link", "CollaboratorNames", "CreditDecision", "OriginalArtist", "Note", "File", "FileInputKey", "DetectedDuration", "ReadState", "UploadProgress", "RouteChoice", "Step"].map(name => {
    const field = `${name[0].toLowerCase()}${name.slice(1)}`;
    return [`set${name}`, value => { state[field] = typeof value === "function" ? value(state[field]) : value; }];
  }));
  const source = fs.readFileSync(new URL("../src/components/RadioQueueForm.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("RadioQueueForm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && ["publicTrackFromApi", "loadStatus", "findSubmittedTrack", "clearTrackDraftFields", "submit"].includes(node.name?.text)) declarations.push(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const cjsModule = { exports: {} };
  const code = ts.transpileModule(`${declarations.join("\n")}\nmodule.exports = { submit };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module: cjsModule, ...globals, ...contracts, ...realFlow, ...realCheckout, ...setters,
    session, sessionId: session.sessionId, snapshotEndpoint: "/api/queue", status: snapshot().status,
    step: "routing", routingLockRemaining: 0, finalSubmitIntent: { current: true }, submissionInFlight: { current: false }, acceptedLegal: true,
    mode: "link", link: "https://soundcloud.com/artist/song", artist: "Draft Artist", title: "Draft Song", collaboratorNames: "Draft Guest", creditDecision: "split", originalArtist: "Draft Artist feat. Draft Guest", tiktokHandle: "@saved", contactEmail: "private@example.test", submitterToken: "submitter", note: "private note", detectedDuration: null,
    selectedRoute: choice, publicQueue: [], nowPlaying: null, upNext: null,
    SESSION_SYNC_REQUIRED_MESSAGE: "Session sync required", SESSION_CHANGED_MESSAGE: "Session changed", QUEUE_CONFIRMATION_FAILED_MESSAGE: "Submission could not be confirmed in the queue.",
    setAuthoritativeCooldown: value => { state.cooldown = value; },
    wait: async ms => events.push(["wait", ms]),
    onAcceptedReceipt: receipt => { receipts.push(receipt); events.push(["accepted"]); },
    onSubmitted: (trackId, phase) => events.push(["submitted", trackId, phase]),
  });
  return { events, receipts, requests, storage, state, submit: () => cjsModule.exports.submit({ preventDefault() {} }) };
}

test("a rejected final POST keeps the draft and emits no acceptance or Deck navigation", async () => {
  const form = submissionForm({ postOk: false });
  await form.submit();
  assert.equal(form.receipts.length, 0);
  assert.deepEqual(form.events, []);
  assert.equal(form.state.error, "Submission rejected");
  assert.equal(form.state.title, undefined);
  assert.equal(form.requests.filter(request => request.options.method === "POST").length, 1);
});

test("a successful POST without persisted confirmation keeps the draft and cannot open Deck", async () => {
  const form = submissionForm({ confirmationMissing: true });
  await form.submit();
  assert.equal(form.receipts.length, 0);
  assert.equal(form.events.some(event => event[0] === "navigate"), false);
  assert.match(form.state.error, /could not be confirmed/);
  assert.equal(form.state.title, undefined);
});

test("the form confirms full credits then completes the final free song before same-tab Deck navigation", async () => {
  const form = submissionForm();
  await form.submit();
  assert.equal(form.receipts[0].artist, "The Whole Project feat. Guest One, Guest Two");
  assert.equal(form.receipts[0].title, "Saved Song");
  assert.equal(form.receipts[0].remaining, 0);
  assert.deepEqual(form.events, [["accepted"], ["submitted", "confirmed&song", "resolved"], ["wait", 1000], ["submitted", "confirmed&song", "complete"], ["navigate", "/radio/deck?sessionId=show+%2F+1&submitted=confirmed%26song"]]);
  assert.equal(form.storage.get("barcode-radio-submit-artist"), "Draft Artist");
  assert.equal(form.storage.get("barcode-radio-submit-tiktok"), "@saved");
  assert.equal(form.state.title, "");
});

for (const choice of ["priority", "signal_hold"]) {
  test(`${choice} final acceptance keeps failed checkout recovery on the queue with no Deck navigation`, async () => {
    const form = submissionForm({ choice });
    await form.submit();
    assert.equal(form.receipts[0].checkoutPending, true);
    assert.equal(form.receipts[0].deckHref, null);
    assert.equal(form.events.some(event => event[0] === "navigate"), false);
    assert.match(form.state.error, /song was accepted/);
    assert.match(form.state.error, /do not resubmit/);
    assert.equal(form.requests.filter(request => request.url === "/api/queue" && request.options.method === "POST").length, 1);
    assert.equal(form.requests.filter(request => request.url.endsWith("checkout")).length, 1);
  });
}

test("the submit button announces the final free slot from current allowance and preserves paid/private routing", () => {
  const source = fs.readFileSync(new URL("../src/components/RadioQueueForm.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("RadioQueueForm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  let button;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ["effectiveCooldown", "submissionLimitReached", "finalFreeSlot"].includes(node.name?.text)) declarations.push(`const ${node.getText(ast)};`);
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "button" && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "type" && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === "submit")) button = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(button, "intake must retain its explicit final submit action");
  const code = ts.transpileModule(`module.exports = () => { ${declarations.join("\n")} return ${button.getText(ast)}; };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const cases = [
    { remaining: 1, selectedRoute: "free", purpose: "live_broadcast", label: "Submit final song &amp; open Broadcast Deck" },
    { remaining: 2, selectedRoute: "free", purpose: "live_broadcast", label: "Submit Free" },
    { remaining: undefined, selectedRoute: "free", purpose: "live_broadcast", label: "Submit Free" },
    { remaining: 1, selectedRoute: "free", purpose: "rehearsal", label: "Submit Free" },
    { remaining: 1, selectedRoute: "priority", purpose: "live_broadcast", label: "Submit &amp; Continue to Payment" },
    { remaining: 1, selectedRoute: "signal_hold", purpose: "live_broadcast", label: "Submit &amp; Continue to Signal Hold Payment" },
  ];
  for (const fixture of cases) {
    const mod = { exports: {} };
    vm.runInNewContext(code, { module: mod, exports: mod.exports, require, ...flow, session: { ...snapshot().session, purpose: fixture.purpose }, submitterStatus: { used: 6, limit: 7, remaining: fixture.remaining }, selectedRoute: fixture.selectedRoute, cooldownRemaining: 0, submitting: false, readState: "idle", routingLockRemaining: 0, status: snapshot().status, finalSubmitIntent: { current: false } });
    const html = require("react-dom/server").renderToStaticMarkup(mod.exports());
    assert.ok(html.includes(fixture.label), `wrong final action for ${JSON.stringify(fixture)}`);
    assert.doesNotMatch(html, /disabled=/);
  }
});
