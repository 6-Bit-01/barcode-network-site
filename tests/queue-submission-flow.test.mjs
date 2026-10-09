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
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, transformers: { before: [context => {
      // Next removes this compiler marker before a plain React render.
      const visit = node => {
        if (ts.isJsxOpeningElement(node) && node.tagName.getText() === "style") {
          const attributes = node.attributes.properties.filter(attribute => !(ts.isJsxAttribute(attribute) && attribute.name.getText() === "jsx"));
          return ts.factory.updateJsxOpeningElement(node, node.tagName, node.typeArguments, ts.factory.createJsxAttributes(attributes));
        }
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    }] } }).outputText;
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

test("the confirmed final free song opens Deck only after the five-second completion callback", async () => {
  assert.equal(typeof flow.completeFreeQueueSubmission, "function");
  const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot({ submitterStatus: { used: 7, limit: 7, remaining: 0, cooldownRemainingSeconds: 15, submitted: [] } }), wait: async () => {} });
  const events = [];
  await flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: false, wait: async ms => events.push(["wait", ms]), onComplete: () => events.push(["complete"]), navigate: href => events.push(["navigate", href]) });
  assert.deepEqual(events, [["wait", 1200], ["wait", 1400], ["wait", 1500], ["wait", 900], ["complete"], ["navigate", "/radio/deck?sessionId=show+%2F+1&submitted=confirmed%26song"]]);
});

test("accepted-free choreography reveals artwork, assembles metadata, routes, and lands over five seconds", async () => {
  const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot(), wait: async () => {} });
  const events = [];
  await flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: false, onPhase: phase => events.push(["phase", phase]), wait: async ms => events.push(["wait", ms]), onComplete: () => events.push(["complete"]), navigate: () => events.push(["navigate"]) });
  assert.deepEqual(events, [["phase", "artwork"], ["wait", 1200], ["phase", "metadata"], ["wait", 1400], ["phase", "routing"], ["wait", 1500], ["phase", "confirmed"], ["wait", 900], ["complete"]]);
});

test("reduced motion skips the five-second choreography and completes the saved receipt immediately", async () => {
  const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot(), wait: async () => {} });
  const events = [];
  await flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: true, onPhase: phase => events.push(["phase", phase]), wait: async ms => events.push(["wait", ms]), onComplete: () => events.push(["complete"]), navigate: () => events.push(["navigate"]) });
  assert.deepEqual(events, [["phase", "confirmed"], ["complete"]]);
});

test("cancelling during an artwork wait stops later phases, completion, and navigation", async () => {
  const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot({ submitterStatus: { used: 7, limit: 7, remaining: 0, cooldownRemainingSeconds: 15, submitted: [] } }), wait: async () => {} });
  const events = [];
  let active = true, resume;
  const completion = flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: false, isActive: () => active, onPhase: phase => events.push(["phase", phase]), wait: async ms => { events.push(["wait", ms]); if (active) await new Promise(resolve => { resume = resolve; }); }, onComplete: () => events.push(["complete"]), navigate: () => events.push(["navigate"]) });
  active = false;
  resume();
  const completed = await completion;
  assert.equal(completed, false);
  assert.deepEqual(events, [["phase", "artwork"], ["wait", 1200]]);
});

test("a normal completion may close intake and still perform its immediate confirmed Deck handoff", async () => {
  const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot({ submitterStatus: { used: 7, limit: 7, remaining: 0, cooldownRemainingSeconds: 15, submitted: [] } }), wait: async () => {} });
  let active = true;
  const events = [];
  await flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: true, isActive: () => active, wait: async () => {}, onComplete: () => { active = false; events.push(["complete"]); }, navigate: href => events.push(["navigate", href]) });
  assert.deepEqual(events, [["complete"], ["navigate", "/radio/deck?sessionId=show+%2F+1&submitted=confirmed%26song"]]);
});

