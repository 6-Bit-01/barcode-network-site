import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/queue-submission-checkout.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function checkout(fetchResult) {
  const calls = [], cleared = [];
  const cjsModule = { exports: {} };
  const contracts = { PRIORITY_DISCLOSURE_TEXT: "priority disclosure", PRIORITY_TERMS_VERSION: "1.1", SIGNAL_HOLD_DISCLOSURE_TEXT: "hold disclosure", SIGNAL_HOLD_TERMS_VERSION: "1.0" };
  vm.runInNewContext(code, { module: cjsModule, exports: cjsModule.exports, AbortSignal, fetch: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (fetchResult instanceof Error) throw fetchResult;
    return fetchResult;
  }, require: id => id.endsWith("queue-types") ? contracts : id.endsWith("signal-hold-checkout-client") ? {
    getOrCreateSignalHoldCheckoutOwnerToken: () => "hold-owner",
    clearSignalHoldCheckoutOwnerToken: (...args) => cleared.push(["signal_hold", ...args]),
  } : {
    getOrCreatePriorityCheckoutOwnerToken: () => "priority-owner",
    clearPriorityCheckoutOwnerToken: (...args) => cleared.push(["priority", ...args]),
  } });
  return { calls, cleared, start: choice => cjsModule.exports.startQueueSubmissionCheckout({ choice, sessionId: "show", trackId: "accepted-track", submitterToken: "submitter" }) };
}

for (const choice of ["priority", "signal_hold"]) {
  test(`${choice} intake checkout uses only its existing payment endpoint and terms after acceptance`, async () => {
    const fixture = checkout({ ok: true, json: async () => ({ url: "https://checkout.example/session" }) });
    const result = await fixture.start(choice);
    assert.equal(result.url, "https://checkout.example/session");
    assert.match(result.message, /Payment is not confirmed/);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0].url, choice === "signal_hold" ? "/api/queue/signal-hold-checkout" : "/api/queue/priority-checkout");
    assert.deepEqual(fixture.calls[0].body, {
      sessionId: "show", trackId: "accepted-track", submitterToken: "submitter", checkoutOwnerToken: choice === "signal_hold" ? "hold-owner" : "priority-owner",
      ...(choice === "signal_hold" ? { acceptedSignalHoldTerms: true, signalHoldTermsVersion: "1.0", signalHoldDisclosureText: "hold disclosure" } : { acceptedPriorityTerms: true, priorityTermsVersion: "1.1", priorityDisclosureText: "priority disclosure" }),
    });
  });

  test(`${choice} network failure retains acceptance and never retries submission or checkout`, async () => {
    const fixture = checkout(new TypeError("network failed"));
    const result = await fixture.start(choice);
    assert.equal(result.url, null);
    assert.match(result.message, /song was accepted/);
    assert.match(result.message, /could not be confirmed/);
    assert.match(result.message, /do not resubmit/);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.cleared.length, 0);
  });

  test(`${choice} checkout owned elsewhere clears only that service's resume proof`, async () => {
    const fixture = checkout({ ok: false, json: async () => ({ code: "checkout_owned_elsewhere", error: "Only the person who started it can resume it." }) });
    const result = await fixture.start(choice);
    assert.equal(result.url, null);
    assert.match(result.message, /Only the person/);
    assert.deepEqual(fixture.cleared, [[choice, "show", "accepted-track"]]);
  });
}

test("Signal Hold becoming ineligible between submission and checkout leaves a clear accepted-song receipt", async () => {
  const fixture = checkout({ ok: false, json: async () => ({ error: "Signal Hold is unavailable once this track is one of the next two to play." }) });
  const result = await fixture.start("signal_hold");
  assert.equal(result.url, null);
  assert.match(result.message, /song was accepted/);
  assert.match(result.message, /next two to play/);
  assert.match(result.message, /do not resubmit/);
});
