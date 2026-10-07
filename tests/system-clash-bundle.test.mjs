import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { loadFightArt, loadArcadeArt, loadDeletionArt, loadWeaponArt, combatMetadata } from "../public/games/system-clash/play/fight-assets.mjs";

const root = fileURLToPath(new URL("../public/games/system-clash/play/", import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const roster = JSON.parse(read("assets/fight-roster.json")).fighters;
const inventory = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => path.relative(root, path.join(entry.parentPath ?? entry.path, entry.name)).replaceAll("\\", "/"));

test("System Clash ships only its same-origin runtime, with complete registered art", async () => {
  assert.equal(roster.length, 13);
  assert(roster.every(fighter => fighter.enabled));
  assert.equal(inventory.filter(name => name.endsWith(".png")).length, 211);
  assert(inventory.every(name => /\.(?:png|json|html|css|m?js)$/.test(name)));
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
      assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      this.width = buffer.readUInt32BE(16);
      this.height = buffer.readUInt32BE(20);
      queueMicrotask(() => this.onload());
    }
  };
  try {
    const art = await loadFightArt({ baseURL, ids: roster.map(fighter => fighter.id) });
    await loadArcadeArt({ baseURL, art });
    await loadDeletionArt({ baseURL, art });
    const weapons = await loadWeaponArt({ baseURL });
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
    const images = new Set([...requests].filter(name => name.endsWith(".png")));
    assert.deepEqual([...images].sort(), inventory.filter(name => name.endsWith(".png")).sort());
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
  assert.doesNotMatch(read("fight.js"), /fetch\(['"]\/save-frame['"]/);
  assert.match(read("fight.js"), /link\.download='SYSTEM-CLASH-fight-'/);
});