test("cancellation during the accepted landing is checked before completion and navigation", async () => {
  const accepted = await flow.confirmQueueSubmission({ trackId: "confirmed&song", sessionId: "show / 1", checkoutPending: false, readSnapshot: async () => snapshot({ submitterStatus: { used: 7, limit: 7, remaining: 0, cooldownRemainingSeconds: 15, submitted: [] } }), wait: async () => {} });
  const events = [];
  let active = true, resume, entered;
  const landing = new Promise(resolve => { entered = resolve; });
  const completion = flow.completeFreeQueueSubmission(accepted.receipt, { reducedMotion: false, isActive: () => active, onPhase: phase => events.push(["phase", phase]), wait: async ms => { if (ms === 900) { entered(); await new Promise(resolve => { resume = resolve; }); } }, onComplete: () => events.push(["complete"]), navigate: () => events.push(["navigate"]) });
  await landing;
  active = false;
  resume();
  await completion;
  assert.deepEqual(events, [["phase", "artwork"], ["phase", "metadata"], ["phase", "routing"], ["phase", "confirmed"]]);
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

function submissionForm({ postOk = true, confirmationMissing = false, choice = "free", purpose = "live_broadcast", remaining = 0, reducedMotion = false, confirmedTrack = snapshot().queue[0], confirmedLocation = "queue", waitImplementation, completeClosesIntake = false, selectedArtistId } = {}) {
  const events = [], receipts = [], requests = [], phases = [], storage = new Map(), state = { publicQueue: [], fileInputKey: 0 };
  const session = { ...snapshot().session, purpose };
  const intakeMountedRef = { current: true };
  let posted = false;
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (options.method === "POST" && url === "/api/queue") {
      posted = true;
      return { ok: postOk, json: async () => postOk ? { track: snapshot().queue[0], cooldownRemainingSeconds: 15 } : { error: "Submission rejected" } };
    }
    if (options.method === "POST") return { ok: false, json: async () => ({ error: "Checkout unavailable" }) };
    return { ok: true, json: async () => snapshot({ session, queue: posted && !confirmationMissing && confirmedLocation === "queue" ? [confirmedTrack] : [], completed: posted && !confirmationMissing && confirmedLocation === "completed" ? [confirmedTrack] : [], submitterStatus: { used: posted ? 7 : 6, limit: 7, remaining: posted ? remaining : 1, cooldownRemainingSeconds: 15, submitted: [] } }) };
  };
  const window = {
    location: { origin: "https://queue.example", assign: href => events.push(["navigate", href]) },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    matchMedia: () => ({ matches: reducedMotion }),
    crypto: require("node:crypto").webcrypto,
  };
  const globals = { window, URL, URLSearchParams, AbortSignal, fetch };
  const contracts = loadTypeScript(new URL("../src/lib/queue-types.ts", import.meta.url), globals);
  const realFlow = loadTypeScript(helperPath, globals);
  const realCheckout = loadTypeScript(new URL("../src/lib/queue-submission-checkout.ts", import.meta.url), globals);
  const setters = Object.fromEntries(["Status", "Session", "SubmitterStatus", "PublicQueue", "NowPlaying", "UpNext", "PlaybackTiming", "WheelTiming", "Error", "LegalError", "Submitting", "WarpData", "TransmissionState", "Artist", "TikTokHandle", "ContactEmail", "Title", "Link", "CollaboratorNames", "CreditDecision", "OriginalArtist", "Note", "File", "FileInputKey", "DetectedDuration", "ReadState", "UploadProgress", "RouteChoice", "Step"].map(name => {
    const field = `${name[0].toLowerCase()}${name.slice(1)}`;
    return [`set${name}`, value => { state[field] = typeof value === "function" ? value(state[field]) : value; if (name === "TransmissionState") phases.push(state[field]); }];
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
    selectedArtistId, selectedRoute: choice, publicQueue: [], nowPlaying: null, upNext: null, intakeMountedRef,
    SESSION_SYNC_REQUIRED_MESSAGE: "Session sync required", SESSION_CHANGED_MESSAGE: "Session changed", QUEUE_CONFIRMATION_FAILED_MESSAGE: "Submission could not be confirmed in the queue.",
    setAuthoritativeCooldown: value => { state.cooldown = value; },
    wait: async ms => { events.push(["wait", ms]); await waitImplementation?.(ms); },
    onAcceptedReceipt: receipt => { receipts.push(receipt); events.push(["accepted"]); },
    onSubmitted: (trackId, phase) => { events.push(["submitted", trackId, phase]); if (phase === "complete" && completeClosesIntake) intakeMountedRef.current = false; },
  });
  return { events, receipts, requests, phases, storage, state, abandon: () => { intakeMountedRef.current = false; }, submit: () => cjsModule.exports.submit({ preventDefault() {} }) };
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

test("intake sends only the optional approved Artist choice while preserving the guest body", async () => {
  for (const selectedArtistId of [undefined, "", "11111111-1111-4111-8111-111111111111"]) {
    const form = submissionForm({ selectedArtistId }); await form.submit();
    const body = JSON.parse(form.requests.find(request => request.options.method === "POST").options.body);
    assert.equal(body.artistId, selectedArtistId);
    for (const key of ["memberId", "submissionMemberId", "approvedArtistId", "approvedArtistLinkRevision"]) assert.equal(key in body, false);
    assert.equal(form.receipts.length, 1);
  }
});

test("the form confirms full credits then completes the final free song before same-tab Deck navigation", async () => {
  const form = submissionForm();
  await form.submit();
  assert.equal(form.receipts[0].artist, "The Whole Project feat. Guest One, Guest Two");
  assert.equal(form.receipts[0].title, "Saved Song");
  assert.equal(form.receipts[0].remaining, 0);
  assert.deepEqual(form.phases, ["artwork", "metadata", "routing", "confirmed", "idle"]);
  assert.deepEqual(form.events, [["accepted"], ["submitted", "confirmed&song", "resolved"], ["wait", 1200], ["wait", 1400], ["wait", 1500], ["wait", 900], ["submitted", "confirmed&song", "complete"], ["navigate", "/radio/deck?sessionId=show+%2F+1&submitted=confirmed%26song"]]);
  assert.equal(form.storage.get("barcode-radio-submit-artist"), "Draft Artist");
  assert.equal(form.storage.get("barcode-radio-submit-tiktok"), "@saved");
  assert.equal(form.state.title, "");
});

test("the form builds its five-second artwork and metadata view from the persisted song", async () => {
  const form = submissionForm({ confirmedTrack: { ...snapshot().queue[0], sourceArtworkUrl: "https://images.example/saved-cover.jpg", sourceType: "spotify", durationLabel: "4:02", tiktokHandle: "@confirmed" } });
  await form.submit();
  assert.equal(form.state.warpData.artworkUrl, "https://images.example/saved-cover.jpg");
  assert.equal(form.state.warpData.artist, "The Whole Project feat. Guest One, Guest Two");
  assert.equal(form.state.warpData.title, "Saved Song");
  assert.equal(form.state.warpData.sourceType, "SPOTIFY");
  assert.equal(form.state.warpData.durationLabel, "4:02");
  assert.equal(form.state.warpData.tiktokHandle, "@confirmed");
});

test("the actual reduced-motion form completes acceptance without a timed artwork sequence", async () => {
  const form = submissionForm({ reducedMotion: true, remaining: 1 });
  await form.submit();
  assert.deepEqual(form.phases, ["confirmed", "idle"]);
  assert.deepEqual(form.events, [["accepted"], ["submitted", "confirmed&song", "resolved"], ["submitted", "confirmed&song", "complete"]]);
});

test("abandoning the actual form during a deferred phase keeps acceptance but stops late completion and navigation", async () => {
  let resume, entered;
  const enteredWait = new Promise(resolve => { entered = resolve; });
  const form = submissionForm({ waitImplementation: async () => { entered(); if (resume === undefined) await new Promise(resolve => { resume = resolve; }); } });
  const submission = form.submit();
  await enteredWait;
  form.abandon();
  resume();
  await submission;
  assert.equal(form.receipts.length, 1);
  assert.deepEqual(form.phases, ["artwork"]);
  assert.deepEqual(form.events, [["accepted"], ["submitted", "confirmed&song", "resolved"], ["wait", 1200]]);
  assert.equal(form.requests.filter(request => request.url === "/api/queue" && request.options.method === "POST").length, 1);
});

test("the actual final free form can close normally before its immediate Deck navigation", async () => {
  const form = submissionForm({ completeClosesIntake: true });
  await form.submit();
  assert.deepEqual(form.events.slice(-2), [["submitted", "confirmed&song", "complete"], ["navigate", "/radio/deck?sessionId=show+%2F+1&submitted=confirmed%26song"]]);
});

test("the form mount effect reactivates after StrictMode cleanup and cancels on real unmount", () => {
  const source = fs.readFileSync(new URL("../src/components/RadioQueueForm.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("RadioQueueForm.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let lifecycle;
  const referencesMountedRef = node => {
    if (ts.isIdentifier(node) && node.text === "intakeMountedRef") return true;
    return ts.forEachChild(node, referencesMountedRef) === true;
  };
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect" && node.arguments[0] && referencesMountedRef(node.arguments[0])) lifecycle = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(lifecycle, "form lifecycle must cancel its deferred completion");
  const mod = { exports: {} }, intakeMountedRef = { current: false };
  const code = ts.transpileModule(`module.exports = (${lifecycle.getText(ast)});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, intakeMountedRef });
  let cleanup = mod.exports();
  assert.equal(intakeMountedRef.current, true);
  cleanup();
  assert.equal(intakeMountedRef.current, false);
  cleanup = mod.exports();
  assert.equal(intakeMountedRef.current, true);
  cleanup();
  assert.equal(intakeMountedRef.current, false);
});

test("metadata confirmed only in the broadcast record does not invent a played outcome", async () => {
  const form = submissionForm({ confirmedLocation: "completed", confirmedTrack: { ...snapshot().queue[0], sourceArtworkUrl: "https://images.example/record-cover.jpg" } });
  await form.submit();
  assert.equal(form.state.warpData.lane, "RECORDED");
  assert.equal(form.state.warpData.artworkUrl, "https://images.example/record-cover.jpg");
});

for (const choice of ["priority", "signal_hold"]) {
  test(`${choice} final acceptance keeps failed checkout recovery on the queue with no Deck navigation`, async () => {
    const form = submissionForm({ choice });
    await form.submit();
    assert.equal(form.receipts[0].checkoutPending, true);
    assert.equal(form.receipts[0].deckHref, null);
    assert.equal(form.events.some(event => event[0] === "navigate"), false);
    assert.equal(form.events.some(event => event[0] === "wait"), false);
    assert.deepEqual(form.phases, [choice === "priority" ? "priority_requested" : "signal_hold_requested", "idle"]);
    assert.match(form.state.error, /song was accepted/);
    assert.match(form.state.error, /do not resubmit/);
    assert.equal(form.requests.filter(request => request.url === "/api/queue" && request.options.method === "POST").length, 1);
    assert.equal(form.requests.filter(request => request.url.endsWith("checkout")).length, 1);
  });
}

test("the artwork sequence keeps the complete saved song credits and one intact cover in every phase", () => {
  const form = loadTypeScript(new URL("../src/components/RadioQueueForm.tsx", import.meta.url), {}, { "@vercel/blob/client": { upload: async () => { throw new Error("unexpected upload"); } } });
  assert.equal(typeof form.QueueIntakeSequence, "function");
  const data = { artist: "The Whole Project feat. Guest One, Guest Two", title: "Saved Song", sessionTitle: "Friday Radio", sessionDate: "2026-10-09", sourceType: "SPOTIFY", durationLabel: "4:02", lane: "FREE_QUEUE", tiktokHandle: "@confirmed", artworkUrl: "https://images.example/saved-cover.jpg" };
  for (const phase of ["artwork", "metadata", "routing", "confirmed"]) {
    const html = require("react-dom/server").renderToStaticMarkup(require("react").createElement(form.QueueIntakeSequence, { state: phase, data }));
    assert.match(html, new RegExp(`data-intake-phase="${phase}"`));
    assert.ok(html.includes(data.artist));
    assert.ok(html.includes(data.title));
    assert.equal((html.match(/<img /g) ?? []).length, 1);
    assert.match(html, /src="https:\/\/images.example\/saved-cover.jpg"/);
    assert.match(html, /SPOTIFY/);
    assert.match(html, /4:02/);
    assert.ok(html.includes('class="intake-cover-capture"'), "the intact artwork should carry its capture pass");
    const receiptStatus = html.match(/<span class="intake-saved-label">([^<]+)<\/span>/)?.[1];
    assert.equal(receiptStatus, phase === "confirmed" ? "Accepted" : "Song saved");
  }
  const absent = require("react-dom/server").renderToStaticMarkup(require("react").createElement(form.QueueIntakeSequence, { state: "artwork", data: { ...data, artworkUrl: null } }));
  assert.ok(absent.includes("Song received"));
  assert.equal(absent.includes("Artwork received"), false);
});

test("missing and failed artwork use a clean fallback while keeping saved credits readable", () => {
  let failedArtwork = null;
  const react = { ...require("react"), useState: () => [failedArtwork, value => { failedArtwork = value; }] };
  const form = loadTypeScript(new URL("../src/components/RadioQueueForm.tsx", import.meta.url), {}, { react, "@vercel/blob/client": { upload: async () => { throw new Error("unexpected upload"); } } });
  assert.equal(typeof form.QueueIntakeArtwork, "function");
  const render = data => form.QueueIntakeArtwork({ data });
  const absent = require("react-dom/server").renderToStaticMarkup(render({ artist: "Saved Artist", title: "Saved Song", artworkUrl: null }));
  assert.doesNotMatch(absent, /<img /);
  assert.match(absent, /Artwork unavailable/);
  const image = render({ artist: "Saved Artist", title: "Saved Song", artworkUrl: "https://images.example/broken.jpg" });
  image.props.onError();
  const failed = require("react-dom/server").renderToStaticMarkup(render({ artist: "Saved Artist", title: "Saved Song", artworkUrl: "https://images.example/broken.jpg" }));
  assert.doesNotMatch(failed, /<img /);
  assert.match(failed, /Artwork unavailable/);
  assert.match(failed, /Saved Artist/);
});

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
