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
  assert.equal(roster.length, 18);
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
    const replacedOriginals = new Set(),approvedNativeSources=new Set(),retainedSources=new Set();
    // Approved leather atlases stay byte-exact as retained sources; Rogers is the selected main skin.
    const retainedAshLeather = {
      "assets/animation-polish/ash-flowers/punch.webp": "52e02b8bb3fd4aad354c74ae183eb73907f2b39a6ddb1d6898b531fe9057199b",
      "assets/arcade/ash-flowers/air-uppercut-v2.png": "7a8a5b78a35f7d30c444ca92700284c9b5535c1eb1d97ec089fc48305bd14588",
      "assets/arcade/ash-flowers/air-uppercut-v2.runtime.webp": "5f0b766daea8574cf0916891b9b394f817f88ecb38464342e80313f68f9f1644",
      "assets/arcade/ash-flowers/contextual-attacks-v1.png": "23c9df96474d4693ff01d316fa543aadcdb6300d85f2dee5abf859661c1e8428",
      "assets/arcade/ash-flowers/contextual-attacks-v1.runtime.webp": "efe6532e9c3a1dafec4152544bbffe082275e3c8adfcbe3bdebb8cdf1eaeac83",
      "assets/arcade/ash-flowers/crouch-combos-v1.png": "ea767dc07b01dd86d6828dd873638b418be4bb73f022150beca4d8203bf9a960",
      "assets/arcade/ash-flowers/crouch-combos-v1.runtime.webp": "1c9d0a50b545629ee17f00fd563f32e9d71c8ae790c63a6bc076e8c34df1b3c5",
      "assets/arcade/ash-flowers/crouch-punch-smooth-v2.webp": "00f083a53533845534eb8a95e7a5257f7ca6d638e12c790c7370cb63687a3821",
      "assets/arcade/ash-flowers/jump-kick-smooth-v2.webp": "1d6bf5c05bb291da1b4a95b0f565466cc334c9f57a56bbef51124d34dc8889f8",
      "assets/arcade/ash-flowers/low-attacks-v2.png": "547b583fb01ec6fe650ad9b67abeaedc0b6af7193cdf63ffa3f39ce88a583777",
      "assets/arcade/ash-flowers/low-attacks-v2.runtime.webp": "53d358298004cce47357f43e61321eb0ab00c9910964e3b1f1c7cbace4596d82",
      "assets/arcade/ash-flowers/power-kick-v2.png": "2c9c51a809f1e24d073ecb5dd51ae8f430ae0f8483636703cd21d3f283b6c486",
      "assets/arcade/ash-flowers/power-kick-v2.runtime.webp": "c5714f7924f8e3781fbc3e79601f1521b5997c03b04ca568843b91326d12e4c7",
      "assets/arcade/ash-flowers/weapon-pickup-v1.png": "2d0b3f3874c89c9fa6bf850ca97c205fe47db536e69e3248d393df37fcce9707",
      "assets/arcade/ash-flowers/weapon-pickup-v1.runtime.webp": "b3e51537906adf708606e839b2ab8eca7196d40b2ac975995965ecfc711dee02",
      "assets/deletions/ash-flowers/attacker-poses-v1.png": "00f0ddd2140d7c586b31409d7716fa5a11e8cde53e3ad7a87649057b483df80e",
      "assets/deletions/ash-flowers/positivity-cast-v1.png": "084e0a37fbc7348a0304943e500ecaceacc8920723cc3690dc4499373c98b97f",
      "assets/deletions/ash-flowers/victim-front-lift-airborne-sheet-v1.webp": "212c215da97dd49ac60649a10ed2b194dffa129708220833a24e1a5f50695175",
      "assets/deletions/ash-flowers/victim-poses-v1.png": "86006b08ae88cca5b6b7cd9dd5afaefe5042c6c53f2b5e0e0133f6781a6c33c8",
      "assets/fighters/ash-flowers/combat.png": "ebbc9e09a2ec31a68eb301a19d6f6e03b820379e9b956ca19518cb5e43976a36",
      "assets/fighters/ash-flowers/combat.runtime.webp": "c15816bc4a104ae524362aaacfa3ac67d6aa595d052ef4686c3521eb86fe08ad",
      "assets/fighters/ash-flowers/defense-kick.png": "de971d824be2a925f5485c36936684199b45b2b1d539f085d54355e63a992539",
      "assets/fighters/ash-flowers/defense-kick.runtime.webp": "24a14a0222b0ca10662fa79b7259bfc5db9ae8e16576cf4af5a78e535926bbec",
      "assets/fighters/ash-flowers/floor.png": "6e7601aa53928bed056446fa771dfe5b4a658dd357ace6a1fa0a1520d91fc221",
      "assets/fighters/ash-flowers/floor.runtime.webp": "35eccde0092839c38dd3f32cb9e113731b12fb632c3713824dfe7284deb06ef4",
      "assets/fighters/ash-flowers/grab-low-native-v2.webp": "e83a00bfebb3154e0ce786cdce78675c90d8d6e7d6f3a8cfb98802494fa875fd",
      "assets/fighters/ash-flowers/grab-native-v2.webp": "e746ff7fe618a0967fdf8fc0f0014a145e0ed30b5df11ca8b208c21aeb508d8c",
      "assets/fighters/ash-flowers/hurt-v2.png": "7367c774b7a1dc8d80642b1b628fc0c9f17bee4a2a1fe531d86a12b3ffeea375",
      "assets/fighters/ash-flowers/hurt-v2.runtime.webp": "6ce9ece2dbf67bf3b2ca606cc87ab9dde112efff8fc389b7800807b5f159ce73",
      "assets/fighters/ash-flowers/movement-v2.png": "582ef4f8d8fc49ccedf12322e6e3915b767f2c7624fc565bcdaff4330936791e",
      "assets/fighters/ash-flowers/movement-v2.runtime.webp": "0359812525a0ffbf6de4c87886c9ac5876f45936bbf0b78e48bc50082711e97d",
      "assets/fighters/ash-flowers/restraints.png": "8e19b434b39df4b093e51341d2aeef41ba99ef76d99978e1cd686ec42eec66b2",
      "assets/fighters/ash-flowers/restraints.runtime.webp": "d7443c818335f98960c8aec8c097d3f9ec5744b37f2f7fad4144a4e198302e66",
      "assets/fighters/ash-flowers/walk-smooth-v3.webp": "14846b13be4600c5df1de3f161feec5cf02db38fabe7bb357edb8daba14b4e75"
    };
    for(const [name,sha256] of Object.entries(retainedAshLeather)){assert(inventory.includes(name),"Retained approved Ash source: "+name);assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root,name))).digest("hex"),sha256,"Retained Ash pixels remain unchanged");assert(!requests.has(name),"Old leather art must not add a runtime download: "+name);retainedSources.add(name);}
    for(const id of ["ms-mayhem","papa-oak"]){const walk=JSON.parse(read("assets/fighters/"+id+"/manifest.json")).clips.walk;assert.equal(walk.registrationRepair?.kind,"restore-approved-native-walk-chronology");const retained=walk.registrationRepair.retainedPolishClip;assert.equal(retained.file,"walk-smooth-v3.webp");const name="assets/fighters/"+id+"/"+retained.file;assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root,name))).digest("hex"),retained.sourceSha256,"Retained transition source stays unchanged");assert(!requests.has(name),"Restored approved walk does not load the rejected transition: "+name);retainedSources.add(name);}
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
    assert.deepEqual([...images].sort(), inventory.filter(name => name.endsWith(".png") && name !== "assets/whole-body/punch.png" && !replacedOriginals.has(name) && !retainedSources.has(name)).sort());
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
    for(const name of inventory.filter(name=>/^assets\/(?:animation-polish|fighters|arcade|deletions)\/.+\.webp$/.test(name)&&name!==retainedOakSource&&name!==retainedDoofWalk&&!approvedNativeSources.has(name)&&!retainedSources.has(name)))assert(requests.has(name),"Registered atlas was not loaded: "+name);
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
