import test from "node:test";
import sharp from "sharp";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadFightArt, loadArcadeArt, loadDeletionArt, loadWeaponArt, combatMetadata } from "../public/games/system-clash/play/fight-assets.mjs";

import {loadRemainsArt} from "../public/games/system-clash/play/fight-remains.mjs";

const root = fileURLToPath(new URL("../public/games/system-clash/play/", import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const roster = JSON.parse(read("assets/fight-roster.json")).fighters;
const inventory = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name)).replaceAll("\\", "/"));

test("System Clash ships only its same-origin runtime, with complete registered art", async () => {
  assert.equal(roster.length, 17);
  assert(roster.every(fighter => fighter.enabled));
  assert.equal(inventory.filter(name => name.endsWith(".png")).length, 211);
  assert(inventory.every(name => /\.(?:png|webp|svg|json|html|css|m?js|wav|mp3)$/.test(name)));
  assert(inventory.every(name => !/qa\.json|measured|native-bounds|prompt|rejected|portable|history/i.test(name)));
  for (const name of inventory.filter(name => /\.(?:json|html)$/.test(name))) {
    assert.doesNotMatch(read(name), /generated_images|originalPath|\.prompt\.txt|127\.0\.0\.1|localhost|SYSTEM-CLASH-Portable|SYSTEM-CLASH-Fight-Portable/i, name);
  }

  const requests = new Set();
  const baseURL = "https://www.barcode-network.com/games/system-clash/play/fight.html";
  const local = value => {
    const url = new URL(value, baseURL);
    assert.equal(url.origin, "https://www.barcode-network.com");
    assert(url.pathname.startsWith("/games/system-clash/play/"));
    const name = decodeURIComponent(url.pathname.slice("/games/system-clash/play/".length));
    assert(inventory.includes(name), "Missing runtime file: " + name);
    requests.add(name);
    return path.join(root, name);
  };
  const oldFetch = globalThis.fetch, oldImage = globalThis.Image;
  globalThis.fetch = async value => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(local(value), "utf8")) });
  globalThis.Image = class {
    set src(value) {
      const buffer = fs.readFileSync(local(value));
      assert(buffer.subarray(0,8).toString("hex")==="89504e470d0a1a0a" || buffer.toString("ascii",0,4)==="RIFF" && buffer.toString("ascii",8,12)==="WEBP", "PNG or WebP runtime asset");
      sharp(buffer).metadata().then(metadata=>{this.width=metadata.width;this.height=metadata.height;this.onload();}).catch(error=>this.onerror(error));
    }
  };
  try {
    const art = await loadFightArt({ baseURL, ids: roster.map(fighter => fighter.id) });
    await loadArcadeArt({ baseURL, art });
    await loadDeletionArt({ baseURL, art });
    const weapons = await loadWeaponArt({ baseURL });
    const remains = await loadRemainsArt({baseURL});
    assert.equal(remains.manifest.anonymous,true);
    assert.equal(remains.manifest.standingStages.length,4);
    assert.equal(combatMetadata(art, weapons).length, roster.length);
    for (const fighter of art) {
      for (const asset of Object.values(fighter.clips)) {
        if (!asset.data.sourceSha256) continue;
        const bank = Object.values(fighter.arcadeManifest.clips).includes(asset.data) ? "arcade"
          : Object.values(fighter.deletionManifest.clips).includes(asset.data) ? "deletions" : "fighters";
        const file = path.join(root, "assets", bank, fighter.manifest.id, asset.data.file);
        assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), asset.data.sourceSha256);
      }
    }
    const replacedOriginals = new Set(),approvedNativeSources=new Set();
    for(const name of inventory.filter(name=>/^assets\/(?:fighters|arcade|deletions)\/[^/]+\/manifest\.json$/.test(name))){for(const clip of Object.values(JSON.parse(read(name)).clips)){const file=clip.animationPolish?.approvedFile;if(!file||!file.endsWith(".webp")||file===clip.file)continue;const original=path.posix.join(path.posix.dirname(name),file);assert(inventory.includes(original),"Approved native source remains present: "+original);assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root,original))).digest("hex").slice(0,16),clip.sourceRevision,"Original native source bytes stay unchanged");approvedNativeSources.add(original);}}
    for (const name of inventory.filter(name => /^assets\/(?:fighters|arcade)\/[^/]+\/manifest\.json$/.test(name))) {
      for (const clip of Object.values(JSON.parse(read(name)).clips)) {
        if (!clip.runtimeFile) continue;
        const original = path.posix.normalize(path.posix.join(path.posix.dirname(name), clip.file));
        const served = path.posix.normalize(path.posix.join(path.posix.dirname(name), clip.runtimeFile));
        assert(inventory.includes(original), "Approved source remains present: " + original);
        assert(requests.has(served), "Replacement atlas was not loaded: " + served);
        assert(!requests.has(original), "Hosted loading should prefer the optimized atlas: " + original);
        replacedOriginals.add(original);
      }
    }
    const images = new Set([...requests].filter(name => name.endsWith(".png")));
    assert.deepEqual([...images].sort(), inventory.filter(name => name.endsWith(".png") && name !== "assets/whole-body/punch.png" && !replacedOriginals.has(name)).sort());
    // Preserve the approved original Oak tear source; only its reviewed replacement loads.
    const retainedOakSource="assets/deletions/papa-oak/rip.webp";
    assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root,retainedOakSource))).digest("hex"),"cb907934f502329fba35602a8c8230cd916e7404434159dbda63aad72c3e3053");
    const oakRip=JSON.parse(read("assets/deletions/papa-oak/manifest.json")).clips.rip;
    assert.equal(oakRip.file,"rip-opposed-v1.webp");
    assert(requests.has("assets/deletions/papa-oak/"+oakRip.file),"The reviewed opposed-palm atlas must load");
    assert(!requests.has(retainedOakSource),"Retained original tear pixels do not add a second runtime download");
    // Retain the approved original Doof walk while loading its reviewed four-phase replacement.
    const retainedDoofWalk='assets/fighters/doofnoobler/walk.webp';
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,retainedDoofWalk))).digest('hex'),'95f004aa0fd89074e9d528ba9bd4a049f4babcd3ec36ee4fe3043df5188de6b8');
    const doofWalk=JSON.parse(read('assets/fighters/doofnoobler/manifest.json')).clips.walk;
    assert.equal(doofWalk.file,'walk-native-v2.webp');
    assert(requests.has('assets/fighters/doofnoobler/'+doofWalk.file),'Reviewed four-phase walk must load');
    assert(!requests.has(retainedDoofWalk),'Retained original walk does not add a runtime download');
    for(const name of inventory.filter(name=>/^assets\/(?:animation-polish|fighters|arcade|deletions)\/.+\.webp$/.test(name)&&name!==retainedOakSource&&name!==retainedDoofWalk&&!approvedNativeSources.has(name)))assert(requests.has(name),"Registered atlas was not loaded: "+name);
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.Image = oldImage;
  }
});

