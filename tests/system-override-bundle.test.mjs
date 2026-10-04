import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const bundleRoot = path.resolve(fileURLToPath(new URL("../public/games/system-override/", import.meta.url)));
const markerName = ".standalone-build.json";
const adapterName = "src/engine/standalone-sprites.js";
const read = (name) => fs.readFileSync(path.join(bundleRoot, name), "utf8");
const marker = () => JSON.parse(read(markerName));

function localFile(name, files = marker().files) {
  assert.equal(typeof name, "string", "Bundle path must be a string");
  assert(name.length > 0 && !/[\\:#?\u0000]/.test(name), `Unsafe bundle path: ${name}`);
  const relative = name.replace(/^\.\//, "");
  assert(!path.posix.isAbsolute(relative) && !relative.split("/").includes(".."),
    `Bundle path escapes the game directory: ${name}`);
  assert.equal(path.posix.normalize(relative), relative, `Noncanonical bundle path: ${name}`);
  assert(Object.hasOwn(files, relative), `Path is absent from the public hash manifest: ${name}`);
  const resolved = path.resolve(bundleRoot, relative);
  assert(resolved.startsWith(bundleRoot + path.sep), `Bundle path escapes the game directory: ${name}`);
  assert(fs.lstatSync(resolved).isFile(), `Missing local bundle file: ${name}`);
  return resolved;
}

function inventory(directory = bundleRoot, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    assert(!entry.isSymbolicLink(), `Public bundle must not contain a symlink: ${name}`);
    if (entry.isDirectory()) return inventory(path.join(directory, entry.name), name + "/");
    assert(entry.isFile(), `Unexpected public bundle entry: ${name}`);
    return [name];
  }).sort();
}

async function digest(file) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest("hex"), bytes };
}

const quiet = { log() {}, warn() {}, error() {} };
const context = (extra = {}) => vm.createContext({ window: { BARCODE: {}, ...extra }, console: quiet, ...extra });
const load = (sandbox, name) => vm.runInContext(read(name), sandbox, { filename: name });

