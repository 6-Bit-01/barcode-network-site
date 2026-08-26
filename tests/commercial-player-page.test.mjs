import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = readFileSync(
  path.join(projectRoot, "tools/barcode-audio-bridge/CommercialPlayerPage.cs"),
  "utf8",
);
const librarySource = readFileSync(
  path.join(projectRoot, "tools/barcode-audio-bridge/CommercialBreakLibrary.cs"),
  "utf8",
);
const studioRouteSource = readFileSync(
  path.join(projectRoot, "src/app/overlay/commercials/route.ts"),
  "utf8",
);
const localServerSource = readFileSync(
  path.join(projectRoot, "tools/barcode-audio-bridge/LocalSignalServer.cs"),
  "utf8",
);
const playerScript = pageSource.match(/  <script>\n([\s\S]*?)\n  <\/script>/)?.[1];

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.paused = true;
    this.offsetWidth = 0;
    this.dataset = {};
    this.events = new Map();
    this.styleValues = new Map();
    this.style = {
      getPropertyValue: (name) => this.styleValues.get(name) ?? "",
      setProperty: (name, value) => this.styleValues.set(name, value),
      removeProperty: (name) => this.styleValues.delete(name),
    };
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      contains: (name) => this.classes.has(name),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force) => {
        if (force === true || (force === undefined && !this.classes.has(name))) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.events.get(type) ?? [];
    listeners.push({ listener, once: options.once === true });
    this.events.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.events.set(type, (this.events.get(type) ?? []).filter((entry) => entry.listener !== listener));
  }

  dispatch(type) {
    for (const entry of [...(this.events.get(type) ?? [])]) {
      if (entry.once) this.removeEventListener(type, entry.listener);
      entry.listener({ type, target: this });
    }
  }

  click() { this.dispatch("click"); }
  focus() {}
  load() {}
  pause() { this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  removeAttribute(name) { delete this[name]; }
}

