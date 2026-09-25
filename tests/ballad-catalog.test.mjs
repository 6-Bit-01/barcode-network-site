import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => mocks[id] ?? (id.startsWith("@/") ? load(`src/${id.slice(2)}${existsSync(`src/${id.slice(2)}.tsx`) ? ".tsx" : ".ts"}`, mocks) : require(id)), URL, URLSearchParams, Request, Response, Headers, ReadableStream, TextEncoder, Date, console, process }, { filename: file });
  return mod.exports;
}
const catalog = load("src/lib/ballad-catalog.ts");
const download = load("src/lib/ballad-download.ts");
const archive = load("src/lib/broadcast-archive.ts");
function release(n = 1) {
  return { show: { sessionId: `show-${n}`, title: `Radio ${n}`, showDate: `2026-09-${String(n).padStart(2, "0")}` }, version: { id: `draft-${n}`, title: `Song ${n}`, lyrics: "[Chorus]\nCafé signals after midnight", style: "Breakbeats and warm bass", palette: { genres: "Trip-Hop, Industrial Rock", topics: "studio rats" }, author: "BNL-01" }, presentation: { credits: "Production: 6 Bit", artworkUrl: "" }, linerNotes: { about: "A night on air", mentions: "AI/ML Music and Chris", inspiration: "Floorboards", inspiredBy: "Chris" }, artistLinks: [{ name: "AI/ML Music", projectKey: "ai/ml music", projectLabel: "AI/ML Music" }], audioId: `take-${n}`, duration: 150, publishedAt: `2026-09-${String(n).padStart(2, "0")}T12:00:00Z` };
}
test("catalog search combines words and quoted phrases across released lyrics, people, credits and notes", () => {
  const songs = [release(), { ...release(2), version: { ...release(2).version, lyrics: "A different chorus" }, linerNotes: {} }];
  for (const q of ['cafe "after midnight"', "Chris studio", "AI/ML Music Floorboards", '"6 Bit" cafe']) assert.equal(catalog.selectCatalog(songs, catalog.catalogFilters({ q })).total, 1, q);
  assert.equal(catalog.selectCatalog(songs, catalog.catalogFilters({ q: "missingword cafe" })).total, 0);
});
test("genre and people facets deduplicate full identities without splitting AI/ML or combined names", () => {
  const song = release(); song.version.palette.genres = "Trip-Hop, trip-hop; Synth-Pop";
  song.artistLinks.push({ name: "AI ML", projectKey: "ai/ml music", projectLabel: "AI/ML Music" }, { name: "6 X Bit", projectKey: "6 x bit", projectLabel: "6 X Bit" });
  const facets = catalog.catalogFacets([song]);
  assert.equal(facets.genres.length, 2); assert.equal(facets.artists.length, 2);
  assert.equal(facets.artists.find(a => a.value === "ai/ml music").count, 1);
});
test("genre, linked artist, year and inclusive show date filters combine", () => {
  const songs = [release(1), release(2), release(3)];
  const filters = catalog.catalogFilters({ genre: "trip-hop", artist: "ai/ml music", year: "2026", from: "2026-09-02", to: "2026-09-02" });
  assert.equal(catalog.selectCatalog(songs, filters).entries[0].show.sessionId, "show-2");
  assert.equal(catalog.selectCatalog(songs, { ...filters, artist: "not-saved" }).total, 0);
  assert.equal(catalog.selectCatalog(songs, { ...filters, from: "2026-09-03" }).total, 0);
});
test("catalog validates query parameters and calendar dates without accepting duplicate param arrays", () => {
  const filters = catalog.catalogFilters({ q: ["private", "junk"], page: "-2", from: "2026-02-31", to: "2026-09-11", year: "oops", sort: "bad" });
  assert.equal(filters.q, ""); assert.equal(filters.page, 1); assert.equal(filters.from, ""); assert.equal(filters.year, ""); assert.equal(filters.sort, "newest"); assert.equal(filters.to, "2026-09-11");
});
test("pagination is bounded, preserves filters, and direct release links find old songs beyond page one", () => {
  const songs = Array.from({ length: 25 }, (_, i) => release(i + 1));
  const first = catalog.selectCatalog(songs, catalog.catalogFilters());
  assert.equal(first.entries.length, 12); assert.equal(first.pages, 3); assert.equal(first.entries[0].show.sessionId, "show-25");
  const target = catalog.selectCatalog(songs, catalog.catalogFilters({ release: "show-1" }));
  assert.equal(target.page, 3); assert.equal(target.entries[0].show.sessionId, "show-1");
  const clamped = catalog.selectCatalog(songs, catalog.catalogFilters({ page: "999" })); assert.equal(clamped.page, 3);
  const href = catalog.catalogPageHref(catalog.catalogFilters({ q: "AI/ML Music", genre: "trip-hop", release: "show-1" }), 2);
  const url = new URL(href, "https://test"); assert.equal(url.searchParams.get("q"), "AI/ML Music"); assert.equal(url.searchParams.get("genre"), "trip-hop"); assert.equal(url.searchParams.get("page"), "2"); assert.equal(url.searchParams.has("release"), false);
});
test("artist URLs preserve punctuation and target the actual card; reviewed aliases remain unambiguous", () => {
  for (const name of ["AI/ML Music", "6 X Bit", "Bludgeon💔Heart", "Sovrah’nis"]) {
    const url = new URL(archive.broadcastArchiveArtistHref(name), "https://test"); assert.equal(url.hash, "#artist-card"); assert.equal(url.searchParams.get("artist"), archive.normalizeBroadcastArchiveProjectKey(name));
  }
  const current = { projectKey: "skella", aliases: ["SKELLA x EXIDA"] };
  assert.equal(archive.resolveArchiveArtist([current], "SKELLA x EXIDA"), current);
  assert.equal(archive.resolveArchiveArtist([current, { projectKey: "exida", aliases: ["SKELLA x EXIDA"] }], "SKELLA x EXIDA"), undefined);
});
test("download filenames use the published title, show date and real media type; unsafe path characters are removed", () => {
  assert.equal(download.balladDownloadFilename("Non-Network Hazards and the Live Machine", "2026-09-11", "audio/mpeg"), "BARCODE_RADIO_Non-Network_Hazards_and_the_Live_Machine_2026-09-11.mp3");
  const name = download.balladDownloadFilename('.. / Café: "Signals"\r\n', "2026-09-11", "audio/x-wav");
  assert.equal(name, "BARCODE_RADIO_Café_Signals_2026-09-11.wav");
  const header = download.balladDownloadDisposition(name); assert.match(header, /^attachment;/); assert.ok(header.includes("Caf%C3%A9_Signals")); assert.equal(/[\r\n]/.test(header), false);
  assert.ok(Buffer.byteLength(download.balladDownloadFilename("音".repeat(300), "2026-09-11", "audio/wav")) < 255);
});
function mediaRoute({ published = true, eligible = true, admin = false } = {}) {
  const song = release();
  const doc = { versions: [song.version], audio: [{ id: song.audioId, versionId: song.version.id, url: "https://private.example/recording.wav", filename: "private-original.wav", contentType: "audio/wav" }], published: published ? { versionId: song.version.id, audioId: song.audioId, at: song.publishedAt, presentation: song.presentation, linerNotes: song.linerNotes, artistLinks: song.artistLinks } : null };
  let reads = 0;
  const route = load("src/app/api/ballads/media/route.ts", {
    "@/lib/auth": { verifyAdminRequest: async () => admin },
    "@/lib/bnl-ballads-store": { requireBalladShow: async () => { if (!eligible) throw Error("revoked"); return song.show; }, readBallad: async () => doc },
    "@vercel/blob": { get: async (_url, options) => { reads++; const range = options.headers?.range; return { statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(range ? [1, 2] : [1, 2, 3, 4])); c.close(); } }), blob: { contentType: "audio/wav" }, headers: new Headers(range ? { "content-range": "bytes 0-1/4", "content-length": "2" } : { "content-length": "4" }) }; } },
  });
  return { route, doc, reads: () => reads };
}
test("free download streams with attachment naming while ordinary playback and ranges stay inline", async () => {
  const { route } = mediaRoute();
  const url = "https://test/api/ballads/media?showId=show-1&audioId=take-1";
  const audio = await route.GET(new Request(url)); assert.equal(audio.headers.get("content-disposition"), "inline");
  const file = await route.GET(new Request(`${url}&download=1`)); assert.equal(file.status, 200); assert.match(file.headers.get("content-disposition"), /BARCODE_RADIO_Song_1_2026-09-01.wav/); assert.equal((await file.arrayBuffer()).byteLength, 4); assert.equal(file.headers.get("cache-control"), "private, no-store");
  const partial = await route.GET(new Request(`${url}&download=1`, { headers: { range: "bytes=0-1" } })); assert.equal(partial.status, 206); assert.equal(partial.headers.get("content-range"), "bytes 0-1/4"); assert.equal((await partial.arrayBuffer()).byteLength, 2);
});
test("downloads reject unpublished, wrong-take and revoked shows before reading private media, even for admin previews", async () => {
  for (const options of [{ published: false }, { eligible: false }, { published: false, admin: true }]) {
    const { route, reads } = mediaRoute(options);
    const response = await route.GET(new Request("https://test/api/ballads/media?showId=show-1&audioId=take-1&download=1")); assert.equal(response.status, 404); assert.equal(reads(), 0);
  }
  const { route, reads } = mediaRoute(); assert.equal((await route.GET(new Request("https://test/api/ballads/media?showId=show-1&audioId=other&download=1"))).status, 404); assert.equal(reads(), 0);
});


