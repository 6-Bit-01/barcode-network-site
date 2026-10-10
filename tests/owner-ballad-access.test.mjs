import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import * as memberContract from "../services/member-auth/contract.mjs";
const require = createRequire(import.meta.url);
const origin = "https://www.barcode-network.com";
const memberCookie = "__Secure-barcode_id.session_token=owner-session";
const config = { serviceUrl: "https://member-auth.barcode-network.com", serviceToken: "ballad-private-fixture-token-123456789", canonicalOrigin: origin };

// Keep token verification, filtered member transport and access projection real;
// only the private service response, Ballad storage and Blob network are fixtures.
function fixture({ role = "owner", published = false } = {}) {
  const cache = new Map();
  const observed = { access: [], reads: 0, writes: 0, mediaReads: 0 };
  const state = { role, denied: null };
  const doc = { showId: "show-1", revision: 0, versions: [{ id: "version-1", title: "Signal", lyrics: "Private lyrics", style: "Soul" }], commands: [], audio: [{ id: "audio-1", versionId: "version-1", url: "https://unit.private.blob.vercel-storage.com/bnl-ballads/show-1/take.wav", pathname: "bnl-ballads/show-1/take.wav", filename: "take.wav", contentType: "audio/wav", bytes: 4 }], selectedAudioId: "audio-1", published: published ? { audioId: "audio-1", versionId: "version-1", at: "2026-10-09T00:00:00Z", presentation: {}, linerNotes: {} } : null };
  const show = { sessionId: "show-1", showDate: "2026-10-09", title: "BARCODE Radio" };
  const store = {
    balladWorkspaceCatalog: async () => { observed.reads++; return { shows: [show], artists: [] }; },
    readBallad: async () => { observed.reads++; return doc; },
    readBalladConfig: async () => ({ enabled: false, revision: 0 }),
    requireBalladShow: async id => { assert.equal(id, "show-1"); observed.reads++; return show; },
    saveBalladConfig: async (enabled, revision) => { assert.equal(revision, 0); observed.writes++; return { enabled, revision: 1 }; },
  };
  const fetcher = async (url, options) => {
    assert.equal(url, config.serviceUrl + "/api/member/access");
    observed.access.push(options);
    if (state.denied) return Response.json({ code: state.denied }, { status: 401 });
    const crew = state.role === "crew";
    return Response.json({ user: { id: "permanent-account", name: "Network member" }, session: { expiresAt: "2099-01-01T00:00:00Z" }, access: { owner: state.role === "owner", crew, permissions: crew ? ["song.generate", "show.overview", "insights.read"] : [], availablePermissions: ["song.generate", "show.overview", "insights.read"] } });
  };
  const mocks = {
    "server-only": {},
    "next/server": { NextResponse: { json: Response.json.bind(Response) } },
    "@/lib/bnl-ballads-store": store,
    "@vercel/blob": { get: async () => { observed.mediaReads++; return { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3, 4])); controller.close(); } }), blob: { contentType: "audio/wav" }, headers: new Headers({ "content-length": "4" }) }; } },
    "@vercel/blob/client": { handleUpload: async ({ body, onBeforeGenerateToken }) => ({ type: body.type, options: await onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload) }) },
  };
  function load(file) {
    const resolved = path.resolve(file);
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const loadedModule = { exports: {} }; cache.set(resolved, loadedModule);
    const code = ts.transpileModule(fs.readFileSync(resolved, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const resolver = id => {
      if (id in mocks) return mocks[id];
      if (id.endsWith("member-service")) return { getMemberServiceConfiguration: () => config };
      if (id.endsWith("contract.mjs")) return memberContract;
      if (id.startsWith("@/")) return load("src/" + id.slice(2) + ".ts");
      if (id.startsWith(".")) return load(path.resolve(path.dirname(resolved), id + ".ts"));
      return require(id);
    };
    vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: resolver, Request, Response, Headers, URL, AbortSignal, Buffer, Date, ReadableStream, TextEncoder, TextDecoder, Uint8Array, crypto: webcrypto, btoa, atob, fetch: fetcher, process: { env: { NODE_ENV: "production", JWT_SECRET: "ballad-fixture-jwt-secret" } } }, { filename: resolved });
    return loadedModule.exports;
  }
  return { load, state, observed };
}
function request(pathname = "/api/admin/ballads", { method = "GET", cookie = memberCookie, body, requestOrigin = origin, targetOrigin = origin } = {}) {
  const headers = { cookie };
  if (requestOrigin !== null) headers.origin = requestOrigin;
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(targetOrigin + pathname, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
const automation = { action: "saveAutomation", enabled: true, revision: 0 };
const uploadBody = (pathname = "bnl-ballads/show-1/take.wav", versionId = "version-1") => ({ type: "blob.generate-client-token", payload: { pathname, clientPayload: JSON.stringify({ showId: "show-1", versionId }) } });

test("a current Owner account opens Ballads without the legacy show cookie", async () => {
  const f = fixture();
  const route = f.load("src/app/api/admin/ballads/route.ts");
  assert.equal(await f.load("src/lib/auth.ts").verifyAdminRequest(request()), false);
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).document.showId, "show-1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(f.observed.access.length, 1);
  assert.equal(f.observed.access[0].headers.get("cookie"), memberCookie);
  assert.equal(f.observed.access[0].cache, "no-store");
});

test("Owner Ballad mutations use the current account authority", async () => {
  const f = fixture();
  const response = await f.load("src/app/api/admin/ballads/route.ts").POST(request(undefined, { method: "POST", body: automation }));
  assert.equal(response.status, 200);
  assert.equal(f.observed.writes, 1);
});

test("ordinary Member, Artist and assigned Crew accounts cannot read or write Ballads", async () => {
  for (const role of ["member", "artist", "crew"]) {
    const f = fixture({ role }), route = f.load("src/app/api/admin/ballads/route.ts");
    assert.equal((await route.GET(request())).status, 401, role);
    assert.equal((await route.POST(request(undefined, { method: "POST", body: automation }))).status, 401, role);
    assert.equal(f.observed.reads, 0); assert.equal(f.observed.writes, 0);
  }
});

test("Ballad Owner authority is refreshed after Owner revocation, suspension or session revocation", async () => {
  for (const denial of ["role", "UNAUTHENTICATED", "SESSION_REVOKED"]) {
    const f = fixture(), route = f.load("src/app/api/admin/ballads/route.ts");
    assert.equal((await route.GET(request())).status, 200);
    if (denial === "role") f.state.role = "member"; else f.state.denied = denial;
    assert.equal((await route.POST(request(undefined, { method: "POST", body: automation }))).status, 401);
    assert.equal(f.observed.access.length, 2); assert.equal(f.observed.writes, 0);
  }
});

test("Owner Ballads reject foreign origins and noncanonical account hosts before storage", async () => {
  for (const options of [{ requestOrigin: "https://foreign.test" }, { targetOrigin: "https://barcode-network.com", requestOrigin: "https://barcode-network.com" }, { targetOrigin: "https://preview.test", requestOrigin: "https://preview.test" }]) {
    const f = fixture(), route = f.load("src/app/api/admin/ballads/route.ts");
    assert.equal((await route.GET(request(undefined, options))).status, 401);
    assert.equal((await route.POST(request(undefined, { ...options, method: "POST", body: automation }))).status, 401);
    assert.equal(f.observed.reads, 0); assert.equal(f.observed.writes, 0); assert.equal(f.observed.access.length, 0);
  }
});

test("same-origin reads may omit Origin but mutation requests must include it", async () => {
  const f = fixture(), route = f.load("src/app/api/admin/ballads/route.ts");
  assert.equal((await route.GET(request(undefined, { requestOrigin: null }))).status, 200);
  assert.equal((await route.POST(request(undefined, { method: "POST", body: automation, requestOrigin: null }))).status, 401);
  assert.equal(f.observed.writes, 0);
});

test("legacy show admins retain Ballad access independently of account service availability", async () => {
  const f = fixture(); f.state.denied = "UNAUTHENTICATED";
  const token = await f.load("src/lib/auth.ts").createAdminToken();
  const route = f.load("src/app/api/admin/ballads/route.ts");
  const options = { cookie: "barcode_admin=" + token, targetOrigin: "https://preview.test", requestOrigin: "https://preview.test" };
  assert.equal((await route.GET(request(undefined, options))).status, 200);
  assert.equal((await route.POST(request(undefined, { ...options, method: "POST", body: automation }))).status, 200);
  assert.equal(f.observed.access.length, 0); assert.equal(f.observed.writes, 1);
  assert.equal((await route.POST(request(undefined, { ...options, method: "POST", body: automation, requestOrigin: "https://foreign.test" }))).status, 401);
});

test("Owner upload authorization retains exact show/version, path, type and size protections", async () => {
  const f = fixture(), route = f.load("src/app/api/admin/ballads/upload/route.ts");
  const response = await route.POST(request("/api/admin/ballads/upload", { method: "POST", body: uploadBody() }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.options.allowedContentTypes, ["audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav"]);
  assert.equal(data.options.maximumSizeInBytes, 104857600); assert.equal(data.options.addRandomSuffix, true);
  for (const body of [uploadBody("bnl-ballads/other/take.wav"), uploadBody("bnl-ballads/show-1/../take.wav"), uploadBody(undefined, "unknown-version")]) assert.equal((await route.POST(request("/api/admin/ballads/upload", { method: "POST", body }))).status, 400);
});

test("Crew, revoked Owners and cross-origin callers cannot authorize Ballad upload tokens", async () => {
  for (const mode of ["crew", "revoked", "foreign", "no-origin"]) {
    const f = fixture({ role: mode === "crew" ? "crew" : "owner" }); if (mode === "revoked") f.state.denied = "UNAUTHENTICATED";
    const response = await f.load("src/app/api/admin/ballads/upload/route.ts").POST(request("/api/admin/ballads/upload", { method: "POST", body: uploadBody(), ...(mode === "foreign" ? { requestOrigin: "https://foreign.test" } : mode === "no-origin" ? { requestOrigin: null } : {}) }));
    assert.equal(response.status, 400); assert.equal(f.observed.reads, 0);
  }
});

test("Owner private recording previews remain private and cannot bypass published-only receivers or downloads", async () => {
  const f = fixture(), route = f.load("src/app/api/ballads/media/route.ts");
  const url = "/api/ballads/media?showId=show-1&audioId=audio-1";
  const response = await route.GET(request(url, { requestOrigin: null }));
  assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 4);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal((await route.GET(request(url + "&public=1"))).status, 404);
  assert.equal((await route.GET(request(url + "&download=1"))).status, 404);
  f.state.role = "crew";
  assert.equal((await route.GET(request(url))).status, 404);
  assert.equal(f.observed.mediaReads, 1);
});
