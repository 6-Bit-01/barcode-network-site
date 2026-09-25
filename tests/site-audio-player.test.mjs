import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
let catalogFetch;
function load(file) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : require(id), Set, Number, AbortSignal, fetch: (...args) => catalogFetch(...args) }, { filename: file });
  return mod.exports;
}
const { SiteAudioController, balladAudioTrack, publicAudioAllowed, audioTime } = load("src/lib/site-audio-player.ts");
class Audio extends EventTarget {
  attributes = new Map(); paused = true; ended = false; error = null;
  currentTime = 0; duration = NaN; volume = 1; muted = false;
  loads = 0; starts = 0; rejectNext = false; pending = null;
  get src() { return this.attributes.get("src") ?? ""; }
  set src(value) { this.attributes.set("src", value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  emit(name) { this.dispatchEvent(new Event(name)); }
  load() { this.loads++; this.currentTime = 0; this.ended = false; this.error = null; this.duration = NaN; }
  pause() { if (!this.paused) { this.paused = true; this.emit("pause"); } }
  play() {
    this.starts++;
    if (this.rejectNext) { this.rejectNext = false; return Promise.reject(new Error("blocked")); }
    if (this.pending) return this.pending;
    this.paused = false; this.emit("play"); this.emit("playing");
    return Promise.resolve();
  }
  metadata(duration = 150) { this.duration = duration; this.emit("loadedmetadata"); }
}
const track = { key: "show:take", showId: "show", audioId: "take", src: "/api/ballads/media?showId=show&audioId=take&public=1", title: "A song", artist: "BNL-01", artworkUrl: "", showHref: "/radio/archive?view=shows&show=show#broadcast-ballad", duration: 150 };
function setup() { const controller = new SiteAudioController(); const audio = new Audio(); controller.attach(audio); return { controller, audio }; }

test("player is silent and makes no media request until explicit Play", () => {
  const { controller, audio } = setup();
  assert.equal(audio.src, ""); assert.equal(audio.loads, 0); assert.equal(audio.starts, 0);
  assert.equal(controller.getSnapshot().track, null);
  controller.play(track);
  assert.equal(audio.src, track.src); assert.equal(audio.starts, 1);
  assert.equal(controller.getSnapshot().status, "playing");
});
test("pause and resume retain the same recording and playback position", () => {
  const { controller, audio } = setup(); controller.play(track); audio.metadata();
  controller.seek(48); controller.pause();
  assert.equal(controller.getSnapshot().status, "paused");
  controller.play(track);
  assert.equal(audio.loads, 1); assert.equal(audio.currentTime, 48);
  assert.equal(controller.getSnapshot().status, "playing");
});
test("selecting another recording replaces the sole source and clears old position", () => {
  const { controller, audio } = setup(); controller.play(track); audio.metadata(); controller.seek(48);
  controller.play({ ...track, key: "second", src: "/api/ballads/media?showId=second&audioId=take" });
  assert.equal(audio.loads, 2); assert.equal(audio.currentTime, 0);
  assert.equal(controller.getSnapshot().track.key, "second");
  assert.equal(controller.getSnapshot().canSeek, false);
});
test("late failed play promises cannot replace a newer recording or reopen a closed player", async () => {
  const { controller, audio } = setup(); let reject;
  audio.pending = new Promise((_, fail) => { reject = fail; }); controller.play(track);
  audio.pending = null; controller.play({ ...track, key: "second", src: "/second" });
  reject(new Error("old request")); await Promise.resolve();
  assert.equal(controller.getSnapshot().status, "playing");
  audio.pending = new Promise((_, fail) => { reject = fail; }); controller.play(track); controller.close();
  reject(new Error("closed request")); await Promise.resolve();
  assert.equal(controller.getSnapshot().track, null); assert.equal(audio.src, "");
});
test("blocked playback and media failure stay visible and retry only on explicit Play", async () => {
  const { controller, audio } = setup(); audio.rejectNext = true; controller.play(track); await Promise.resolve();
  assert.equal(controller.getSnapshot().status, "error"); assert.equal(audio.starts, 1);
  controller.play(); assert.equal(controller.getSnapshot().status, "playing");
  audio.error = { code: 4 }; audio.emit("error");
  assert.equal(controller.getSnapshot().status, "error"); assert.equal(audio.paused, true);
  controller.play(); assert.equal(controller.getSnapshot().status, "playing");
});
test("seek, mute and volume remain bounded; ended songs restart only on explicit Play", () => {
  const { controller, audio } = setup(); controller.play(track); controller.seek(40); assert.equal(audio.currentTime, 0);
  audio.metadata(); controller.seek(999); assert.equal(audio.currentTime, 150);
  controller.seek(-10); assert.equal(audio.currentTime, 0);
  controller.seek(NaN); assert.equal(audio.currentTime, 0);
  controller.setVolume(2); assert.equal(audio.volume, 1);
  controller.setVolume(0); controller.toggleMute(); controller.toggleMute(); assert.equal(audio.volume, .5);
  audio.ended = true; audio.currentTime = 150; audio.emit("ended");
  assert.equal(controller.getSnapshot().status, "ended"); assert.equal(audio.starts, 1);
  controller.play(); assert.equal(audio.currentTime, 0); assert.equal(audio.starts, 2);
});
test("operational routes pause and disable public playback without auto-resuming on return", () => {
  const { controller, audio } = setup(); controller.play(track);
  controller.setEnabled(false); assert.equal(audio.paused, true);
  controller.play(); assert.equal(audio.starts, 1);
  controller.setEnabled(true); assert.equal(audio.starts, 1);
  controller.play(); assert.equal(audio.starts, 2);
  for (const path of ["/admin", "/admin/queue", "/overlay/radio-visuals", "/obs", "/world/playtest"]) assert.equal(publicAudioAllowed(path), false, path);
  for (const path of ["/bnl", "/bnl/music", "/terminal", "/database/bnl-01", "/radio/archive", "/queue"]) assert.equal(publicAudioAllowed(path), true, path);
});
test("Close releases the source, and detached elements cannot change player state", () => {
  const { controller, audio } = setup(); controller.play(track); controller.close();
  assert.equal(audio.paused, true); assert.equal(audio.src, ""); assert.equal(controller.getSnapshot().track, null);
  controller.attach(null); const state = controller.getSnapshot();
  audio.currentTime = 50; audio.emit("timeupdate"); assert.equal(controller.getSnapshot(), state);
});
test("Ballads hand off only public playback metadata and escaped show/audio identifiers", () => {
  const value = balladAudioTrack({ show: { sessionId: "show & 1" }, audioId: "take/2", duration: 80, version: { title: "Released", lyrics: "not needed" }, presentation: { artworkUrl: "", producerSecret: "not needed" } });
  assert.equal(value.src, "/api/ballads/media?showId=show%20%26%201&audioId=take%2F2&public=1");
  assert.equal(JSON.stringify(value).includes("not needed"), false);
  assert.equal(audioTime(125.9), "2:05"); assert.equal(audioTime(Infinity), "0:00");
});

const { encodePlaylist, decodePlaylist, PLAYLIST_LIMIT } = load("src/lib/site-audio-playlist.ts");
const second = { ...track, key: "second:take", showId: "second", title: "Second song", src: "/api/ballads/media?showId=second&audioId=take&public=1" };
const third = { ...track, key: "third:take", showId: "third", title: "Third song", src: "/api/ballads/media?showId=third&audioId=take&public=1" };
const finish = audio => { audio.ended = true; audio.currentTime = 150; audio.emit("ended"); };
test("adding preserves one ordered list without starting playback or adding duplicates", () => {
  const { controller, audio } = setup(); controller.add(track); controller.add(second); controller.add(track);
  assert.equal(controller.getSnapshot().playlist.length, 2); assert.equal(audio.starts, 0); assert.equal(audio.src, "");
  assert.equal(controller.getSnapshot().visible, true);
  controller.play(); assert.equal(controller.getSnapshot().track.key, track.key);
});
test("ended advances once in current playlist order, stops at the end, and never loops", () => {
  const { controller, audio } = setup(); [track, second, third].forEach(controller.add); controller.play(track);
  controller.move(third.key, -1); finish(audio);
  assert.equal(controller.getSnapshot().track.key, third.key); assert.equal(audio.starts, 2);
  audio.emit("ended"); assert.equal(audio.starts, 2);
  finish(audio); assert.equal(controller.getSnapshot().track.key, second.key);
  finish(audio); assert.equal(controller.getSnapshot().status, "ended"); assert.equal(audio.starts, 3);
});
test("previous and next follow stable active identity through reorders and removals", () => {
  const { controller, audio } = setup(); [track, second, third].forEach(controller.add); controller.play(second);
  controller.move(second.key, -1); controller.previous(); assert.equal(audio.starts, 1);
  controller.remove(track.key); controller.next(); assert.equal(controller.getSnapshot().track.key, third.key);
  controller.previous(); assert.equal(controller.getSnapshot().track.key, second.key);
});
test("removing the current song stops it without automatically starting its successor", () => {
  const { controller, audio } = setup(); [track, second].forEach(controller.add); controller.play(track); controller.remove(track.key);
  assert.equal(audio.src, ""); assert.equal(audio.starts, 1); assert.equal(controller.getSnapshot().track, null);
  assert.equal(controller.getSnapshot().visible, true); controller.play(); assert.equal(controller.getSnapshot().track.key, second.key);
});
test("Close retains the list but stays dismissed through metadata refresh; Clear removes it", () => {
  const { controller, audio } = setup(); controller.add(track); controller.play(); controller.close();
  controller.refreshPlaylist([track]); assert.equal(controller.getSnapshot().visible, false); assert.equal(audio.src, "");
  assert.equal(controller.getSnapshot().playlist.length, 1);
  controller.add(track); assert.equal(controller.getSnapshot().visible, true);
  controller.clearPlaylist(); assert.equal(controller.getSnapshot().playlist.length, 0); assert.equal(controller.getSnapshot().visible, false);
});
test("pause, media arbitration and restricted routes disarm automatic advancement", () => {
  for (const action of [c => c.pause(), c => c.setEnabled(false), c => c.close()]) {
    const { controller, audio } = setup(); [track, second].forEach(controller.add); controller.play(track); action(controller); finish(audio);
    assert.equal(audio.starts, 1);
  }
});
test("a separately played song does not begin an unrelated playlist when it ends", () => {
  const { controller, audio } = setup(); controller.add(second); controller.play(track); finish(audio);
  assert.equal(audio.starts, 1); assert.equal(controller.getSnapshot().status, "ended");
});
test("media failure stops instead of silently skipping; Next is still usable", () => {
  const { controller, audio } = setup(); [track, second].forEach(controller.add); controller.play(track);
  audio.error = { code: 4 }; audio.emit("error"); finish(audio); assert.equal(audio.starts, 1);
  controller.next(); assert.equal(controller.getSnapshot().track.key, second.key);
});
test("an unpublished next recording is shown unavailable and does not start", () => {
  const { controller, audio } = setup(); [track, second, third].forEach(controller.add); controller.refreshPlaylist([track, third]); controller.play(track); finish(audio);
  assert.equal(controller.getSnapshot().track.key, second.key); assert.equal(controller.getSnapshot().status, "error"); assert.equal(audio.starts, 1); assert.equal(audio.src, "");
  controller.next(); assert.equal(controller.getSnapshot().track.key, third.key);
});
test("reload restores references and order, never stored URLs, audio, or private metadata", () => {
  const saved = encodePlaylist([{ ...second, src: "https://private.invalid/token", about: "private text", artworkUrl: "https://private.invalid/art" }, track]);
  assert.equal(saved.includes("private"), false);
  const { controller, audio } = setup(); controller.restorePlaylist(saved);
  assert.equal(controller.getSnapshot().playlist[0].key, second.key); assert.equal(controller.getSnapshot().track, null);
  assert.equal(audio.starts, 0); assert.equal(audio.src, "");
  controller.play(); assert.equal(audio.src, second.src);
});
test("malformed, oversized, wrong-version, duplicate and forged storage are bounded", () => {
  for (const value of [null, "bad", "[]", '{"version":2,"tracks":[]}', "x".repeat(100001)]) assert.equal(decodePlaylist(value).length, 0);
  const decoded = decodePlaylist(JSON.stringify({ version: 1, tracks: [null, { showId: "../../admin", audioId: "private" }, { showId: "show", audioId: "take", src: "javascript:bad", title: "Saved" }, { showId: "show", audioId: "take" }] }));
  assert.equal(decoded.length, 1); assert.equal(decoded[0].src, track.src); assert.equal(decoded[0].title, "Saved");
  const { controller } = setup();
  for (let i = 0; i <= PLAYLIST_LIMIT; i++) controller.add({ ...track, key: `show:${i}`, audioId: String(i) });
  assert.equal(controller.getSnapshot().playlist.length, PLAYLIST_LIMIT); assert.match(controller.getSnapshot().playlistNotice, /100/);
});
test("catalog failure does not erase the list or claim that its songs were unpublished", async () => {
  const { controller, audio } = setup(); controller.add(track); catalogFetch = async () => ({ ok: false }); await controller.refreshCatalog();
  assert.equal(controller.getSnapshot().playlist.length, 1); assert.notEqual(controller.getSnapshot().playlist[0].availability, "unavailable");
  assert.match(controller.getSnapshot().playlistNotice, /could not be refreshed/); assert.equal(audio.starts, 0);
});
test("late catalog refresh cannot restore removed entries or reopen a closed player", async () => {
  const { controller } = setup(); controller.add(track); let resolve;
  catalogFetch = () => new Promise(done => { resolve = done; }); const pending = controller.refreshCatalog();
  controller.remove(track.key); controller.add(second); controller.close(); resolve({ ok: true, json: async () => ({ ballads: [] }) }); await pending;
  assert.equal(controller.getSnapshot().playlist.length, 1); assert.equal(controller.getSnapshot().playlist[0].key, second.key);
  assert.notEqual(controller.getSnapshot().playlist[0].availability, "unavailable"); assert.equal(controller.getSnapshot().visible, false);
});
