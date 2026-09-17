import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: id => id.startsWith("@/") ? load(`src/${id.slice(2)}.ts`) : require(id), Set, Number }, { filename: file });
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
const track = { key: "show:take", src: "/api/ballads/media?showId=show&audioId=take", title: "A song", artist: "BNL-01", artworkUrl: "", showHref: "/radio/archive?view=shows&show=show#broadcast-ballad", duration: 150 };
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
  assert.equal(value.src, "/api/ballads/media?showId=show%20%26%201&audioId=take%2F2");
  assert.equal(JSON.stringify(value).includes("not needed"), false);
  assert.equal(audioTime(125.9), "2:05"); assert.equal(audioTime(Infinity), "0:00");
});
