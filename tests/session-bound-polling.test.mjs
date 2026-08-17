import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync("src/lib/session-bound-polling.ts", "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const polling = await import(`data:text/javascript,${encodeURIComponent(js)}`);

class FakeEventTarget {
  listeners = new Map();

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name, listener) {
    this.listeners.get(name)?.delete(listener);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

function browserHarness(visibilityState = "visible") {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const browserWindow = new FakeEventTarget();
  const document = new FakeEventTarget();
  document.visibilityState = visibilityState;
  const timers = new Map();
  let nextTimerId = 1;
  browserWindow.setTimeout = (callback, delay) => {
    const id = nextTimerId++;
    timers.set(id, { callback, delay });
    return id;
  };
  browserWindow.clearTimeout = (id) => timers.delete(id);
  globalThis.window = browserWindow;
  globalThis.document = document;

  return {
    browserWindow,
    document,
    timers,
    async flush() {
      await Promise.resolve();
      await Promise.resolve();
    },
    async runNextTimer() {
      const [id, timer] = timers.entries().next().value ?? [];
      assert.ok(timer, "a scheduled poll should exist");
      timers.delete(id);
      timer.callback();
      await this.flush();
      return timer.delay;
    },
    restore() {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    },
  };
}

test("an idle queue performs one discovery read and schedules no recurring poll", async () => {
  const browser = browserHarness();
  let calls = 0;
  try {
    const stop = polling.startSessionBoundPolling({ intervalMs: 10_000, poll: async () => { calls += 1; return false; } });
    await browser.flush();
    assert.equal(calls, 1);
    assert.equal(browser.timers.size, 0);
    stop();
  } finally {
    browser.restore();
  }
});

test("an active queue keeps the exact interval and stops immediately after archive", async () => {
  const browser = browserHarness();
  const results = [true, true, false];
  let calls = 0;
  try {
    const stop = polling.startSessionBoundPolling({ intervalMs: 1_500, poll: async () => results[calls++] ?? false });
    await browser.flush();
    assert.equal(calls, 1);
    assert.equal(browser.timers.size, 1);
    assert.equal(await browser.runNextTimer(), 1_500);
    assert.equal(calls, 2);
    assert.equal(browser.timers.size, 1);
    assert.equal(await browser.runNextTimer(), 1_500);
    assert.equal(calls, 3);
    assert.equal(browser.timers.size, 0);
    stop();
  } finally {
    browser.restore();
  }
});

test("hidden tabs do not poll and resume with one visibility check", async () => {
  const browser = browserHarness("hidden");
  let calls = 0;
  try {
    const stop = polling.startSessionBoundPolling({ intervalMs: 650, poll: async () => { calls += 1; return true; } });
    await browser.flush();
    assert.equal(calls, 0);
    browser.document.visibilityState = "visible";
    browser.document.dispatchEvent(new Event("visibilitychange"));
    await browser.flush();
    assert.equal(calls, 1);
    assert.equal(browser.timers.size, 1);
    browser.document.visibilityState = "hidden";
    browser.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(browser.timers.size, 0);
    stop();
  } finally {
    browser.restore();
  }
});

test("session creation wakes an idle same-tab poller without a background timer", async () => {
  const browser = browserHarness();
  let active = false;
  let calls = 0;
  try {
    const stop = polling.startSessionBoundPolling({ intervalMs: 10_000, poll: async () => { calls += 1; return active; } });
    await browser.flush();
    assert.equal(calls, 1);
    assert.equal(browser.timers.size, 0);
    active = true;
    polling.notifyQueueSessionChanged();
    await browser.flush();
    assert.equal(calls, 2);
    assert.equal(browser.timers.size, 1);
    stop();
  } finally {
    browser.restore();
  }
});

test("active-session detection prefers explicit server authority", () => {
  assert.equal(polling.hasActiveQueueSession({ sessionActive: false, session: { status: "open" } }), false);
  assert.equal(polling.hasActiveQueueSession({ sessionActive: true, session: null }), true);
  assert.equal(polling.hasActiveQueueSession({ isCurrentSession: false, session: { status: "open" } }), false);
  assert.equal(polling.hasActiveQueueSession({ isCurrentSession: true, session: { status: "open" } }), true);
  assert.equal(polling.hasActiveQueueSession({ session: { status: "archived" } }), false);
});
