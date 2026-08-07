from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement target, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


QUEUE_TYPES_BLOCK = '''export const APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE =
  "Apple Music links are not currently accepted because BARCODE Radio cannot reliably access the full track. Use another accepted source or upload an MP3/WAV instead.";

export function isAppleMusicUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(value.trim()).hostname.toLowerCase();
    return hostname === "music.apple.com" || hostname.endsWith(".music.apple.com");
  } catch {
    return false;
  }
}

'''

queue_types_path = "src/lib/queue-types.ts"
queue_types = read(queue_types_path)
if "APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE" not in queue_types:
    marker = "export interface QueueLegalAcceptance {"
    if queue_types.count(marker) != 1:
        raise RuntimeError("queue-types.ts: QueueLegalAcceptance marker drifted")
    queue_types = queue_types.replace(marker, QUEUE_TYPES_BLOCK + marker, 1)
    write(queue_types_path, queue_types)

replace_once(
    "src/app/api/queue/route.ts",
    'import { PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, detectQueueSourceType } from "@/lib/queue-types";',
    'import { APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE, PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, detectQueueSourceType, isAppleMusicUrl } from "@/lib/queue-types";',
)
replace_once(
    "src/app/api/queue/route.ts",
    '  try { new URL(link); } catch { return NextResponse.json({ error: "Enter a valid track URL." }, { status: 400 }); }\n  if (await hasDuplicateLinkSubmission(link)) return duplicateResponse();',
    '  try { new URL(link); } catch { return NextResponse.json({ error: "Enter a valid track URL." }, { status: 400 }); }\n  if (isAppleMusicUrl(link)) {\n    return NextResponse.json(\n      { error: APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE, code: "apple_music_unsupported" },\n      { status: 400 },\n    );\n  }\n  if (await hasDuplicateLinkSubmission(link)) return duplicateResponse();',
)

form_path = "src/components/RadioQueueForm.tsx"
form = read(form_path)
old_import = 'import { PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, formatRuntime, PRIORITY_DISCLOSURE_TEXT, PRIORITY_TERMS_VERSION } from "@/lib/queue-types";'
new_import = 'import { APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE, PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, formatRuntime, isAppleMusicUrl, PRIORITY_DISCLOSURE_TEXT, PRIORITY_TERMS_VERSION } from "@/lib/queue-types";'
if form.count(old_import) != 1:
    raise RuntimeError("RadioQueueForm.tsx: queue-types import drifted")
form = form.replace(old_import, new_import, 1)
old_guard = '''    if (mode === "link" && !link.trim()) {
      setError("Add a track link before final routing.");
      return;
    }
    if (mode === "upload" && !file) {'''
new_guard = '''    if (mode === "link" && !link.trim()) {
      setError("Add a track link before final routing.");
      return;
    }
    if (mode === "link" && isAppleMusicUrl(link)) {
      setError(APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE);
      return;
    }
    if (mode === "upload" && !file) {'''
if form.count(old_guard) != 1:
    raise RuntimeError("RadioQueueForm.tsx: continueToRouting guard drifted")
form = form.replace(old_guard, new_guard, 1)
if form.count("                      <li>Apple Music</li>\n") != 1:
    raise RuntimeError("RadioQueueForm.tsx: Apple Music source-list item drifted")
form = form.replace("                      <li>Apple Music</li>\n", "", 1)
write(form_path, form)

replace_once(
    "README.md",
    "Apple Music is currently accepted through the generic external-open link path; no active `APPLE_MUSIC_DEVELOPER_TOKEN` integration exists on the trusted queue baseline.",
    "Apple Music is not accepted for BARCODE Radio intake because the host cannot reliably access the full submitted track. Apple Music links used elsewhere for releases, catalogs, dossiers, or historical records are unaffected.",
)
replace_once(
    "docs/queue-production-capability.md",
    "The native form accepts supported SoundCloud, Spotify, YouTube, TikTok, and Apple Music song links plus direct MP3/WAV uploads. Apple Music remains external-open only, as stated on the form. This cutover does not add Amazon Music, Suno, Bandcamp, or any other provider.",
    "The native form accepts supported SoundCloud, Spotify, YouTube, and TikTok links plus direct MP3/WAV uploads. New Apple Music queue submissions are rejected because BARCODE Radio cannot reliably access the full track; release, catalog, dossier, historical, and archived Apple Music links elsewhere remain unaffected. Amazon Music, Suno, and Bandcamp continue through the form's existing external-link path.",
)
replace_once(
    "tests/queue-production-capability.test.mjs",
    "  assert.match(routing.acceptedSourcesRule, /SoundCloud.*Spotify.*YouTube.*TikTok.*Apple Music.*MP3\\/WAV/);",
    "  assert.match(routing.acceptedSourcesRule, /SoundCloud.*Spotify.*YouTube.*TikTok.*MP3\\/WAV/);\n  assert.doesNotMatch(routing.acceptedSourcesRule, /Apple Music/);",
)

package_path = "package.json"
package_data = json.loads(read(package_path))
queue_command = package_data["scripts"]["test:queue"]
new_test = "tests/apple-music-queue-boundary.test.mjs"
if new_test not in queue_command:
    package_data["scripts"]["test:queue"] = f"{queue_command} {new_test}"
write(package_path, json.dumps(package_data, indent=2) + "\n")

TEST_CONTENT = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const resolved = path.join(projectRoot, "src", request.slice(2));
    if (fs.existsSync(resolved)) return resolved;
    if (fs.existsSync(`${resolved}.ts`)) return `${resolved}.ts`;
    if (fs.existsSync(`${resolved}.tsx`)) return `${resolved}.tsx`;
    return resolved;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
