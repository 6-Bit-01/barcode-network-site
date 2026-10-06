import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { inflateSync } from "node:zlib";

const bundleRoot = path.resolve(fileURLToPath(new URL("../public/games/system-override/", import.meta.url)));
const markerName = ".standalone-build.json";
const adapterName = "src/engine/standalone-sprites.js";
const vendorRoot = "src/vendor/pixi-8.22.0/";
const basisRoot = "src/vendor/basis-2.50/";
const textureRoot = "assets/cache-road/gpu-textures/";
const textureManifestName = textureRoot + "manifest.json";
const originalAssetCount = 624;
const macReviewRoot = "assets/mac-street-review/";
const macReviewAssets = new Set([
  "cache-walk-to-car-v6.png", "mac-hero-v2.png", "mac-poses-v3-frames.json", "mac-poses-v3.png",
  "scene03-kave-dead-air-v5.png", "scene05-margin-note-v1.png",
  "scene06-record-straight-v1.png", "street-panorama-v1.png",
].map((name) => macReviewRoot + name));
const cityRoot = "assets/mac-city-review/";
const cityKinds = ["chitin_scuttler", "psion_lancer", "bile_spitter", "prism_guard", "rift_stalker", "shock_mantid", "null_regent"];
const cityVersion = (kind) => ["psion_lancer", "shock_mantid", "null_regent"].includes(kind) ? "v2" : "v1";
const cityZones = ["service-alley", "night-market", "transit-concourse", "relay-canal", "rooftop-relay", "broadcast-plaza"];
const cityAssets = new Set([
  ...cityKinds.flatMap((kind) => [kind + "-" + cityVersion(kind) + ".png", kind + "-" + cityVersion(kind) + "-frames.json"]),
  ...cityZones.map((zone) => zone + "-v1.png"),
  "mac-city-art-v1.json", "mac-attacks-v4.png", "mac-attacks-v4-frames.json",
].map((name) => cityRoot + name));
const rigRoot = "assets/mac-combat-rigs/";
const rigActors = ["mac", ...cityKinds];
const rigStem = (kind) => kind === "mac" ? "mac-modem-v2" : kind + "-v1";
const rigAssets = new Set(["mac-combat-art-v1.json", ...rigActors.flatMap((kind) => [rigStem(kind) + ".png", rigStem(kind) + "-rig.json"])].map((name) => rigRoot + name));
// Sorted [path, bytes, SHA-256] rows from the original complete 624-asset package.
// Compressed derivatives may be added; every original identity and byte hash remains pinned.
const originalAssetInventorySHA256 = "0b2ac58dc88ddb68b595fb8592d242d8478c426d78309fe4ff45b88c04027f56";
const encoderCommit = "4d6fc70eaf62ad0558e63e8d97eb9766118327a6";
const transcoderCommit = "9bebe16726b3a61c8c213eeee3b7cffb462ef34e";
const vendorHashes = {
  "pixi.min.js": "06d9ef9823e743518793083c296d801e752db128cb1f519fbabe37e1259567ea",
  "LICENSE": "5ce7447bc57f7349ffc48338782fbcabe613696e00712b20d66bc58e780f9473",
  "provenance.json": "a5c6a646c2b1b37cbd65356d0475474d9b307910a8d888f8885918d860032075",
};
const vendorReferences = {
  "pixi.min.js": new Set([
    "http://www.opensource.org/licenses/mit-license", "http://www.pixijs.com/",
    ...["basis/basis_transcoder.js", "basis/basis_transcoder.wasm", "ktx/libktx.js", "ktx/libktx.wasm"]
      .map((name) => "https://cdn.jsdelivr.net/npm/pixi.js/transcoders/" + name),
  ]),
  "provenance.json": new Set([
    "https://github.com/pixijs/pixijs/releases/tag/v8.22.0",
    "https://registry.npmjs.org/pixi.js/-/pixi.js-8.22.0.tgz",
  ]),
};
const basisHashes = {
  "basis_transcoder.js": "720dd9bd09c7cada6d87f1b7b70cec713df04da88cd641ac3212559353834dc8",
  "basis_transcoder.wasm": "a0f65d4a30ecb3269d01ead7d0a3477d2b0208146d083625a90623f473f6c139",
  "LICENSE": "065fcf48d6af21c0b75e23be5ed5753aee75c892e1c2cf178fa6736305614a5c",
  "provenance.json": "49c856c675a79368ecc76e356eec90ce7aa87bf2f1da302cf51aa1f647fa03ed",
};
const basisReferences = {
  "LICENSE": new Set(["http://www.apache.org/licenses/", "http://www.apache.org/licenses/LICENSE-2.0"]),
  "provenance.json": new Set(["https://github.com/BinomialLLC/basis_universal/releases/tag/v2_50"]),
};
const read = (name) => fs.readFileSync(path.join(bundleRoot, name), "utf8");
const marker = () => JSON.parse(read(markerName));

function textureManifest() {
  const value = JSON.parse(read(textureManifestName));
  assert.equal(value.version, 1);
  assert.equal(value.encoderCommit, encoderCommit);
  assert.equal(value.transcoderCommit, transcoderCommit);
  assert.equal(value.alphaMode, "premultiplied-alpha");
  assert.equal(value.colorSpace, "unorm");
  assert.equal(value.sourceCount, 171);
  assert.equal(value.compressedCount, 149);
  assert.equal(value.originalCount, 22);
  assert(value.entries && typeof value.entries === "object" && !Array.isArray(value.entries));
  assert.equal(Object.keys(value.entries).length, 171, "The complete road texture bank must contain 171 originals");
  return value;
}

function derivativeNames(value = textureManifest()) {
  const names = [textureManifestName];
  for (const [key, entry] of Object.entries(value.entries)) {
    assert.match(key, /^[A-Za-z0-9_.-]+$/);
    assert(["compressed", "original"].includes(entry.kind), `Invalid texture ownership kind: ${key}`);
    if (entry.kind === "compressed") {
      assert.equal(entry.path, textureRoot + key + ".ktx2", "Derivative path must match its original PA key");
      names.push(entry.path);
    } else assert.equal(entry.path, entry.originalPath, "Original SVG textures must retain their canonical file");
  }
  assert.equal(names.length, 150, "Only 149 KTX2 derivatives and their manifest may be added");
  assert.equal(Object.values(value.entries).filter((entry) => entry.kind === "original").length, 22);
  assert.equal(new Set(names).size, names.length, "Texture derivatives must have unique ownership");
  return new Set(names);
}

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

