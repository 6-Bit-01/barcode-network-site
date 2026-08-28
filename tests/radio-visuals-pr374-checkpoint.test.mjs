import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const approvedPr374ExactFiles = new Map([
  ["src/app/api/overlay/radio-visuals/route.ts", "3228b701c9c46af46fcb53a39b14603f4fc92f21ee7622c89634052763bdde74"],
  ["src/app/overlay/radio-visuals/page.tsx", "7c0d23255b8db51fd2765e9edc050b4674f857cbf0576cf747a2d725228fe659"],
  ["src/components/radio-visuals-music-expansion.ts", "f3f0da6205b019e39bd5f11347c51bd373bdb0c66e4b96a5547165725dfa31fb"],
  ["src/components/radio-visuals-music-embellishments.ts", "940b35aa6d3ef55c32337380e681aaa4a655441728bd96e549d08bfdbb0a0d15"],
  ["src/lib/radio-visuals-audio.ts", "4fc9bf20c79df9df0af2c3e2a0f7a5f662cf81d6570080df88cfa69ba4535b05"],
  ["tools/barcode-audio-bridge/AudioSignal.cs", "6d8c7353e5a3e14e9ad34bbf471db60c8875f97bc6de9c1579264d3cb62120c6"],
  ["tools/barcode-audio-bridge/BridgeApplicationContext.cs", "557b14d1fced3e99703d83289a46ef26f630caf2f0117132d5f479cf804d23de"],
  ["tools/barcode-audio-bridge/BridgeInstaller.cs", "f70bedaa7ec382a9c0d445be91dd1722a2528d440d9f291e7bf2e500aa717f57"],
  ["tools/barcode-audio-bridge/BridgeLog.cs", "0fb1a1ee1d24886617446fd7e3c2d6d2516ec0d8bacbe35667779e9de3645bf9"],
  ["tools/barcode-audio-bridge/LocalSignalServer.cs", "a3bdc4ec0efe220731a9ceb0c80f6de0bc385a0277017ae05d6cb1a82d17fdcc"],
  ["tools/barcode-audio-bridge/LoopbackCaptureController.cs", "3aa69514dea23322b1bef608cb8b26102dde10c362ced9510d1c87f5849e3dd3"],
  ["tools/barcode-audio-bridge/Program.cs", "70b4927e05e663a2609a51c4cdebc996c98b4a1915872a4cc830c0c033235bda"],
]);

const approvedPr405ExactFiles = new Map([
  ["src/components/radio-visuals-music-expansion-30.ts", "08532932a7bdfae284560917e7c8136a10ca65aeb59e922af907933baa01482d"],
]);

test("the accepted twenty-family render modules and visual-only process boundary remain byte-exact", () => {
  for (const [relativePath, expectedHash] of approvedPr374ExactFiles) {
    const contents = readFileSync(path.join(projectRoot, relativePath));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    assert.equal(actualHash, expectedHash, relativePath);
  }
});

test("the accepted thirty-family render extension remains byte-exact", () => {
  for (const [relativePath, expectedHash] of approvedPr405ExactFiles) {
    const contents = readFileSync(path.join(projectRoot, relativePath));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    assert.equal(actualHash, expectedHash, relativePath);
  }
});

function extractedRenderer(source, name) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf("\nfunction ", start + 10);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}

test("untouched original Canvas families and the PR #404 reaction path remain exact around the perceptual pilots", () => {
  const receiver = readFileSync(path.join(projectRoot, "src/components/RadioVisualsReceiver.tsx"), "utf8");
  const untouchedFamilyRenderers = [
    "drawEdgeSpectrum",
    "drawTapeFeedback",
    "drawAsciiTerminal",
    "drawPixelSortStorm",
    "drawParticlePressure",
  ].map((name) => extractedRenderer(receiver, name)).join("\n");
  assert.equal(
    createHash("sha256").update(untouchedFamilyRenderers).digest("hex"),
    "a98234c8ecb24da6f180909f6915ff512d380ef3fc73f7d8d50157fec69556a0",
    "the five original non-pilot inline Canvas renderers must remain byte-exact",
  );
  const perceptualPilotRenderers = [
    "drawOscilloscopeRibbons",
    "drawMatrixRain",
    "drawLightningSwitchyard",
    "drawLaserLattice",
    "drawSignalConstellation",
  ].map((name) => extractedRenderer(receiver, name)).join("\n");
  assert.equal(
    createHash("sha256").update(perceptualPilotRenderers).digest("hex"),
    "927d7a924c26f5ff39a43aadcfc59bee5be0d9ee1d3d43dfb7f11e6b89f10b80",
    "the approved five-family perceptual pilot must remain byte-exact",
  );

  const engine = readFileSync(path.join(projectRoot, "src/lib/radio-visuals-engine.ts"), "utf8");
  const reactionCore = engine.slice(
    engine.indexOf("export function radioVisualAudioReactionInitialState"),
    engine.indexOf("export function radioVisualsPalette"),
  );
  const postHandoffEngine = engine.slice(engine.indexOf("export function radioVisualAmbientMoment"));
  assert.equal(
    createHash("sha256").update(reactionCore).digest("hex"),
    "b29c61a28a8cb1d16588a3dd00f5bd50bfaefdea9d92109fe44e2269b43ddd90",
    "the accepted PR #404 reaction state and follower must remain exact",
  );
  assert.equal(
    createHash("sha256").update(postHandoffEngine).digest("hex"),
    "0bae7186b6bbddc45b62839989ae56c62b1ca40a5a440c5997f9bb6cbabddb9b",
    "non-audio-handoff engine behavior must remain exact",
  );
});