test("System Clash module imports and standalone document stay complete", () => {
  for (const name of inventory.filter(name => /\.(?:js|mjs)$/.test(name))) {
    const syntax = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
    assert.equal(syntax.status, 0, name + "\n" + syntax.stderr);
    for (const match of read(name).matchAll(/^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm)) {
      assert(match[1].startsWith("./"), "External game module: " + match[1]);
      const resolved = path.relative(root, path.resolve(root, match[1])).replaceAll("\\", "/");
      assert(inventory.includes(resolved), "Missing module: " + resolved);
    }
  }
  const html = read("fight.html");
  assert.match(html, /<script type="module" src="fight\.js"/);
  assert.match(html, /href="fight\.css"/);
  assert.match(html, /href="\/games\/system-clash"/);
  assert.doesNotMatch(html, /artwork-library|Art prompt|Exact prompts|Concept sheets/i);
  assert(html.indexOf('class="screen-bezel"') < html.indexOf('class="touch-controls"'), "The game stage must appear before its onscreen control pad");
  assert.doesNotMatch(read("fight.css"), /max-width:calc\(\(100dvh/);
  assert.doesNotMatch(read("fight.js"), /fetch\(['"]\/save-frame['"]/);
  assert.match(read("fight.js"), /link\.download='SYSTEM-CLASH-fight-'/);
});


test('hosted startup tolerates the deliberately omitted private pose-library lists', () => {
  const source = read('fight.js');
  const start = source.indexOf('for(const [role,poses] of Object.entries(DELETION_POSES))');
  const end = source.indexOf('async function initializeRoster()', start);
  assert(start >= 0 && end > start, 'Production pose-list initialization exists');
  const initialize = new Function('DELETION_POSES', '$', 'document', source.slice(start, end));
  assert.doesNotThrow(() => initialize(
    { attacker: [{ name: 'native action', uses: 'action' }], victim: [{ name: 'native reaction', uses: 'reaction' }] },
    () => null,
    { createElement: () => ({ innerHTML: '' }) },
  ));
});


test("demo portraits and standing art decode for every playable fighter without future placeholders", async () => {
  const { default: sharp } = await import("sharp");
  const menu = JSON.parse(read("assets/menu/roster.json"));
  assert.deepEqual(menu.fighters.map(f => [f.id, f.name]), roster.map(f => [f.id, f.name]));
  assert.equal(inventory.filter(name => name.startsWith("assets/menu/")).length, roster.length * 4 + 3);
  for (const fighter of menu.fighters) {
    for (const [kind, expected] of [["portrait", [256, 256]], ["standing", fighter.standingSize ?? [320, 440]]]) {
      const name = fighter[kind];
      assert.match(name, /^assets\/menu\/[a-z0-9-]+\.webp$/);
      assert(inventory.includes(name));
      const { data, info } = await sharp(path.join(root, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height], expected, name);
      assert.equal(info.channels, 4);
      let visible = 0, transparent = 0;
      for (let i = 3; i < data.length; i += 4) { if (data[i] > 0) visible++; else transparent++; }
      assert(visible > 1000 && transparent > 1000, name + " retains an actual transparent fighter image");
    }
  }
  const logo = read("assets/menu/system-clash-logo.svg");
  assert.doesNotMatch(logo, /<text(?:\s|>)/);
  assert.doesNotMatch(logo, /(?:href|src)=["']https?:/);
});