function header(file, size) {
  const fd = fs.openSync(file, "r");
  try {
    const data = Buffer.alloc(Math.min(size, fs.fstatSync(fd).size));
    assert.equal(fs.readSync(fd, data, 0, data.length, 0), data.length);
    return data;
  } finally { fs.closeSync(fd); }
}

function originalDimensions(file) {
  const data = header(file, 65536);
  if (path.extname(file) === ".svg") {
    const svg = data.toString("utf8").match(/<svg\b([^>]*)>/i);
    assert(svg, "An original SVG must contain its authored viewport");
    const width = svg[1].match(/\bwidth=["']([0-9.]+)(?:px)?["']/i);
    const height = svg[1].match(/\bheight=["']([0-9.]+)(?:px)?["']/i);
    if (width && height) return [Number(width[1]), Number(height[1])];
    const box = svg[1].match(/\bviewBox=["']([^"']+)["']/i);
    assert(box, "An original SVG must declare dimensions or viewBox");
    const dimensions = box[1].trim().split(/[\s,]+/).map(Number);
    assert.equal(dimensions.length, 4);
    assert(dimensions.every(Number.isFinite));
    return dimensions.slice(2);
  }
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    assert.equal(data.toString("ascii", 12, 16), "IHDR");
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    for (let offset = 12; offset + 8 <= data.length;) {
      const kind = data.toString("ascii", offset, offset + 4), size = data.readUInt32LE(offset + 4), start = offset + 8;
      if (kind === "VP8X") return [1 + data.readUIntLE(start + 4, 3), 1 + data.readUIntLE(start + 7, 3)];
      if (kind === "VP8L") {
        assert.equal(data[start], 0x2f);
        const bits = data.readUInt32LE(start + 1);
        return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
      }
      if (kind === "VP8 ") {
        assert(data.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a])));
        return [data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff];
      }
      offset = start + size + (size & 1);
    }
  }
  assert.fail(`The original texture dimension header is unsupported: ${path.basename(file)}`);
}

