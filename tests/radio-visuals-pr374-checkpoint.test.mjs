import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const approvedPr374Files = new Map([
  ["src/app/api/overlay/radio-visuals/route.ts", "3228b701c9c46af46fcb53a39b14603f4fc92f21ee7622c89634052763bdde74"],
  ["src/app/overlay/radio-visuals/page.tsx", "7c0d23255b8db51fd2765e9edc050b4674f857cbf0576cf747a2d725228fe659"],
  ["src/components/radio-visuals-music-expansion.ts", "f3f0da6205b019e39bd5f11347c51bd373bdb0c66e4b96a5547165725dfa31fb"],
  ["src/components/radio-visuals-music-embellishments.ts", "940b35aa6d3ef55c32337380e681aaa4a655441728bd96e549d08bfdbb0a0d15"],
  ["src/lib/radio-visuals-audio.ts", "4fc9bf20c79df9df0af2c3e2a0f7a5f662cf81d6570080df88cfa69ba4535b05"],
  ["src/lib/radio-visuals-music-embellishments.ts", "fff665851471e5d39b40b2604c7f7cfeae7cee8f10cac27ae7027937cca7aed5"],
  ["src/lib/radio-visuals-preview.ts", "2ada1cbb8876949ec161385c6e6926223a3b5e9c54dc6df4e5eec5149c4072b7"],
  ["src/lib/radio-visuals-resolver.ts", "4f675d23ed03bf0f81ad297dab1a3fe1281cecb05ed3ed2a199e51ad42782bd9"],
  ["src/lib/radio-visuals-selection.ts", "fe757321c15b3f9e84870749a31b65a36d4003bf854150a49e74e528e75e0ac2"],
  ["tools/barcode-audio-bridge/AudioSignal.cs", "a2a64869e2ad0dcaf6a8d58decb0e59aad0f218accf76084fe003293e6fef453"],
  ["tools/barcode-audio-bridge/BridgeApplicationContext.cs", "557b14d1fced3e99703d83289a46ef26f630caf2f0117132d5f479cf804d23de"],
  ["tools/barcode-audio-bridge/BridgeInstaller.cs", "f70bedaa7ec382a9c0d445be91dd1722a2528d440d9f291e7bf2e500aa717f57"],
  ["tools/barcode-audio-bridge/BridgeLog.cs", "0fb1a1ee1d24886617446fd7e3c2d6d2516ec0d8bacbe35667779e9de3645bf9"],
  ["tools/barcode-audio-bridge/LocalSignalServer.cs", "a3bdc4ec0efe220731a9ceb0c80f6de0bc385a0277017ae05d6cb1a82d17fdcc"],
  ["tools/barcode-audio-bridge/LoopbackCaptureController.cs", "3aa69514dea23322b1bef608cb8b26102dde10c362ced9510d1c87f5849e3dd3"],
  ["tools/barcode-audio-bridge/Program.cs", "70b4927e05e663a2609a51c4cdebc996c98b4a1915872a4cc830c0c033235bda"],
]);

test("the Show Visuals render modules and visual-only process boundary remain byte-exact to approved PR #374", () => {
  for (const [relativePath, expectedHash] of approvedPr374Files) {
    const contents = readFileSync(path.join(projectRoot, relativePath));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    assert.equal(actualHash, expectedHash, relativePath);
  }
});

test("all accepted PR #374 family renderers remain exact while only their live audio handoff evolves", () => {
  const receiver = readFileSync(path.join(projectRoot, "src/components/RadioVisualsReceiver.tsx"), "utf8");
  const rendererBlock = receiver.slice(
    receiver.indexOf("function drawParticleField"),
    receiver.indexOf("function visualSignalMemory"),
  );
  assert.equal(
    createHash("sha256").update(rendererBlock).digest("hex"),
    "7f269e7cde25d4f5e65d3477a1222843d1aea6f85ad69890b8fccfec1dddc3a5",
    "the complete Canvas renderer block must remain byte-exact to PR #374",
  );

  const engine = readFileSync(path.join(projectRoot, "src/lib/radio-visuals-engine.ts"), "utf8");
  const familyCore = engine.slice(
    engine.indexOf("export const RADIO_VISUAL_MUSIC_SCENES"),
    engine.indexOf("export type RadioVisualLoopbackChannel"),
  );
  const postHandoffEngine = engine.slice(engine.indexOf("export function radioVisualAmbientMoment"));
  assert.equal(
    createHash("sha256").update(familyCore).digest("hex"),
    "82ddd76f7de758abceb4086bc85d4432a262783bfb94a026c733aa2e6b3e0c1d",
    "the twenty-family configuration and reaction engine must remain exact",
  );
  assert.equal(
    createHash("sha256").update(postHandoffEngine).digest("hex"),
    "0bae7186b6bbddc45b62839989ae56c62b1ca40a5a440c5997f9bb6cbabddb9b",
    "non-audio-handoff engine behavior must remain exact",
  );
});
