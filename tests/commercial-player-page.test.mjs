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
const playerScript = pageSource.match(/  <script>\n([\s\S]*?)\n  <\/script>/)?.[1];

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.dataset = {};
    this.events = new Map();
    this.style = { setProperty() {}, removeProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {} };
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
  pause() {}
  play() { return Promise.resolve(); }
  removeAttribute(name) { delete this[name]; }
}

const flushTasks = async (count = 8) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

test("TV frame crops its embedded border while preserving the undistorted source geometry", () => {
  assert.match(pageSource, /#background-video\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?transform:\s*scale\(1\.18\);[\s\S]*?transform-origin:\s*left top;/);
  assert.match(pageSource, /#tv-overlay-video\s*\{[\s\S]*?object-fit:\s*cover;/);
  assert.match(pageSource, /#tv-stage\s*\{[\s\S]*?top:\s*30\.6%;[\s\S]*?width:\s*92%;[\s\S]*?aspect-ratio:\s*719 \/ 435;[\s\S]*?overflow:\s*hidden;[\s\S]*?z-index:\s*2;/);
  assert.match(pageSource, /#tv-source\s*\{[\s\S]*?left:\s*-2\.6738%;[\s\S]*?top:\s*-2\.7624%;[\s\S]*?width:\s*106\.9519%;[\s\S]*?height:\s*110\.4972%;/);
  assert.match(pageSource, /#video-window\s*\{[\s\S]*?left:\s*5%;[\s\S]*?top:\s*8\.5%;[\s\S]*?width:\s*90%;[\s\S]*?height:\s*77%;[\s\S]*?overflow:\s*hidden;[\s\S]*?z-index:\s*1;/);
  assert.match(pageSource, /#player\s*\{[\s\S]*?object-fit:\s*cover;[\s\S]*?transform:\s*scale\(1\.10\);[\s\S]*?z-index:\s*1;/);
  assert.match(pageSource, /#player\[data-fit="soft"\]\s*\{[\s\S]*?object-fit:\s*fill;[\s\S]*?transform:\s*scale\(1\.015\);/);
  assert.match(pageSource, /#tv-overlay-video\s*\{[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?object-fit:\s*cover;[\s\S]*?z-index:\s*2;[\s\S]*?-webkit-mask:\s*url\(#tv-bezel-mask\) center \/ 100% 100% no-repeat;/);
  assert.match(pageSource, /<mask id="tv-bezel-mask"[\s\S]*?<path fill="white" fill-rule="evenodd"/);
  assert.doesNotMatch(pageSource, /clip-path:\s*inset|#tv-stage::before|#tv-stage::after|\.frame-patch|\.side-strip/);
  assert.doesNotMatch(pageSource, /#tv-stage::before|#tv-stage::after/);
  assert.match(pageSource, /<div id="tv-stage">[\s\S]*?<div id="tv-source">[\s\S]*?<div id="video-window">[\s\S]*?<video id="player"[\s\S]*?<img id="corner-logo"[\s\S]*?<video id="tv-overlay-video"/);
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

test("corner logos fade slowly and the second alternating mark is fifteen percent smaller", () => {
  assert.match(pageSource, /transition:\s*opacity var\(--corner-logo-fade-duration, 2400ms\) ease;/);
  assert.match(pageSource, /#corner-logo\[data-variant="2"\]\s*\{[\s\S]*?width:\s*15\.3%;[\s\S]*?height:\s*13\.6%;/);
  assert.match(playerScript, /const fadeMs = Math\.min\(2600, Math\.max\(800, totalMs \* \.14\)\)/);
  assert.match(playerScript, /cornerLogo\.dataset\.variant = String\(item\.cornerLogoVariant \|\| 1\)/);
  assert.match(playerScript, /cornerLogo\.classList\.add\('visible'\)[\s\S]*?cornerLogo\.classList\.remove\('visible'\)/);
});

test("near-sixteen-by-nine commercials use bounded soft fill to preserve top and bottom", () => {
  assert.match(playerScript, /new Set\(\['eversnow', 'alien', 'crackedencounters'\]\)/);
  assert.match(playerScript, /const softFitMaximumStretch = 1\.085/);
  assert.match(playerScript, /const sourceAspect = player\.videoWidth \/ player\.videoHeight/);
  assert.match(playerScript, /const stretch = apertureAspect \/ sourceAspect/);
  assert.match(playerScript, /stretch >= 1 && stretch <= softFitMaximumStretch/);
  assert.match(playerScript, /player\.dataset\.fit = 'soft'/);
});

test("BCN and BLVCKL!GHT logos remain enlarged while the cropped TV fills more of the canvas", () => {
  assert.match(pageSource, /#logo\s*\{[\s\S]*?top:\s*5\.4%;[\s\S]*?width:\s*96%;[\s\S]*?height:\s*26\.5%;/);
  assert.match(pageSource, /#logo\[data-brand="bcn"\], #logo\[data-brand="bl"\]\s*\{[\s\S]*?width:\s*120%;[\s\S]*?height:\s*33\.125%;/);
  assert.match(pageSource, /#tv-stage\s*\{[\s\S]*?top:\s*30\.6%;[\s\S]*?width:\s*92%;/);
  assert.match(pageSource, /#corner-logo\s*\{[\s\S]*?right:\s*2\.2%;[\s\S]*?bottom:\s*2\.2%;[\s\S]*?width:\s*18%;[\s\S]*?height:\s*16%;[\s\S]*?object-fit:\s*contain;[\s\S]*?z-index:\s*2;/);
});

test("TikTok Studio receives a reusable HTTPS source that redirects to the local-only player", () => {
  assert.match(librarySource, /PlayerUrl = "https:\/\/www\.barcode-network\.com\/overlay\/commercials"/);
  assert.match(librarySource, /LocalPlayerUrl => \$"http:\/\/127\.0\.0\.1:\{BridgeConstants\.Port\}\/commercials"/);
  assert.match(librarySource, /PreviewUrl => LocalPlayerUrl \+ "\?debug=1"/);
  assert.match(studioRouteSource, /LOCAL_COMMERCIAL_PLAYER_URL = "http:\/\/127\.0\.0\.1:43120\/commercials"/);
  assert.match(studioRouteSource, /status: 307/);
  assert.match(studioRouteSource, /Location: LOCAL_COMMERCIAL_PLAYER_URL/);
  assert.match(studioRouteSource, /Cache-Control": "private, no-store, max-age=0"/);
});

test("Chrome autoplay denial holds the current commercial until one click instead of failing the break", async () => {
  assert.ok(playerScript, "commercial player script must remain extractable from the local page");

  const elements = new Map([
    ["stage", new FakeElement("stage")],
    ["background-video", new FakeElement("background-video")],
    ["tv-overlay-video", new FakeElement("tv-overlay-video")],
    ["player", new FakeElement("player")],
    ["corner-logo", new FakeElement("corner-logo")],
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
    setTimeout,
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
