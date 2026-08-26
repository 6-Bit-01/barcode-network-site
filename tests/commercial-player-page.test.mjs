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
const playerScript = pageSource.match(/  <script>\n([\s\S]*?)\n  <\/script>/)?.[1];

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = true;
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

test("Chrome autoplay denial holds the current commercial until one click instead of failing the break", async () => {
  assert.ok(playerScript, "commercial player script must remain extractable from the local page");

  const elements = new Map([
    ["stage", new FakeElement("stage")],
    ["background-video", new FakeElement("background-video")],
    ["tv-overlay-video", new FakeElement("tv-overlay-video")],
    ["player", new FakeElement("player")],
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

  assert.equal(playerPlayCalls, 1, "the blocked START clip is attempted exactly once before the gate");
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