test("Archive follows the current URL instead of stale initial selection and never substitutes an unrelated artist", () => {
  const artist = (key, label) => ({ projectKey: key, projectLabel: label, aliases: [], tracks: [], showCount: 1, submittedTrackCount: 1, acceptedSubmissionCount: 1, finishedTrackCount: 1, skippedTrackCount: 0, removedTrackCount: 0, unknownOutcomeTrackCount: 0, firstShowDate: "2026-09-01", latestShowDate: "2026-09-01" });
  const stats = { historyCoverageStartedAt: "2026-08-24", overview: { showCount: 1, submittedTrackCount: 2, finishedTrackCount: 2 }, shows: [], artists: [artist("skella", "SKELLA"), artist("ai/ml music", "AI/ML Music")] };
  let url = "view=artists&artist=ai%2Fml%20music";
  const { BroadcastArchive } = load("src/components/BroadcastArchive.tsx", {
    "next/navigation": { useSearchParams: () => new URLSearchParams(url), useRouter: () => ({ push() {} }) },
    "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
    "@/components/SiteAudioProvider": { useSiteAudio: () => ({ track: null, playlist: [], currentTime: 0, duration: 0, status: "idle", controller: {} }) },
  });
  const render = () => renderToStaticMarkup(React.createElement(BroadcastArchive, { initialStats: stats, initialView: "shows", initialArtistKey: "skella" }));
  assert.match(render(), /id="selected-artist-heading"[^>]*>AI\/ML Music<\/h2>/);
  url = "view=artists&artist=skella";
  assert.match(render(), /id="selected-artist-heading"[^>]*>SKELLA<\/h2>/);
  url = "view=artists&artist=retired-unknown";
  assert.ok(render().includes("Artist card unavailable"));
  assert.equal(render().includes('id="selected-artist-heading"'), false);
});

test("public playlist media rejects draft/admin previews and revoked shows before reading audio", async () => {
  const url = "https://test/api/ballads/media?showId=show-1&audioId=take-1&public=1";
  for (const options of [{ published: false }, { published: false, admin: true }, { eligible: false, admin: true }]) {
    const { route, reads } = mediaRoute(options);
    assert.equal((await route.GET(new Request(url))).status, 404); assert.equal(reads(), 0);
  }
  const { route, doc, reads } = mediaRoute({ admin: true });
  assert.equal((await route.GET(new Request(url, { headers: { Range: "bytes=0-1" } }))).status, 206);
  const before = reads(); doc.published = null;
  assert.equal((await route.GET(new Request(url))).status, 404); assert.equal(reads(), before);
  assert.equal((await route.GET(new Request(url.replace("&public=1", "")))).status, 200);
});