test("System Override ships a complete, sanitized ownership and SHA-256 manifest", async (t) => {
  const owner = marker();
  assert.deepEqual(Object.keys(owner).sort(), [
    "assetBytes", "builder", "builderSHA256", "canonicalAssetCount", "files", "limitations",
    "ownedFiles", "preservedOriginalCount", "sourceCommit", "sourceMode", "sourceTree", "status",
  ].sort(), "Public metadata must contain only the sanitized package contract");
  assert.equal(owner.builder, "barcode-system-override-standalone-v1");
  assert.equal(owner.status, "complete");
  assert.match(owner.sourceCommit, /^[0-9a-f]{40}$/);
  assert.match(owner.sourceTree, /^[0-9a-f]{40}$/);
  assert.match(owner.builderSHA256, /^[0-9a-f]{64}$/);
  assert.equal(owner.sourceMode, "working-tree runtime scripts; exact HEAD canonical asset blobs");
  assert(Array.isArray(owner.limitations) && owner.limitations.length > 0);
  assert(owner.limitations.every((value) => typeof value === "string" && value.length > 0));
  assert.doesNotMatch(JSON.stringify(owner), /[A-Za-z]:[\\/]|\\\\|file:\/\/|\/(?:Users|home|tmp)\//,
    "Public build metadata exposes a local filesystem path");
  assert(owner.files && typeof owner.files === "object" && !Array.isArray(owner.files));
  assert(Array.isArray(owner.ownedFiles));
  const names = Object.keys(owner.files).sort();
  assert(names.length > 0);
  assert(!names.includes(markerName), "The marker cannot include its own recursive hash");
  assert.deepEqual(owner.ownedFiles, [...names, markerName].sort());
  assert.deepEqual(inventory(), owner.ownedFiles, "Public files must exactly match generated ownership");
  for (const required of ["index.html", "style.css", "sprites-manifest.json", adapterName,
    "src/core/runtime-lifecycle.js", "src/engine/renderer.js", "src/engine/presentation-assets.js",
    "src/game/game-initializer.js", "src/game/main-new.js", "src/utils/math.js"]) {
    assert(names.includes(required), `Incomplete game package: ${required}`);
  }
  const assets = names.filter((name) => name.startsWith("assets/"));
  assert(Number.isSafeInteger(owner.canonicalAssetCount) && owner.canonicalAssetCount > 0);
  assert(Number.isSafeInteger(owner.preservedOriginalCount) && owner.preservedOriginalCount > 0);
  // Preserved originals may also be tracked canonical blobs; ownership is a union.
  assert(assets.length >= owner.canonicalAssetCount &&
    assets.length <= owner.canonicalAssetCount + owner.preservedOriginalCount);
  const originals = JSON.parse(read("assets/standalone/originals.json"));
  assert(Array.isArray(originals));
  assert.equal(originals.length, owner.preservedOriginalCount);
  assert.equal(new Set(originals.map((record) => record.path)).size, originals.length);
  for (const original of originals) {
    assert.match(original.path, /^assets\/standalone\//);
    localFile(original.path, owner.files);
    assert.deepEqual(owner.files[original.path], { bytes: original.bytes, sha256: original.sha256 },
      `Preserved original record differs from deployed bytes: ${original.path}`);
  }
  assert(assets.some((name) => /\.(?:webp|png)$/.test(name)), "Canonical artwork is missing");
  assert(assets.some((name) => /^assets\/standalone\/.*\.(?:mp3|wav)$/.test(name)),
    "Preserved original music is missing");
  assert(assets.some((name) => /\.(?:ttf|woff2?)$/.test(name)), "Local font artwork is missing");
  let assetBytes = 0;
  for (const name of names) {
    const record = owner.files[name];
    assert(record && typeof record === "object" && !Array.isArray(record), `Invalid hash record: ${name}`);
    assert.deepEqual(Object.keys(record).sort(), ["bytes", "sha256"]);
    assert.match(record.sha256, /^[0-9a-f]{64}$/, `Invalid SHA-256: ${name}`);
    assert(Number.isSafeInteger(record.bytes) && record.bytes >= 0, `Invalid byte count: ${name}`);
    assert.deepEqual(await digest(localFile(name, owner.files)), record, `Deployed bytes changed: ${name}`);
    if (name.startsWith("assets/")) assetBytes += record.bytes;
  }
  assert.equal(owner.assetBytes, assetBytes, "Asset byte total differs from the complete hash manifest");
  t.diagnostic(`${names.length} payload files verified; ${assets.length} assets, ${assetBytes} asset bytes`);
});

test("System Override launches the standalone adapter first with no host SDK or private review harness", () => {
  const files = marker().files;
  const names = Object.keys(files);
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => match[1]);
  assert.equal(scripts[0], adapterName);
  assert.equal(scripts.filter((name) => name === adapterName).length, 1);
  for (const required of ["src/engine/sprite-playback.js", "src/core/runtime-lifecycle.js",
    "src/game/game-initializer.js", "src/game/main-new.js"]) {
    assert(scripts.includes(required), `Required runtime script is not launched: ${required}`);
  }
  for (const name of scripts) localFile(name, files);
  const runtimeNames = names.filter((name) => !name.startsWith("assets/"));
  for (const name of runtimeNames) {
    assert(["index.html", "style.css", "sprites-manifest.json"].includes(name) || /^src\/.+\.js$/.test(name),
      `Unexpected public runtime or review file: ${name}`);
    assert.doesNotMatch(name, /(?:^|[\/-])(?:private|local-review|browser-review|standalone-review|review-harness)(?:[.\/-]|$)/i);
    const source = read(name);
    assert.doesNotMatch(source, /vendorSDK|\/lib\/MakkoEngine\.min\.js|(?:PRIVATE_LOCAL_REVIEW|PRIVATE_REVIEW_HARNESS|standalone-review\.html|local-review\.html)/i,
      `Host SDK or private harness survived in ${name}`);
    assert.doesNotMatch(source, /raw\.githubusercontent\.com\/6-Bit-01\/BARCODE-SYSTEM-OVERRIDE\/|https?:\/\/[^\s/'"`]*makko\.ai(?:\/|\b)|supabase\.co\/storage\//i,
      `Remote runtime asset survived in ${name}`);
    assert.doesNotMatch(source, /["'`]\/assets\//, `Root-relative asset escaped the game directory in ${name}`);
    for (const match of source.matchAll(/https?:\/\/[^\s'"`<>]+/g)) {
      const url = match[0];
      // Traffic sourceUrl is inert original GIF provenance; Google Fonts remains intentional.
      assert(/^https?:\/\/www\.w3\.org\//.test(url) || /^http:\/\/localhost\//.test(url) ||
        name === "index.html" && url.startsWith("https://fonts.googleapis.com/") ||
        name === "src/engine/traffic-sheets.js" && /^https:\/\/i\.postimg\.cc\/(?:xj3VcRP3\/Ship1|T1LNxnfz\/Ship2|1zM9TVmz\/Ship3)\.gif$/.test(url),
      `Unexpected external runtime reference in ${name}: ${url}`);
    }
    if (name.endsWith(".js")) new vm.Script(source, { filename: name });
  }
  for (const match of html.matchAll(/<(?:script|link|img|audio|source)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
    localFile(match[1], files);
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: "index.html inline script" });
  }
});

test("System Override's actual sprite, presentation, music and ship registries resolve local package files", (t) => {
  const files = marker().files;
  const manifest = JSON.parse(read("sprites-manifest.json"));
  assert(manifest.characters && Object.keys(manifest.characters).length > 0);
  let animations = 0;
  for (const character of Object.values(manifest.characters)) {
    assert(character.animations && Object.keys(character.animations).length > 0);
    for (const animation of Object.values(character.animations)) {
      assert.match(animation.image, /^\.\/assets\/.+\.(?:webp|png)$/);
      assert.match(animation.json, /^\.\/assets\/.+\.json$/);
      localFile(animation.image, files);
      const sheet = JSON.parse(fs.readFileSync(localFile(animation.json, files), "utf8"));
      assert(sheet.frames && Object.keys(sheet.frames).length > 0, "Sprite animation has no frames");
      animations++;
    }
  }
  const init = context();
  init.window.MakkoEngine = { isLoaded: () => true, getManifest: () => manifest };
  load(init, "src/game/game-initializer.js");
  assert.equal(vm.runInContext("hasCurrentModelSprites()", init), true,
    "The shipped initializer must accept the shipped local sprite manifest");

  const presentationPaths = [];
  class LocalImage {
    set src(url) { localFile(url, files); presentationPaths.push(url); }
  }
  const presentation = context({ Image: LocalImage });
  load(presentation, "src/engine/presentation-assets.js");
  assert(presentationPaths.length > 0, "Production presentation registry did not preload artwork");

  const music = context();
  load(music, "src/engine/music-profiles.js");
  for (const name of ["src/engine/level-01-music-profile.js", "src/engine/cache-road-proof-profile.js",
    "src/engine/broadcast-slum-proof-profile.js"]) load(music, name);
  let musicSources = 0;
  for (const id of ["level-01.main", "level-02.proof", "level-03.proof"]) {
    const profile = music.window.BARCODE.MusicProfiles.get(id);
    assert(profile, `Production music profile did not register: ${id}`);
    assert.equal(music.window.BARCODE.MusicProfiles.validateProfile(profile).ok, true);
    assert(profile.arrangement.sources.length > 0);
    for (const source of profile.arrangement.sources) {
      localFile(source.url, files);
      assert.equal(source.backupUrl, undefined, `External or duplicate music backup survived: ${id}`);
      musicSources++;
    }
  }
  const traffic = context();
  load(traffic, "src/engine/traffic-sheets.js");
  assert.equal(traffic.window.BARCODE.trafficSheets.length, 3);
  for (const sheet of traffic.window.BARCODE.trafficSheets) {
    localFile(sheet.image, files);
    assert(sheet.frameCount > 1 && sheet.frameWidth > 0 && sheet.frameHeight > 0);
  }
  for (const name of ["index.html", "style.css"]) {
    for (const match of read(name).matchAll(/url\(\s*["']?([^\s'"()]+)["']?\s*\)/g)) {
      if (!match[1].startsWith("https://fonts.googleapis.com/")) localFile(match[1], files);
    }
  }
  t.diagnostic(`${animations} sprite animations, ${presentationPaths.length} presentation requests, ${musicSources} music sources and 3 animated ship atlases resolve locally`);
});

test("System Override preserves native 1920 by 1080 backing and the complete fitted viewport", () => {
  const html = read("index.html");
  const canvas = [...html.matchAll(/<canvas\b([^>]*)>/gi)].find((match) => /\bid=["']gameCanvas["']/.test(match[1]));
  assert(canvas, "Production game canvas is missing");
  assert.match(canvas[1], /\bwidth=["']1920["']/);
  assert.match(canvas[1], /\bheight=["']1080["']/);
  const viewport = [...html.matchAll(/<style\b[^>]*\bid=["']standalone-viewport-style["'][^>]*>([\s\S]*?)<\/style>/gi)];
  assert.equal(viewport.length, 1, "Generated viewport override must have one owner");
  const stylesheet = html.match(/<link\b[^>]*\bhref=["'](?:\.\/)?style\.css["'][^>]*>/i);
  assert(stylesheet, "The canonical source stylesheet must be included");
  assert(stylesheet.index < viewport[0].index, "Viewport correction must follow the source stylesheet");
  const css = viewport[0][1];
  const container = css.match(/\.game-container\s*\{([^}]+)\}/)[1];
  assert.match(container, /position:\s*fixed/);
  assert.match(container, /inset:\s*0/);
  assert.match(container, /display:\s*block/);
  assert.match(container, /flex:\s*none/);
  const game = css.match(/#gameCanvas\s*\{([^}]+)\}/)[1];
  assert.match(game, /position:\s*absolute/);
  assert.match(game, /left:\s*50%/);
  assert.match(game, /top:\s*50%/);
  assert.match(game, /transform:\s*translate\(-50%,\s*-50%\)/);
  assert.match(game, /width:\s*min\(100vw,\s*177\.777778vh\)/);
  assert.match(game, /height:\s*min\(100vh,\s*56\.25vw\)/);
  assert.match(game, /max-width:\s*none/);
  assert.match(game, /max-height:\s*none/);
  assert.match(game, /flex:\s*none/);
  assert.match(game, /border:\s*0/);
  assert.match(game, /image-rendering:\s*auto/);
  assert.doesNotMatch(game, /(?:^|;)\s*display\s*:/, "Runtime owners must retain control of canvas visibility");
  const descriptions = css.match(/\.game-container\s*>\s*\.topbar\s*,\s*\.game-container\s*>\s*\.hint\s*\{([^}]+)\}/)[1];
  assert.match(descriptions, /display:\s*block\s*!important/);
  assert.match(descriptions, /width:\s*1px\s*!important/);
  assert.match(descriptions, /height:\s*1px\s*!important/);
  assert.match(descriptions, /clip-path:\s*inset\(50%\)\s*!important/);
  assert.doesNotMatch(read("src/engine/renderer.js"), /devicePixelRatio/,
    "The renderer must retain its native backing dimensions");
});