Module._extensions[".tsx"] = Module._extensions[".ts"];

const require = createRequire(import.meta.url);
const queueTypes = require("../src/lib/queue-types.ts");
const queue = require("../src/lib/queue.ts");
const queueRoute = require("../src/app/api/queue/route.ts");

function legalBody(overrides = {}) {
  return {
    artist: "Boundary Artist",
    title: "Boundary Track",
    mode: "link",
    link: "https://example.com/track",
    tiktokHandle: "@boundaryartist",
    acceptedLegal: true,
    termsVersion: queueTypes.PUBLIC_QUEUE_LEGAL_TERMS_VERSION,
    privacyVersion: queueTypes.PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION,
    queueTermsVersion: queueTypes.PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION,
    acceptedCheckboxText: queueTypes.PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT,
    ...overrides,
  };
}

function stateIds(state) {
  return [
    ...state.queue.map((entry) => entry.id),
    ...(state.nextInLine ? [state.nextInLine.id] : []),
    ...(state.nowPlaying ? [state.nowPlaying.id] : []),
    ...state.history.map((entry) => entry.id),
    ...(state.removed ?? []).map((entry) => entry.id),
  ].sort();
}

test("Apple Music intake boundary matches only the real Apple Music host", () => {
  assert.equal(queueTypes.isAppleMusicUrl("https://music.apple.com/us/album/example/123?i=456"), true);
  assert.equal(queueTypes.isAppleMusicUrl("https://embed.music.apple.com/us/album/example/123?i=456"), true);
  assert.equal(queueTypes.isAppleMusicUrl("https://music.apple.com.evil.example/us/album/example/123?i=456"), false);
  assert.equal(queueTypes.isAppleMusicUrl("https://apple.com/music"), false);
  assert.equal(queueTypes.isAppleMusicUrl("not a url"), false);

  for (const value of [
    "https://www.youtube.com/watch?v=abc123_DEF45",
    "https://music.youtube.com/watch?v=abc123_DEF45",
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://soundcloud.com/artist/track",
    "https://www.tiktok.com/@artist/video/1234567890123456789",
    "https://artist.bandcamp.com/track/example",
    "https://example.com/direct-track",
    "https://store.private.blob.vercel-storage.com/barcode-radio-queue/example.mp3",
  ]) {
    assert.equal(queueTypes.isAppleMusicUrl(value), false, `${value} must remain outside the Apple boundary`);
  }
});

test("server rejects new Apple Music intake without mutating existing queue records", { concurrency: false }, async () => {
  await queue.setQueueOpen(false);
  const started = await queue.startNewQueueSession({
    title: `Apple boundary ${Date.now()}`,
    submissionCooldownSeconds: 0,
  });
  await queue.setQueueOpen(true);

  const existing = await queue.addToQueue({
    artist: "Existing Apple Artist",
    title: "Existing Apple Track",
    tiktokHandle: "@existingapple",
    link: "https://music.apple.com/us/album/existing/100?i=200",
    sourceType: "other",
    tier: "free",
    lane: "regular",
    amount: 0,
    createdAt: new Date().toISOString(),
  });
  const before = await queue.getRadioQueueState();

  const response = await queueRoute.submitTrackFromBody(legalBody({
    sessionId: started.session.sessionId,
    link: "https://music.apple.com/us/album/rejected/300?i=400",
  }));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "apple_music_unsupported");
  assert.equal(payload.error, queueTypes.APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE);

  const after = await queue.getRadioQueueState();
  assert.deepEqual(stateIds(after), stateIds(before));
  assert.equal(stateIds(after).filter((id) => id === existing.id).length, 1);

  const accepted = await queueRoute.submitTrackFromBody(legalBody({
    sessionId: started.session.sessionId,
    artist: "Generic Artist",
    title: "Generic Track",
    tiktokHandle: "@genericartist",
    link: `https://example.com/track-${Date.now()}`,
  }));
  assert.equal(accepted.status, 201);
});

test("operational Radio copy and client routing no longer advertise or accept Apple Music", () => {
  const routingSource = fs.readFileSync(path.join(projectRoot, "src/lib/radio-submission-routing.ts"), "utf8");
  const formSource = fs.readFileSync(path.join(projectRoot, "src/components/RadioQueueForm.tsx"), "utf8");
  const readme = fs.readFileSync(path.join(projectRoot, "README.md"), "utf8");
  const capabilityDoc = fs.readFileSync(path.join(projectRoot, "docs/queue-production-capability.md"), "utf8");

  assert.doesNotMatch(routingSource, /SoundCloud, Spotify, YouTube, TikTok, Apple Music/);
  assert.doesNotMatch(formSource, /<li>Apple Music<\/li>/);
  assert.match(formSource, /isAppleMusicUrl\(link\)/);
  assert.match(formSource, /APPLE_MUSIC_QUEUE_UNSUPPORTED_MESSAGE/);
  assert.match(readme, /Apple Music is not accepted for BARCODE Radio intake/);
  assert.doesNotMatch(readme, /Apple Music is currently accepted through the generic external-open link path/);
  assert.match(capabilityDoc, /New Apple Music queue submissions are rejected/);
  assert.doesNotMatch(capabilityDoc, /Apple Music remains external-open only/);
});
'''
write("tests/apple-music-queue-boundary.test.mjs", TEST_CONTENT)

print("Applied Apple Music Radio intake removal")