const flushTasks = async (count = 8) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test("TV frame crops its embedded border while every commercial is centered and automatically fitted", () => {
  assert.match(pageSource, /#background-video\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?transform:\s*scale\(1\.18\);[\s\S]*?transform-origin:\s*left top;/);
  assert.match(pageSource, /#tv-overlay-video\s*\{[\s\S]*?object-fit:\s*cover;/);
  assert.match(pageSource, /#tv-stage\s*\{[\s\S]*?top:\s*30\.6%;[\s\S]*?width:\s*92%;[\s\S]*?aspect-ratio:\s*719 \/ 435;[\s\S]*?overflow:\s*hidden;[\s\S]*?z-index:\s*2;/);
  assert.match(pageSource, /#tv-source\s*\{[\s\S]*?left:\s*-2\.6738%;[\s\S]*?top:\s*-2\.7624%;[\s\S]*?width:\s*106\.9519%;[\s\S]*?height:\s*110\.4972%;/);
  assert.match(pageSource, /#video-window\s*\{[\s\S]*?left:\s*5%;[\s\S]*?top:\s*8\.5%;[\s\S]*?width:\s*90%;[\s\S]*?height:\s*77%;[\s\S]*?overflow:\s*hidden;[\s\S]*?z-index:\s*1;/);
  assert.match(pageSource, /#player\s*\{[\s\S]*?left:\s*50%;[\s\S]*?top:\s*50%;[\s\S]*?width:\s*var\(--player-fit-width, 100\.8%\);[\s\S]*?height:\s*var\(--player-fit-height, 100\.8%\);[\s\S]*?object-fit:\s*fill;[\s\S]*?object-position:\s*center center;[\s\S]*?transform:\s*translate\(-50%, -50%\);[\s\S]*?z-index:\s*1;/);
  assert.match(pageSource, /#tv-overlay-video\s*\{[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?object-fit:\s*cover;[\s\S]*?z-index:\s*2;[\s\S]*?-webkit-mask:\s*url\(#tv-bezel-mask\) center \/ 100% 100% no-repeat;/);
  assert.match(pageSource, /<mask id="tv-bezel-mask"[\s\S]*?<path fill="white" fill-rule="evenodd"/);
  assert.doesNotMatch(pageSource, /clip-path:\s*inset|#tv-stage::before|#tv-stage::after|\.frame-patch|\.side-strip/);
  assert.doesNotMatch(pageSource, /#tv-stage::before|#tv-stage::after/);
  assert.match(pageSource, /<div id="tv-stage" hidden>[\s\S]*?<div id="tv-source">[\s\S]*?<div id="video-window">[\s\S]*?<video id="player"[\s\S]*?<img id="corner-logo-a"[\s\S]*?<img id="corner-logo-b"[\s\S]*?<video id="tv-overlay-video"/);
  assert.doesNotMatch(playerScript, /player\.controls/);
  assert.doesNotMatch(pageSource, /body\.debug #tv-stage|body\.debug #video-window/);
});

test("TV motion is half-speed while frequent lamp pulses add no second video decoder", () => {
  assert.match(playerScript, /startVisualVideo\(tvOverlayVideo, state\.tvOverlayUrl, 'TV overlay', token, \.5\)/);
  assert.match(playerScript, /element\.defaultPlaybackRate = playbackRate;[\s\S]*?element\.playbackRate = playbackRate;/);
  assert.match(pageSource, /id="tv-light-pulses"[\s\S]*?id="tv-light-yellow"[\s\S]*?id="tv-light-red"/);
  assert.match(pageSource, /animation:\s*tv-light-yellow-pulse 1\.7s/);
  assert.match(pageSource, /animation:\s*tv-light-red-pulse 1\.35s/);
  assert.doesNotMatch(pageSource, /<video id="tv-light/);
});

test("idle shows only the animated background and a CSS CRT power-on precedes the first clip", () => {
  assert.match(librarySource, /PlayerUrl = "https:\/\/www\.barcode-network\.com\/overlay\/commercials\?studioSource=v1"/);
  assert.match(pageSource, /body::after\s*\{[\s\S]*?width:\s*2px;[\s\S]*?height:\s*2px;[\s\S]*?animation:\s*commercial-source-capture-heartbeat 1s steps\(2, end\) infinite !important;/);
  assert.match(pageSource, /@keyframes commercial-source-capture-heartbeat/);
  assert.match(playerScript, /const idleBackgroundUrl = '\/v1\/commercials\/idle-background'/);
  assert.match(playerScript, /async function showIdleBackground\(\)[\s\S]*?tvStage\.hidden = true;[\s\S]*?startVisualVideo\(backgroundVideo, idleBackgroundUrl, 'idle background', token\)/);
  assert.match(pageSource, /id="tv-stage" hidden/);
  assert.match(pageSource, /id="crt-power-on"/);
  assert.match(pageSource, /@keyframes crt-power-on/);
  assert.match(pageSource, /animation:\s*crt-power-on 880ms/);
  assert.match(playerScript, /tvStage\.hidden = false;[\s\S]*?await runCrtPowerOn\(token\);[\s\S]*?post\(`\/v1\/commercials\/clip-started/);
  assert.doesNotMatch(pageSource, /<video id="crt-power-on/);
  assert.match(localServerSource, /path == "\/v1\/commercials\/idle-background"[\s\S]*?_commercials\.TryGetIdleBackground/);
});

test("corner logos pre-roll without ever rendering two marks together", () => {
  assert.match(pageSource, /transition:\s*opacity var\(--corner-logo-fade-duration, 2400ms\) ease;/);
  assert.match(pageSource, /\.corner-logo\[data-variant="2"\]\s*\{[\s\S]*?width:\s*15\.3%;[\s\S]*?height:\s*13\.6%;/);
  assert.match(pageSource, /id="corner-logo-a" class="corner-logo"[\s\S]*?id="corner-logo-b" class="corner-logo"/);
  assert.match(playerScript, /return Math\.min\(2600, Math\.max\(800, totalMs \* \.14\)\)/);
  assert.match(playerScript, /const leadMs = cornerLogoFadeMs\(nextItem\) \+ 350/);
  assert.match(playerScript, /activeCornerLogo\?\.dataset\.identity === identity[\s\S]*?primedCornerLogo = activeCornerLogo/);
  assert.match(playerScript, /primeCornerLogo\(nextItem, token, false\)[\s\S]*?if \(item\?\.cornerLogoUrl\) return/);
  assert.match(playerScript, /primeCornerLogo\(nextItem, token, true\)/);
  assert.match(playerScript, /activateCornerLogoForItem\(item, token\)[\s\S]*?if \(candidate !== element\) clearCornerLogoElement\(candidate\)[\s\S]*?showCornerLogoInstant\(element, item\)/);
  assert.match(playerScript, /element\.dataset\.variant = String\(item\.cornerLogoVariant \|\| 1\)/);
});

test("automatic fit uses metadata, bounded distortion, centered cover, and sub-one-percent bleed", () => {
  assert.match(playerScript, /const automaticFitMaximumDistortion = 1\.085/);
  assert.match(playerScript, /const automaticFitSafetyBleed = 1\.008/);
  assert.match(playerScript, /function calculateAutomaticPlayerFit\(sourceWidth, sourceHeight, apertureWidth, apertureHeight\)/);
  assert.match(playerScript, /const minimumRenderedAspect = sourceAspect \/ automaticFitMaximumDistortion/);
  assert.match(playerScript, /const maximumRenderedAspect = sourceAspect \* automaticFitMaximumDistortion/);
  assert.match(playerScript, /Math\.min\(maximumRenderedAspect, Math\.max\(minimumRenderedAspect, apertureAspect\)\)/);
  assert.match(playerScript, /player\.dataset\.fit = 'automatic'/);
  assert.match(playerScript, /--player-fit-width/);
  assert.match(playerScript, /--player-fit-height/);
  assert.doesNotMatch(playerScript, /softFitNames|eversnow|crackedencounters/i);
});

test("fit math maximizes visible content and corner-logo handoffs never overlap", async () => {
  assert.ok(playerScript, "commercial player script must remain extractable from the local page");
  const elements = new Map([
    ["stage", new FakeElement("stage")],
    ["background-video", new FakeElement("background-video")],
    ["tv-stage", new FakeElement("tv-stage")],
    ["tv-overlay-video", new FakeElement("tv-overlay-video")],
    ["player", new FakeElement("player")],
    ["video-window", new FakeElement("video-window")],
    ["crt-power-on", new FakeElement("crt-power-on")],
    ["corner-logo-a", new FakeElement("corner-logo-a")],
    ["corner-logo-b", new FakeElement("corner-logo-b")],
    ["logo", new FakeElement("logo")],
    ["audio-gate", new FakeElement("audio-gate")],
    ["status", new FakeElement("status")],
  ]);
  const videoWindow = elements.get("video-window");
  videoWindow.clientWidth = 1870;
  videoWindow.clientHeight = 1000;
  const player = elements.get("player");
  player.videoWidth = 1920;
  player.videoHeight = 1080;
  const scheduled = new Map();
  let nextTimer = 1;
  const context = vm.createContext({
    URLSearchParams,
    DOMException,
    Promise,
    clearTimeout: (id) => scheduled.delete(id),
    console,
    document: {
      body: new FakeElement("body"),
      getElementById: (id) => elements.get(id),
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "idle", generation: 0, items: [], message: "Ready" }),
    }),
    location: { search: "" },
    navigator: { userActivation: { hasBeenActive: true } },
    setInterval: () => 0,
    setTimeout: (callback, delay) => {
      const id = nextTimer;
      nextTimer += 1;
      scheduled.set(id, { callback, delay });
      return id;
    },
  });

  new vm.Script(playerScript, { filename: "CommercialPlayerPage.fit.js" }).runInContext(context);
  await flushTasks();

  const nearFit = vm.runInContext("calculateAutomaticPlayerFit(1920, 1080, 1870, 1000)", context);
  assert.ok(Math.abs(nearFit.widthPercent - 100.8) < 0.0001);
  assert.ok(Math.abs(nearFit.heightPercent - 100.8) < 0.0001);

  const narrowFit = vm.runInContext("calculateAutomaticPlayerFit(1440, 1080, 1870, 1000)", context);
  assert.ok(Math.abs(narrowFit.widthPercent - 100.8) < 0.0001);
  assert.ok(narrowFit.heightPercent > 100.8, "narrow media is centered and cropped only on the unavoidable axis");

  const wideFit = vm.runInContext("calculateAutomaticPlayerFit(2560, 1080, 1870, 1000)", context);
  assert.ok(wideFit.widthPercent > 100.8, "wide media is centered and cropped only on the unavoidable axis");
  assert.ok(Math.abs(wideFit.heightPercent - 100.8) < 0.0001);

  vm.runInContext("applyAutomaticPlayerFitFromMetadata(0)", context);
  assert.equal(player.dataset.fit, "automatic");
  assert.equal(player.style.getPropertyValue("--player-fit-width"), "100.8000%");
  assert.equal(player.style.getPropertyValue("--player-fit-height"), "100.8000%");

  context.firstMarked = { cornerLogoUrl: "/corner-1", cornerLogoVariant: 1, durationSeconds: 30 };
  context.sameRunMarked = { cornerLogoUrl: "/corner-1", cornerLogoVariant: 1, durationSeconds: 30 };
  context.nextRunMarked = { cornerLogoUrl: "/corner-2", cornerLogoVariant: 2, durationSeconds: 30 };
  vm.runInContext("primeCornerLogo(firstMarked, 0, false); activateCornerLogoForItem(firstMarked, 0)", context);
  const firstElement = elements.get("corner-logo-a");
  assert.equal(firstElement.classList.contains("visible"), true, "the first marked sponsor starts fully covered");

  vm.runInContext("primeCornerLogo(sameRunMarked, 0, false)", context);
  const secondElement = elements.get("corner-logo-b");
  assert.equal(firstElement.classList.contains("visible"), true, "the current mark stays solid until its sponsor ends");
  assert.equal(firstElement.hidden, false);
  assert.equal(secondElement.classList.contains("visible"), false, "a consecutive marked clip does not activate the second layer");
  assert.equal(secondElement.hidden, true);

  vm.runInContext("activateCornerLogoForItem(sameRunMarked, 0)", context);
  assert.equal(firstElement.classList.contains("visible"), true, "one mark remains solid across the marked-run boundary");
  assert.equal(firstElement.hidden, false);
  assert.equal(secondElement.classList.contains("visible"), false);
  assert.equal(secondElement.hidden, true, "the unused layer stays completely off-screen for the whole run");

  vm.runInContext("activateCornerLogoForItem({}, 0)", context);
  assert.equal(firstElement.classList.contains("visible"), false, "the active mark begins its post-roll only after the marked run ends");
  assert.equal(firstElement.hidden, false, "a lone outgoing mark may fade when no replacement is visible");

  vm.runInContext("primeCornerLogo(nextRunMarked, 0, true)", context);
  assert.equal(firstElement.hidden, true, "starting a later pre-roll immediately removes any unfinished outgoing fade");
  assert.equal(secondElement.hidden, false);
  assert.equal(secondElement.classList.contains("visible"), true, "the separated next run uses the alternate mark");
});

test("BCN and BLVCKL!GHT logos remain enlarged while the cropped TV fills more of the canvas", () => {
  assert.match(pageSource, /#logo\s*\{[\s\S]*?top:\s*5\.4%;[\s\S]*?width:\s*96%;[\s\S]*?height:\s*26\.5%;/);
  assert.match(pageSource, /#logo\[data-brand="bcn"\], #logo\[data-brand="bl"\]\s*\{[\s\S]*?width:\s*120%;[\s\S]*?height:\s*33\.125%;/);
  assert.match(pageSource, /#tv-stage\s*\{[\s\S]*?top:\s*30\.6%;[\s\S]*?width:\s*92%;/);
  assert.match(pageSource, /\.corner-logo\s*\{[\s\S]*?right:\s*2\.2%;[\s\S]*?bottom:\s*2\.2%;[\s\S]*?width:\s*18%;[\s\S]*?height:\s*16%;[\s\S]*?object-fit:\s*contain;[\s\S]*?z-index:\s*2;/);
});

test("TikTok Studio receives a versioned reusable HTTPS source that redirects to the local-only player", () => {
  assert.match(librarySource, /PlayerUrl = "https:\/\/www\.barcode-network\.com\/overlay\/commercials\?studioSource=v1"/);
  assert.match(librarySource, /LocalPlayerUrl => \$"http:\/\/127\.0\.0\.1:\{BridgeConstants\.Port\}\/commercials"/);
  assert.match(librarySource, /PreviewUrl => LocalPlayerUrl \+ "\?debug=1"/);
  assert.match(studioRouteSource, /LOCAL_COMMERCIAL_PLAYER_URL = "http:\/\/127\.0\.0\.1:43120\/commercials"/);
  assert.match(studioRouteSource, /status: 307/);
  assert.match(studioRouteSource, /Location: LOCAL_COMMERCIAL_PLAYER_URL/);
  assert.match(studioRouteSource, /Cache-Control": "private, no-store, max-age=0"/);
});

test("the existing queue button can start the local player without a second browser window", () => {
  assert.match(localServerSource, /path == "\/v1\/commercials\/start" && method == "POST"/);
  assert.match(localServerSource, /isCommercialStartRoute[\s\S]*VisualOriginAllowed\(origin\)/);
  assert.match(localServerSource, /var result = _commercials\.Start\(\)/);
  assert.doesNotMatch(localServerSource, /StartFromQueue|queue trigger/i);
  assert.doesNotMatch(playerScript, /barcode-network\.com\/api\/overlay\/commercials|pollQueueSignal/);
});

test("Chrome autoplay denial holds the current commercial until one click instead of failing the break", async () => {
  assert.ok(playerScript, "commercial player script must remain extractable from the local page");

  const elements = new Map([
    ["stage", new FakeElement("stage")],
    ["background-video", new FakeElement("background-video")],
    ["tv-stage", new FakeElement("tv-stage")],
    ["tv-overlay-video", new FakeElement("tv-overlay-video")],
    ["player", new FakeElement("player")],
    ["video-window", new FakeElement("video-window")],
    ["crt-power-on", new FakeElement("crt-power-on")],
    ["corner-logo-a", new FakeElement("corner-logo-a")],
    ["corner-logo-b", new FakeElement("corner-logo-b")],
    ["logo", new FakeElement("logo")],
    ["audio-gate", new FakeElement("audio-gate")],
    ["status", new FakeElement("status")],
  ]);
  const player = elements.get("player");
  const audioGate = elements.get("audio-gate");
  let playerPlayCalls = 0;
  player.play = () => {
    playerPlayCalls += 1;
    if (playerPlayCalls === 1) {
      const error = new Error("play() failed because the user didn't interact with the document first");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
    return Promise.resolve();
  };

  const posts = [];
  const state = {
    status: "queued",
    generation: 42,
    currentIndex: 0,
    sponsorCount: 0,
    interstitialCount: 0,
    message: "Commercial break queued.",
    backgroundUrl: "/v1/commercials/media/background",
    tvOverlayUrl: "/v1/commercials/media/tv-overlay",
    items: [{
      name: "START.mp4",
      url: "/v1/commercials/media/start",
      logoUrl: null,
      durationSeconds: 2,
    }],
  };
  const fetch = async (url, options = {}) => {
    if (options.method === "POST") {
      posts.push(url);
      return { ok: true, status: 204 };
    }
    return { ok: true, status: 200, json: async () => state };
  };
  const document = {
    body: new FakeElement("body"),
    getElementById: (id) => elements.get(id),
    createElement: (tag) => new FakeElement(tag),
  };
  const context = vm.createContext({
    URLSearchParams,
    DOMException,
    Promise,
    clearTimeout,
    console,
    document,
    fetch,
    location: { search: "?debug=1" },
    navigator: { userActivation: { hasBeenActive: false } },
    setInterval: () => 0,
    setTimeout: (callback) => setTimeout(callback, 0),
  });

  new vm.Script(playerScript, { filename: "CommercialPlayerPage.js" }).runInContext(context);
  await flushTasks();

  assert.equal(
    playerPlayCalls,
    1,
    `the blocked START clip is attempted exactly once before the gate; status=${elements.get("status").textContent}; posts=${posts.join(",")}`,
  );
  assert.equal(audioGate.hidden, false, "the preview displays its one-click audio gate");
  assert.match(elements.get("status").textContent, /WAITING FOR ONE CLICK TO ENABLE AUDIO/);
  assert.ok(posts.some((url) => url.includes("/clip-started?generation=42&index=0")));
  assert.ok(posts.every((url) => !url.includes("/failed")), "autoplay denial must not fail or clear the break");

  audioGate.click();
  await flushTasks();

  assert.equal(playerPlayCalls, 2, "the click retries the same loaded START clip directly");
  assert.equal(player.src, "/v1/commercials/media/start");
  assert.equal(audioGate.hidden, true);
  assert.ok(posts.every((url) => !url.includes("/failed")));

  player.dispatch("ended");
  await flushTasks();

  assert.ok(posts.some((url) => url.includes("/complete?generation=42")));
  assert.ok(posts.every((url) => !url.includes("/failed")));
});
