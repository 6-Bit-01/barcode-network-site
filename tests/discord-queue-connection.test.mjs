import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.QUEUE_REDIS_REST_URL;
delete process.env.QUEUE_REDIS_REST_TOKEN;
delete process.env.BLOB_READ_WRITE_TOKEN;
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
const root = path.resolve(import.meta.dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) return path.join(root, "src", request.slice(2)) + ".ts";
  return originalResolve.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const reference = `${"a".repeat(64)}.${"b".repeat(64)}`;
let connectionReads = 0;
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@/lib/discord-connection") return { requestDiscordConnectionId: async req => {
    connectionReads++;
    return req.headers.get("cookie") === "verified-test-browser" ? reference : null;
  } };
  return originalLoad.call(this, request, parent, isMain);
};
const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const route = require("../src/app/api/queue/route.ts");
const types = require("../src/lib/queue-types.ts");

async function prepare(purpose = "live_broadcast") {
  const current = await queue.getRadioQueueState();
  if (current.revision && current.session.status !== "archived") await queue.archiveCurrentQueueSession();
  const state = await queue.startNewQueueSession({ purpose, submissionCooldownSeconds: 0, title: "Test connection show" });
  await queue.setQueueOpen(true);
  return state.session.sessionId;
}
function body(sessionId, extra = {}) {
  return {
    sessionId, mode: "link", artist: "Test Artist", title: "Test Song", tiktokHandle: "@testartist",
    submitterToken: "test-browser", link: "https://example.test/test-song",
    acceptedLegal: true, termsVersion: types.PUBLIC_QUEUE_LEGAL_TERMS_VERSION,
    privacyVersion: types.PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, queueTermsVersion: types.PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION,
    acceptedCheckboxText: types.PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, ...extra,
  };
}
function request(payload, cookie = "") {
  return new Request("https://example.test/api/queue", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(payload) });
}
async function stored(trackId) {
  const state = await queue.getRadioQueueState();
  return [...state.queue, state.nextInLine, state.nowPlaying, ...state.history].filter(Boolean).find(row => row.id === trackId);
}

test("actual link and upload POSTs attach only the server-verified private reference", async () => {
  for (const mode of ["link", "upload"]) {
    const sessionId = await prepare();
    const payload = body(sessionId, { mode, discordConnectionId: "forged-body-id", discordUserId: "forged-user", ...(mode === "upload" ? {
      uploadedBlobUrl: "https://test.private.blob.vercel-storage.com/barcode-radio-queue/test.mp3",
      uploadOriginalName: "test.mp3", fileSize: 12345, mimeType: "audio/mpeg", detectedDurationSeconds: 120,
    } : {}) });
    const response = await route.POST(request(payload, "verified-test-browser"));
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal((await stored(result.track.id)).discordConnectionId, reference);
    assert.ok(!JSON.stringify(result).includes(reference));
    assert.ok(!JSON.stringify(result).includes("discordConnectionId"));
    assert.ok(!JSON.stringify(queue.toPublicQueueTrack(await stored(result.track.id))).includes(reference));
  }
});

test("unconnected submission succeeds and submitted Discord identity is ignored", async () => {
  const sessionId = await prepare();
  const response = await route.POST(request(body(sessionId, { discordConnectionId: reference, discordUserId: "123456789012345679" })));
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  assert.equal((await stored(result.track.id)).discordConnectionId, null);
});

test("private rehearsals and disabled-production fixtures never attach identity", async () => {
  for (const [purpose, enabled] of [["internal_test", "true"], ["rehearsal", "true"], ["live_broadcast", "false"]]) {
    const sessionId = await prepare(purpose);
    process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = enabled;
    const before = connectionReads;
    const response = await route.submitTrackFromBody(body(sessionId), { allowAdminPrivateSession: true, connectionRequest: request({}, "verified-test-browser") });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assert.equal(connectionReads, before);
    assert.equal((await stored(result.track.id)).discordConnectionId, null);
    process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
  }
});