function nativeRigRGBA(data, name) {
  assert(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Native rig PNG required: ${name}`);
  let width = 0, height = 0;
  const chunks = [];
  for (let offset = 8; offset + 12 <= data.length;) {
    const length = data.readUInt32BE(offset), kind = data.toString('ascii', offset + 4, offset + 8), start = offset + 8;
    assert(start + length + 4 <= data.length, `Truncated PNG chunk: ${name}`);
    if (kind === 'IHDR') {
      assert.equal(length, 13);
      width = data.readUInt32BE(start); height = data.readUInt32BE(start + 4);
      assert(width > 0 && height > 0);
      assert(data.subarray(start + 8, start + 13).equals(Buffer.from([8, 6, 0, 0, 0])), `Rig must retain native noninterlaced RGBA8: ${name}`);
    }
    if (kind === 'IDAT') chunks.push(data.subarray(start, start + length));
    offset = start + length + 4;
    if (kind === 'IEND') break;
  }
  assert(width && height && chunks.length, `Incomplete PNG: ${name}`);
  const stride = width * 4, expected = (stride + 1) * height;
  const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: expected });
  assert.equal(raw.length, expected, `RGBA scanline size: ${name}`);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1), target = y * stride, mode = raw[row];
    assert(mode >= 0 && mode <= 4, `PNG filter: ${name}`);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[target + x - 4] : 0;
      const b = y ? pixels[target + x - stride] : 0;
      const c = y && x >= 4 ? pixels[target + x - stride - 4] : 0;
      let predictor = 0;
      if (mode === 1) predictor = a;
      if (mode === 2) predictor = b;
      if (mode === 3) predictor = Math.floor((a + b) / 2);
      if (mode === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[target + x] = (raw[row + 1 + x] + predictor) & 255;
    }
  }
  assert(pixels.some((value, index) => index % 4 === 3 && value < 255), `Native transparency lost: ${name}`);
  return { width, height, pixels };
}

function verifyArticulatedBank(bytes, files, root, actors, assets, digest) {
  assert.equal(assets.size, 17);
  assert.deepEqual(Object.keys(files).filter((name) => name.startsWith(root)).sort(), [...assets].sort(), 'Complete selected rig directory required');
  const bank = JSON.parse(bytes(root + 'mac-combat-art-v1.json').toString('utf8'));
  assert.equal(bank.schemaVersion, 1);
  assert.deepEqual([...bank.files].sort(), [...assets].sort(), 'Manifest must declare exactly 17 selected siblings');
  assert.equal(bank.actors.length, 8);
  assert.deepEqual(bank.actors.map((actor) => actor.kind).sort(), [...actors].sort(), 'Mac plus the exact seven alien roles required');
  const colors = { mac: 'red', chitin_scuttler: 'green', psion_lancer: 'purple', bile_spitter: 'green', prism_guard: 'purple', rift_stalker: 'purple', shock_mantid: 'green', null_regent: 'purple' };
  const bloodHex = { red: '#f04455', green: '#78ea68', purple: '#b374ed' };
  const base = ['head', 'torso', 'pelvis', ...['rear', 'front'].flatMap((side) => ['upper_arm', 'forearm', 'fist', 'thigh', 'shin', 'shoe'].map((part) => side + '_' + part))];
  const chains = {};
  for (const side of ['rear', 'front']) for (const [part, a, b] of [['upper_arm', 'shoulder', 'elbow'], ['forearm', 'elbow', 'wrist'], ['thigh', 'hip', 'knee'], ['shin', 'knee', 'ankle']]) chains[side + '_' + part] = [side + '_' + a, side + '_' + b];
  for (const side of ['a', 'b']) {
    chains['extra_upper_arm_' + side] = ['extra_shoulder_' + side, 'extra_elbow_' + side];
    chains['extra_forearm_' + side] = ['extra_elbow_' + side, 'extra_wrist_' + side];
  }
  const point = (value) => value && Number.isFinite(value.x) && Number.isFinite(value.y);
  const close = (a, b, label) => assert(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.001, `Measured rig geometry differs: ${label}`);
  const registrations = [];
  for (const actor of bank.actors) {
    const kind = actor.kind, stem = kind === 'mac' ? 'mac-modem-v2' : kind + '-v1';
    const image = root + stem + '.png', rigName = root + stem + '-rig.json';
    assert.equal(actor.image, image); assert.equal(actor.rig, rigName);
    const imageBytes = bytes(image), rigBytes = bytes(rigName);
    assert.equal(actor.imageSHA256, digest(imageBytes)); assert.equal(actor.imageSHA256, files[image].sha256);
    assert.equal(actor.rigSHA256, digest(rigBytes)); assert.equal(actor.rigSHA256, files[rigName].sha256);
    assert.equal(actor.bloodColor, colors[kind]); assert.equal(actor.bloodHex, bloodHex[colors[kind]], 'Selected palette must match actual combat damage colors');
    assert.equal(typeof actor.displayName, 'string'); assert(actor.displayName.trim());
    const native = nativeRigRGBA(imageBytes, image), rig = JSON.parse(rigBytes.toString('utf8'));
    assert.equal(rig.schemaVersion, 1); assert.equal(rig.actor, kind); assert.equal(rig.sourceImage, image);
    assert.equal(rig.sourceSHA256, digest(imageBytes)); assert.deepEqual(rig.sourceDimensions, {width: native.width, height: native.height});
    assert.equal(rig.facing, 'right'); assert.equal(rig.commonScale, 1); assert.deepEqual(rig.groundOrigin, {x: 0, y: 0});
    const expectedParts = [...base, ...(kind === 'null_regent' ? ['a', 'b'].flatMap((side) => ['upper_arm', 'forearm', 'fist'].map((part) => 'extra_' + part + '_' + side)) : [])];
    assert.equal(rig.parts.length, expectedParts.length);
    assert.deepEqual(rig.parts.map((part) => part.id).sort(), expectedParts.sort(), 'Exact 15/21 anatomical pieces required');
    const parts = Object.fromEntries(rig.parts.map((part) => [part.id, part])), rest = rig.restSkeleton;
    assert(rest && Object.values(rest).every(point));
    const assembled = {left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity};
    for (const part of rig.parts) {
      const label = kind + '/' + part.id, crop = part.source, visible = part.visibleBounds;
      for (const rect of [crop, visible]) for (const key of ['x', 'y', 'width', 'height']) assert(Number.isSafeInteger(rect[key]) && rect[key] >= (['width', 'height'].includes(key) ? 1 : 0), `Measured bounds: ${label}`);
      assert(crop.x + crop.width <= native.width && crop.y + crop.height <= native.height, `Crop escapes bitmap: ${label}`);
      let left = crop.width, top = crop.height, right = -1, bottom = -1;
      const alpha = (x, y) => native.pixels[((crop.y + y) * native.width + crop.x + x) * 4 + 3];
      for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) if (alpha(x, y) > 8) {
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      assert(right >= left && bottom >= top, `Empty anatomical piece: ${label}`);
      assert.deepEqual(visible, {x: left, y: top, width: right - left + 1, height: bottom - top + 1}, `Bounds must match actual native alpha>8: ${label}`);
      const caps = [part.pivot, ...Object.values(part.anchors || {}), ...(chains[part.id] ? [part.distal] : [])];
      for (const cap of caps) {
        assert(point(cap) && Number.isSafeInteger(cap.x) && Number.isSafeInteger(cap.y) && cap.x >= 0 && cap.y >= 0 && cap.x < crop.width && cap.y < crop.height, `Native joint cap: ${label}`);
        assert(alpha(cap.x, cap.y) > 8, `Joint cap outside actual opaque piece: ${label}`);
      }
      assert.equal(part.restScale ?? 1, 1, `Per-piece scaling stretches anatomy: ${label}`);
      if (chains[part.id]) {
        const length = Math.hypot(part.distal.x - part.pivot.x, part.distal.y - part.pivot.y);
        assert(Number.isFinite(part.boneLength) && part.boneLength > 0);
        close(part.boneLength, length, label + '/source length');
        const [a, b] = chains[part.id]; assert(point(rest[a]) && point(rest[b]), `Missing rest bone joints: ${label}`);
        close(Math.hypot(rest[b].x - rest[a].x, rest[b].y - rest[a].y), length, label + '/rest length');
      }
      let angle = 0, origin;
      if (chains[part.id]) {
        const [a, b] = chains[part.id]; origin = rest[a];
        angle = Math.atan2(rest[b].y - origin.y, rest[b].x - origin.x) - Math.atan2(part.distal.y - part.pivot.y, part.distal.x - part.pivot.x);
      } else {
        const joint = part.id === 'head' ? 'neck' : ['torso', 'pelvis'].includes(part.id) ? 'waist' : part.id.startsWith('extra_fist_') ? 'extra_wrist_' + part.id.at(-1) : part.id.split('_')[0] + (part.id.endsWith('_fist') ? '_wrist' : '_ankle');
        assert(point(rest[joint]), `Missing neutral attachment joint: ${label}`); origin = rest[joint];
      }
      const c = Math.cos(angle), s = Math.sin(angle);
      const xMin = Math.min(0, c) + Math.min(0, -s), xMax = Math.max(0, c) + Math.max(0, -s);
      const yMin = Math.min(0, s) + Math.min(0, c), yMax = Math.max(0, s) + Math.max(0, c);
      for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) if (alpha(x, y) > 8) {
        const dx = x - part.pivot.x, dy = y - part.pivot.y, tx = origin.x + dx * c - dy * s, ty = origin.y + dx * s + dy * c;
        assembled.left = Math.min(assembled.left, tx + xMin); assembled.right = Math.max(assembled.right, tx + xMax);
        assembled.top = Math.min(assembled.top, ty + yMin); assembled.bottom = Math.max(assembled.bottom, ty + yMax);
      }
    }
    for (let i = 0; i < rig.parts.length; i++) for (let j = i + 1; j < rig.parts.length; j++) {
      const a = rig.parts[i].source, b = rig.parts[j].source;
      assert(Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x) || Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y), `Anatomical crops overlap: ${kind}`);
    }
    assert(new Set(rig.parts.map((part) => part.source.width + '/' + part.source.height)).size > 1, 'Measured pieces cannot become equal atlas cells');
    for (const [id, required] of [['torso', ['neck', 'waist', 'rear_shoulder', 'front_shoulder', ...(kind === 'null_regent' ? ['extra_shoulder_a', 'extra_shoulder_b'] : [])]], ['pelvis', ['waist', 'rear_hip', 'front_hip']]]) {
      const part = parts[id]; assert.deepEqual(Object.keys(part.anchors || {}).sort(), required.sort()); assert(point(rest.waist));
      for (const [joint, cap] of Object.entries(part.anchors)) {
        assert(point(rest[joint]));
        for (const key of ['x', 'y']) close(rest[joint][key], rest.waist[key] + cap[key] - part.pivot[key], kind + '/' + joint);
      }
    }
    for (const [a, b] of [['hip', 'waist'], ['head', 'neck'], ['rear_fist', 'rear_wrist'], ['front_fist', 'front_wrist']]) {
      assert(point(rest[a]) && point(rest[b])); for (const key of ['x', 'y']) close(rest[a][key], rest[b][key], kind + '/' + a);
    }
    for (const side of ['rear', 'front']) {
      const shoe = parts[side + '_shoe']; assert.deepEqual(Object.keys(shoe.anchors || {}), ['ground_contact']);
      const ankle = rest[side + '_ankle'], foot = rest[side + '_foot_contact']; assert(point(ankle) && point(foot));
      for (const key of ['x', 'y']) close(foot[key], ankle[key] + shoe.anchors.ground_contact[key] - shoe.pivot[key], kind + '/' + side + ' foot');
      close(foot.y, 0, kind + '/planted floor');
    }
    const bounds = rig.restVisibleBounds;
    assert(bounds && ['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(bounds[key])) && bounds.right > bounds.left && bounds.bottom > bounds.top);
    close(rig.pixelScale.standingVisibleHeight, bounds.bottom - bounds.top, kind + '/native standing height');
    for (const key of ['left', 'top', 'right', 'bottom']) close(bounds[key], assembled[key], kind + '/transformed native alpha ' + key);
    close(rig.pixelScale.standingVisibleHeight, assembled.bottom - assembled.top, kind + '/actual native standing height');
    registrations.push({kind, pieces: rig.parts.length, nativePNG_SHA256: digest(imageBytes), decodedRGBA_SHA256: digest(native.pixels), rigSHA256: digest(rigBytes), restNativeAlphaExtent: Object.fromEntries(Object.entries(assembled).map(([key, value]) => [key, Math.round(value * 1e6) / 1e6]))});
  }
  return {selectedActors: 8, assetCount: 17, nativeAlphaThreshold: 8, registrations, runtimeAcceptance: 'not established by packaging'};
}

function safeUInt64(data, offset) {
  const value = data.readBigUInt64LE(offset);
  assert(value <= BigInt(Number.MAX_SAFE_INTEGER), "KTX2 range exceeds safe integer bounds");
  return Number(value);
}

function rgbaMipBytes(width, height) {
  let bytes = 0;
  for (;;) {
    bytes += width * height * 4;
    if (width === 1 && height === 1) return bytes;
    width = Math.max(1, width >> 1); height = Math.max(1, height >> 1);
  }
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
    "src/engine/cache-road-texture-bank.js", "src/engine/cache-road-texture-worker.js",
    "src/engine/level-scene-resources.js", textureManifestName,
    "src/game/game-initializer.js", "src/game/main-new.js", "src/utils/math.js"]) {
    assert(names.includes(required), `Incomplete game package: ${required}`);
  }
  const assets = names.filter((name) => name.startsWith("assets/"));
  assert(Number.isSafeInteger(owner.canonicalAssetCount) && owner.canonicalAssetCount > 0);
  assert(Number.isSafeInteger(owner.preservedOriginalCount) && owner.preservedOriginalCount > 0);
  // Preserved originals may also be tracked canonical blobs; ownership is a union.
  assert(assets.length >= owner.canonicalAssetCount &&
    assets.length <= owner.canonicalAssetCount + owner.preservedOriginalCount);
  const derivatives = derivativeNames();
  for (const name of derivatives) localFile(name, owner.files);
  assert.deepEqual(assets.filter((name) => name.startsWith(textureRoot)).sort(), [...derivatives].sort(),
    "Only the declared manifest and exact KTX2 bank may be added as texture derivatives");
  assert.deepEqual(assets.filter((name) => name.startsWith(macReviewRoot)).sort(), [...macReviewAssets].sort(),
    "Only the exact eight declared Mac review siblings may extend the sealed originals");
  assert.deepEqual(assets.filter((name) => name.startsWith(cityRoot)).sort(), [...cityAssets].sort(),
    "Only the explicitly declared city art and registration may extend the sealed originals");
  assert.equal(rigAssets.size, 17);
  assert.deepEqual(assets.filter((name) => name.startsWith(rigRoot)).sort(), [...rigAssets].sort(),
    "Only the exact 17 selected articulated combat assets may extend the sealed originals");
  const originalNames = assets.filter((name) => !derivatives.has(name) && !macReviewAssets.has(name) && !cityAssets.has(name) && !rigAssets.has(name)).sort();
  assert.equal(originalNames.length, originalAssetCount, "All 624 original assets must remain present");
  assert.equal(owner.canonicalAssetCount - derivatives.size - macReviewAssets.size - cityAssets.size - rigAssets.size, originalAssetCount,
    "Canonical ownership must count sealed originals, exact derivatives, Mac siblings, city art and articulated rigs separately");
  const originalRows = originalNames.map((name) => [name, owner.files[name].bytes, owner.files[name].sha256]);
  assert.equal(createHash("sha256").update(JSON.stringify(originalRows)).digest("hex"), originalAssetInventorySHA256,
    "Original artwork, music, sprite data or asset metadata changed");
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
  t.diagnostic(`${names.length} payload files verified; ${originalNames.length} unchanged originals plus ${derivatives.size} texture derivatives, ${macReviewAssets.size} Mac siblings, ${cityAssets.size} city assets and ${rigAssets.size} rig assets, ${assetBytes} asset bytes`);
});

test("System Override ships the exact Mac preview art, native pose registration and private query entry", (t) => {
  const files = marker().files;
  assert.deepEqual(Object.keys(files).filter((name) => name.startsWith(macReviewRoot)).sort(), [...macReviewAssets].sort(),
    "Mac review must have every approved sibling and no extra photo or review file");
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const dimensions = {};
  for (const name of macReviewAssets) {
    const file = localFile(name, files);
    if (!name.endsWith(".png")) continue;
    assert(header(file, 8).equals(pngSignature), `Mac art must retain native PNG bytes: ${name}`);
    dimensions[name] = originalDimensions(file);
    assert(dimensions[name].every((value) => Number.isSafeInteger(value) && value > 0), "Invalid native Mac image dimensions");
  }
  const imageName = macReviewRoot + "mac-poses-v3.png", sheet = JSON.parse(read(macReviewRoot + "mac-poses-v3-frames.json"));
  assert.equal(sheet.schemaVersion, 1); assert.equal(sheet.sourceImage, imageName); assert.equal(sheet.facing, "right");
  assert.deepEqual([sheet.dimensions.width, sheet.dimensions.height], dimensions[imageName], "Pose metadata must describe the actual unchanged image");
  const pngHeader = header(localFile(imageName), 26);
  assert.equal(pngHeader[24], 8); assert.equal(pngHeader[25], 6, "Pose sheet requires original RGBA transparency");
  assert.deepEqual(sheet.frames.map((frame) => frame.id), ["idle", "walk_left", "walk_right", "punch", "guard", "jump"]);
  assert.equal(sheet.pixelScale.standingVisibleHeight, sheet.frames[0].visibleBounds.height, "One shared scale derives from standing height");
  for (const frame of sheet.frames) {
    const crop = frame.source, visible = frame.visibleBounds, pivot = frame.pivot;
    for (const rect of [crop, visible]) {
      assert(Number.isSafeInteger(rect.x) && rect.x >= 0 && Number.isSafeInteger(rect.y) && rect.y >= 0);
      assert(Number.isSafeInteger(rect.width) && rect.width > 0 && Number.isSafeInteger(rect.height) && rect.height > 0);
    }
    assert(crop.x + crop.width <= sheet.dimensions.width && crop.y + crop.height <= sheet.dimensions.height, `Pose crop escapes bitmap: ${frame.id}`);
    assert(visible.x + visible.width <= crop.width && visible.y + visible.height <= crop.height, `Silhouette escapes crop: ${frame.id}`);
    assert(Number.isFinite(pivot.x) && Number.isFinite(pivot.y) && pivot.x >= visible.x && pivot.x <= visible.x + visible.width);
    assert.equal(pivot.y, visible.y + visible.height, `Registered foot must anchor the lowest shoe: ${frame.id}`);
  }
  for (let i = 0; i < sheet.frames.length; i++) for (let j = i + 1; j < sheet.frames.length; j++) {
    const a = sheet.frames[i].source, b = sheet.frames[j].source;
    assert(Math.min(a.x + a.width, b.x + b.width) <= Math.max(a.x, b.x) ||
      Math.min(a.y + a.height, b.y + b.height) <= Math.max(a.y, b.y), "Registered pose crops overlap");
  }
  assert(new Set(sheet.frames.map((frame) => frame.source.width)).size > 1, "Measured nonuniform crops must not become equal atlas cells");
  const html = read("index.html"), scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)/gi)].map((match) => match[1]);
  const macScripts = ["src/game/mac-street-combat.js", "src/game/mac-street-story.js", "src/game/mac-combat-animation.js", "src/game/mac-combat-preview.js"];
  for (const name of macScripts) { assert.equal(scripts.filter((script) => script === name).length, 1, `One Mac owner: ${name}`); localFile(name, files); }
  assert(macScripts.slice(0, 3).every((name) => scripts.indexOf(name) < scripts.indexOf(macScripts[3])), "Both factories and the animation owner must precede the preview wrapper");
  assert(scripts.indexOf("src/core/runtime-lifecycle.js") < scripts.indexOf(macScripts[3]), "Mac keeps the shared lifecycle owner");
  const sandbox = context({URLSearchParams, location: {search: ""}}); let registrations = 0;
  sandbox.window.BARCODE.Campaign = {register() { registrations++; }};
  for (const name of macScripts) load(sandbox, name);
  const preview = sandbox.window.BARCODE.MacCombatPreview;
  assert.equal(registrations, 0, "Private Mac modules must not register or replace a campaign chapter");
  assert.equal(preview.active, false); assert.equal(preview.requested(), false, "Ordinary title remains the normal campaign");
  for (const [query, expected] of [["?preview=mac-firstslice", true], ["?preview=other", false], ["?mac-firstslice=1", false]]) {
    sandbox.window.location.search = query; assert.equal(preview.requested(), expected, `Exact private query: ${query}`);
  }
  assert.match(html, /MacCombatPreview\?\.requested\?\.\(\)/, "Actual title reads the private query gate");
  assert.match(html, /privatePreview:\s*["']mac-firstslice["']/, "Private title enters through RuntimeLifecycle");
  t.diagnostic("8 exact sibling assets, native PNG headers, 6 nonuniform registered poses, 4 ordered owners and an inert private query entry verified");
});

test("Mac city chapter ships six distinct districts and registered animation art for six new aliens and a boss", () => {
  const files = marker().files, city = JSON.parse(read(cityRoot + "mac-city-art-v1.json"));
  assert.deepEqual(Object.keys(files).filter((name) => name.startsWith(cityRoot)).sort(), [...cityAssets].sort());
  assert.deepEqual(city.actors.map((actor) => actor.kind).sort(), [...cityKinds].sort());
  assert.deepEqual(city.zones.map((zone) => zone.id), cityZones);
  assert.equal(new Set(city.actors.map((actor) => actor.image)).size, 7);
  assert.equal(new Set(city.zones.map((zone) => zone.background)).size, 6);
  assert(city.actors.some((actor) => actor.bloodColor === "green") && city.actors.some((actor) => actor.bloodColor === "purple"));
  function registration(imageName, framesName, expectedIds) {
    const file = localFile(imageName, files), png = header(file, 26), sheet = JSON.parse(read(framesName));
    assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
    assert.equal(png[24], 8); assert.equal(png[25], 6, "Actors retain native RGBA alpha");
    assert.equal(sheet.schemaVersion, 1); assert.equal(sheet.sourceImage, imageName); assert.equal(sheet.facing, "right");
    assert.deepEqual([sheet.dimensions.width, sheet.dimensions.height], originalDimensions(file));
    assert.deepEqual(sheet.frames.map((frame) => frame.id), expectedIds);
    assert(Number.isFinite(sheet.pixelScale.standingVisibleHeight) && sheet.pixelScale.standingVisibleHeight > 0);
    for (const frame of sheet.frames) {
      const crop = frame.source, visible = frame.visibleBounds, pivot = frame.pivot;
      assert(Number.isSafeInteger(crop.x) && crop.x >= 0 && Number.isSafeInteger(crop.y) && crop.y >= 0);
      assert(Number.isSafeInteger(crop.width) && crop.width > 0 && Number.isSafeInteger(crop.height) && crop.height > 0);
      assert(crop.x + crop.width <= sheet.dimensions.width && crop.y + crop.height <= sheet.dimensions.height);
      assert(visible.x >= 0 && visible.y >= 0 && visible.width > 0 && visible.height > 0);
      assert(visible.x + visible.width <= crop.width && visible.y + visible.height <= crop.height);
      assert(pivot.x >= visible.x && pivot.x <= visible.x + visible.width);
      assert.equal(pivot.y, visible.y + visible.height, "Every pose anchors its measured planted foot");
    }
    for (let i = 0; i < sheet.frames.length; i++) for (let j = i + 1; j < sheet.frames.length; j++) {
      const a = sheet.frames[i].source, b = sheet.frames[j].source;
      assert(Math.min(a.x+a.width,b.x+b.width)<=Math.max(a.x,b.x) || Math.min(a.y+a.height,b.y+b.height)<=Math.max(a.y,b.y), "No sprite crop may capture a neighboring pose");
    }
  }
  for (const actor of city.actors) {
    assert.equal(actor.image, cityRoot + actor.kind + "-" + cityVersion(actor.kind) + ".png");
    assert.equal(actor.frames, cityRoot + actor.kind + "-" + cityVersion(actor.kind) + "-frames.json");
    registration(actor.image, actor.frames, ["idle", "walk_a", "walk_b", "tell", "strike", "recover", "hit"]);
  }
  registration(cityRoot + "mac-attacks-v4.png", cityRoot + "mac-attacks-v4-frames.json", ["windup", "jab", "cross", "finisher", "throw_windup", "throw_release", "hurt"]);
  for (const zone of city.zones) {
    assert.equal(zone.background, cityRoot + zone.id + "-v1.png");
    const [width, height] = originalDimensions(localFile(zone.background, files));
    assert(width >= 1800 && height >= 650 && width/height > 2.5 && width/height < 3.5, "District panoramas retain wide native architectural proportions");
  }
  const sandbox = context(); load(sandbox, "src/game/mac-street-combat.js");
  const combat = sandbox.window.BARCODE.MacStreetCombat, snapshot = combat.create().getSnapshot();
  assert.equal(combat.constants.worldWidth, 20400); assert.equal(snapshot.zones.length, 6);
  assert.deepEqual(Array.from(snapshot.zones, (zone) => zone.id), cityZones);
  assert.equal(snapshot.city.totalWaves, 12); assert.equal(snapshot.city.totalEnemies, 30);
  assert.equal(snapshot.desk.unlocked, false, "Studio cannot open before the city is earned");
  const combinations = snapshot.zones.map((zone) => JSON.stringify(Array.from(zone.waves, (wave) => Array.from(wave).sort())));
  assert.equal(new Set(combinations).size, 6, "Each city district has its own combination of enemies");
  assert.deepEqual(Array.from(snapshot.zones[5].waves[1]), ["null_regent"]);
  assert.deepEqual(Object.keys(combat.roles).sort(), [...cityKinds].sort(), "Level1 enemies cannot leak into the city roster");
});

test("Mac combat ships the exact selected native articulated rigs and measured joint attachments", (t) => {
  const files = marker().files;
  const result = verifyArticulatedBank((name) => fs.readFileSync(localFile(name, files)), files,
    rigRoot, rigActors, rigAssets, (data) => createHash("sha256").update(data).digest("hex"));
  assert.equal(result.selectedActors, 8); assert.equal(result.assetCount, 17);
  assert.equal(result.registrations.find((actor) => actor.kind === "null_regent").pieces, 21);
  assert(result.registrations.filter((actor) => actor.kind !== "null_regent").every((actor) => actor.pieces === 15));
  t.diagnostic("8 native RGBA actors, 17 exact files, actual alpha bounds/caps, nonoverlapping anatomical crops and connected measured bones verified");
});

test("System Override's 171 road sources preserve full resolution and original bytes with 149 local compressed derivatives", (t) => {
  const files = marker().files, bank = textureManifest();
  const derivatives = derivativeNames(bank);
  const signature = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  let compressedBytes = 0, residentMipBytes = 0, svgMipBytes = 0, originalMipBytes = 0;
  for (const [key, entry] of Object.entries(bank.entries)) {
    assert.equal(typeof entry.originalPath, "string");
    assert(entry.originalPath.startsWith("assets/") && !derivatives.has(entry.originalPath));
    const originalFile = localFile(entry.originalPath, files), file = localFile(entry.path, files);
    assert.equal(entry.originalSHA256, files[entry.originalPath].sha256, `Original source hash changed: ${key}`);
    assert.equal(entry.sha256, files[entry.path].sha256, `Compressed source hash changed: ${key}`);
    assert.equal(entry.bytes, files[entry.path].bytes, `Compressed source byte count changed: ${key}`);
    for (const name of ["originalWidth", "originalHeight", "width", "height", "levels", "bytes", "rgbaMipBytes"]) {
      assert(Number.isSafeInteger(entry[name]) && entry[name] > 0, `Invalid ${name}: ${key}`);
    }
    assert.deepEqual(originalDimensions(originalFile), [entry.originalWidth, entry.originalHeight],
      `Compressed bank misstates original image dimensions: ${key}`);
    assert.equal(entry.rgbaMipBytes, rgbaMipBytes(entry.originalWidth, entry.originalHeight));
    originalMipBytes += entry.rgbaMipBytes;
    if (entry.kind === "original") {
      assert.equal(path.extname(entry.originalPath), ".svg", "Only the 22 exact authored SVG textures retain original GPU storage");
      assert.equal(entry.sha256, entry.originalSHA256);
      assert.equal(entry.width, entry.originalWidth);
      assert.equal(entry.height, entry.originalHeight);
      assert.equal(entry.levels, Math.floor(Math.log2(Math.max(entry.width, entry.height))) + 1);
      svgMipBytes += entry.rgbaMipBytes;
      continue;
    }
    assert.equal(path.extname(entry.originalPath), ".webp", "Compressed sources must derive from the original 149 WebP files");
    assert(Number.isSafeInteger(entry.bc7MipBytes) && entry.bc7MipBytes > 0);
    assert.equal(entry.width, Math.ceil(entry.originalWidth / 4) * 4, `Original width was resampled: ${key}`);
    assert.equal(entry.height, Math.ceil(entry.originalHeight / 4) * 4, `Original height was resampled: ${key}`);
    assert.equal(entry.paddedRgbaMipBytes, rgbaMipBytes(entry.width, entry.height));
    assert.equal(entry.levels, Math.floor(Math.log2(Math.max(entry.width, entry.height))) + 1,
      `The original-resolution texture must retain its complete mip chain: ${key}`);
    const data = header(file, 80 + entry.levels * 24);
    assert.equal(data.length, 80 + entry.levels * 24);
    assert(data.subarray(0, 12).equals(signature), `Invalid KTX2 identifier: ${key}`);
    assert.equal(data.readUInt32LE(12), 0, `KTX2 must use Basis UASTC, not an unrelated Vulkan format: ${key}`);
    assert.equal(data.readUInt32LE(16), 1);
    assert.equal(data.readUInt32LE(20), entry.width);
    assert.equal(data.readUInt32LE(24), entry.height);
    assert.equal(data.readUInt32LE(28), 0, "Road sources must remain 2D");
    assert(data.readUInt32LE(32) <= 1, "Road sources must not become texture arrays");
    assert.equal(data.readUInt32LE(36), 1, "Road sources must not become cubemaps");
    assert.equal(data.readUInt32LE(40), entry.levels);
    assert.equal(data.readUInt32LE(44), 2, "The approved KTX2 bank uses lossless Zstandard supercompression");
    assert.equal(safeUInt64(data, 64), 0);
    assert.equal(safeUInt64(data, 72), 0);
    const dfdOffset = data.readUInt32LE(48), dfdLength = data.readUInt32LE(52);
    assert(dfdOffset >= data.length && dfdLength >= 28 && dfdOffset + dfdLength <= entry.bytes);
    const fd = fs.openSync(file, "r"), dfd = Buffer.alloc(28);
    try { assert.equal(fs.readSync(fd, dfd, 0, dfd.length, dfdOffset), dfd.length); }
    finally { fs.closeSync(fd); }
    assert.equal(dfd.readUInt32LE(0), dfdLength);
    assert.equal(dfd[12], 166, "Compressed bank must contain legacy UASTC blocks");
    assert.equal(dfd[14], 1, "Compressed colors must retain UNORM transfer");
    assert.equal(dfd[15] & 1, 1, "Compressed alpha must be premultiplied exactly once");
    let width = entry.width, height = entry.height, mipBytes = 0;
    const ranges = [];
    for (let level = 0; level < entry.levels; level++) {
      const index = 80 + level * 24, offset = safeUInt64(data, index), length = safeUInt64(data, index + 8);
      const expanded = safeUInt64(data, index + 16), expected = Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
      assert(offset >= data.length && length > 0 && offset + length <= entry.bytes, `Invalid compressed mip range: ${key}/${level}`);
      assert.equal(expanded, expected, `Mip dimensions or UASTC block size changed: ${key}/${level}`);
      ranges.push([offset, offset + length]); mipBytes += expected;
      width = Math.max(1, width >> 1); height = Math.max(1, height >> 1);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) assert(ranges[i - 1][1] <= ranges[i][0], "KTX2 mip ranges overlap");
    assert.equal(entry.bc7MipBytes, mipBytes, `Full-resolution resident mip estimate changed: ${key}`);
    compressedBytes += entry.bytes; residentMipBytes += mipBytes;
  }
  assert.equal(bank.originalRgbaMipBytes, originalMipBytes);
  assert.equal(bank.compressedGpuMipBytes, residentMipBytes);
  assert.equal(bank.svgGpuMipBytes, svgMipBytes);
  assert.equal(bank.allGpuMipBytes, residentMipBytes + svgMipBytes);
  t.diagnostic(`149 original-resolution KTX2 derivatives plus 22 exact SVG sources; ${compressedBytes} derivative bytes, ${residentMipBytes} BC7 mip bytes; browser presentation and recovery still require actual runtime checks`);
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
  const touchScript = "src/core/touch-controls.js";
  assert.equal(scripts.filter((name) => name === touchScript).length, 1,
    "Touch controls must have one launched owner");
  localFile(touchScript, files);
  for (const name of ["src/core/action-input.js", "src/core/input.js"]) {
    assert.equal(scripts.filter((script) => script === name).length, 1, name);
    assert(scripts.indexOf(name) < scripts.indexOf(touchScript),
      "Touch controls must follow the existing input owners");
  }
  const gpuScripts = [vendorRoot + "pixi.min.js", "src/engine/cache-road-texture-bank.js", "src/engine/cache-road-gpu-renderer.js",
    "src/engine/cache-road-gpu-context.js", "src/game/cache-road-proof.js"];
  for (const name of gpuScripts) assert.equal(scripts.filter((script) => script === name).length, 1, name);
  for (let i = 1; i < gpuScripts.length; i++) {
    assert(scripts.indexOf(gpuScripts[i - 1]) < scripts.indexOf(gpuScripts[i]), "GPU renderer load order changed");
  }
  for (const [name, sha256] of Object.entries(vendorHashes)) {
    assert.equal(createHash("sha256").update(fs.readFileSync(localFile(vendorRoot + name, files))).digest("hex"),
      sha256, "Pinned renderer distribution changed: " + name);
  }
  const provenance = JSON.parse(read(vendorRoot + "provenance.json"));
  assert.equal(provenance.version, "8.22.0");
  assert.equal(provenance.license, "MIT");
  for (const [name, sha256] of Object.entries(basisHashes)) {
    assert.equal(createHash("sha256").update(fs.readFileSync(localFile(basisRoot + name, files))).digest("hex"),
      sha256, "Pinned texture decoder distribution changed: " + name);
  }
  const basisProvenance = JSON.parse(read(basisRoot + "provenance.json"));
  assert.equal(basisProvenance.name, "basis_universal");
  assert.equal(basisProvenance.version, "2.50");
  assert.equal(basisProvenance.releaseTag, "v2_50");
  assert.equal(basisProvenance.sourceCommit, transcoderCommit);
  assert.equal(basisProvenance.license, "Apache-2.0");
  assert.deepEqual(basisProvenance.embeddedExternalUrls, []);
  for (const name of ["basis_transcoder.js", "basis_transcoder.wasm", "LICENSE"]) {
    assert.equal(basisProvenance.files[name].sha256, basisHashes[name]);
    assert.equal(basisProvenance.files[name].bytes, files[basisRoot + name].bytes);
    assert.match(basisProvenance.files[name].gitBlob, /^[0-9a-f]{40}$/);
  }
  assert(!scripts.includes(basisRoot + "basis_transcoder.js"), "The decoder must run only in its owned loading worker");
  assert(!scripts.includes("src/engine/cache-road-texture-worker.js"), "The worker must not run as a page script");
  const runtimeNames = names.filter((name) => !name.startsWith("assets/"));
  for (const name of runtimeNames) {
    const pinnedVendorName = name.startsWith(vendorRoot) ? name.slice(vendorRoot.length) : null;
    const pinnedBasisName = name.startsWith(basisRoot) ? name.slice(basisRoot.length) : null;
    assert(["index.html", "style.css", "sprites-manifest.json"].includes(name) || /^src\/.+\.js$/.test(name) ||
      pinnedVendorName && Object.hasOwn(vendorHashes, pinnedVendorName) ||
      pinnedBasisName && Object.hasOwn(basisHashes, pinnedBasisName),
      `Unexpected public runtime or review file: ${name}`);
    assert.doesNotMatch(name, /(?:^|[\/-])(?:private|local-review|browser-review|standalone-review|review-harness)(?:[.\/-]|$)/i);
    // Binary WASM bytes are checked against the official pin above; they are not source text.
    if (pinnedBasisName === "basis_transcoder.wasm") continue;
    const source = read(name);
    assert.doesNotMatch(source, /vendorSDK|\/lib\/MakkoEngine\.min\.js|(?:PRIVATE_LOCAL_REVIEW|PRIVATE_REVIEW_HARNESS|standalone-review\.html|local-review\.html)/i,
      `Host SDK or private harness survived in ${name}`);
    assert.doesNotMatch(source, /raw\.githubusercontent\.com\/6-Bit-01\/BARCODE-SYSTEM-OVERRIDE\/|https?:\/\/[^\s/'"`]*makko\.ai(?:\/|\b)|supabase\.co\/storage\//i,
      `Remote runtime asset survived in ${name}`);
    assert.doesNotMatch(source, /["'`]\/assets\//, `Root-relative asset escaped the game directory in ${name}`);
    for (const match of source.matchAll(/https?:\/\/[^\s'"`<>]+/g)) {
      const url = match[0];
      // Traffic sourceUrl is inert original GIF provenance; Google Fonts remains intentional.
      // Exact pinned Pixi bytes retain unused optional compressed-loader defaults and license/provenance URLs.
      assert(pinnedVendorName && vendorReferences[pinnedVendorName]?.has(url) ||
        pinnedBasisName && basisReferences[pinnedBasisName]?.has(url) ||
        /^https?:\/\/www\.w3\.org\//.test(url) || /^http:\/\/localhost\//.test(url) ||
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

test("System Override's actual sprite, presentation, music and ship registries resolve local package files", async (t) => {
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
  const bank = textureManifest(), bankPaths = new Map(Object.values(bank.entries).map((entry) => [entry.originalPath, entry]));
  class LocalImage {
    set src(url) {
      localFile(url, files); presentationPaths.push(url);
      const entry = bankPaths.get(url.replace(/^\.\//, ""));
      this.naturalWidth = this.width = entry?.originalWidth || 1;
      this.naturalHeight = this.height = entry?.originalHeight || 1;
      queueMicrotask(() => this.onload?.());
    }
  }
  const presentation = context({ Image: LocalImage });
  load(presentation, "src/engine/presentation-assets.js");
  assert(presentationPaths.length > 0, "Production presentation registry did not preload artwork");
  const descriptors = await presentation.window.BARCODE.PresentationAssets.waitForGpuSources(Object.keys(bank.entries));
  assert.equal(descriptors.length, 171, "Every texture-bank key must belong to the ready production presentation registry");
  for (const descriptor of descriptors) {
    const entry = bank.entries[descriptor.key];
    assert.equal(descriptor.path, entry.originalPath, `Texture bank targets different production art: ${descriptor.key}`);
    assert.equal(descriptor.image.naturalWidth, entry.originalWidth);
    assert.equal(descriptor.image.naturalHeight, entry.originalHeight);
  }

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
  const sharedRule=css.match(/#gameCanvas\s*,\s*#cacheRoadGpuCanvas\s*\{([^}]+)\}/);
  assert(sharedRule,'Native and GPU canvases must share the complete viewport fit');
  const game=sharedRule[1];
  assert(/#gameCanvas\s*\{\s*z-index:\s*1;/.test(css)&&
    /#cacheRoadGpuCanvas\s*\{\s*z-index:\s*0;\s*pointer-events:\s*none;/.test(css));
  assert(/#gameCanvas\.cache-road-gpu-active\s*\{\s*background:\s*transparent;/.test(css));
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
