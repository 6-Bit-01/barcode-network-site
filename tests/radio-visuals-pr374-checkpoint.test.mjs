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
  ["src/components/RadioVisualsReceiver.tsx", "5b6a7459632b034da144b4a43178130d33c4abd805ef8c44cd7ce1b6e6a07134"],
  ["src/components/radio-visuals-music-expansion.ts", "f3f0da6205b019e39bd5f11347c51bd373bdb0c66e4b96a5547165725dfa31fb"],
  ["src/components/radio-visuals-music-embellishments.ts", "940b35aa6d3ef55c32337380e681aaa4a655441728bd96e549d08bfdbb0a0d15"],
  ["src/lib/radio-audio-bridge.ts", "2a55f53d33feb530bf61e51402c10f4b88cd7bc5fcc168980d39e193beb3f4f0"],
  ["src/lib/radio-visuals-audio.ts", "4fc9bf20c79df9df0af2c3e2a0f7a5f662cf81d6570080df88cfa69ba4535b05"],
  ["src/lib/radio-visuals-engine.ts", "653c95b7d15c2a4b13c3676af2f59109c0c86a9ed106c9f27e7548079c4e9b44"],
  ["src/lib/radio-visuals-music-embellishments.ts", "fff665851471e5d39b40b2604c7f7cfeae7cee8f10cac27ae7027937cca7aed5"],
  ["src/lib/radio-visuals-preview.ts", "2ada1cbb8876949ec161385c6e6926223a3b5e9c54dc6df4e5eec5149c4072b7"],
  ["src/lib/radio-visuals-resolver.ts", "4f675d23ed03bf0f81ad297dab1a3fe1281cecb05ed3ed2a199e51ad42782bd9"],
  ["src/lib/radio-visuals-selection.ts", "fe757321c15b3f9e84870749a31b65a36d4003bf854150a49e74e528e75e0ac2"],
  ["tools/barcode-audio-bridge/AudioAnalyzer.cs", "f898ee3fc05e87637dc8af3f51e0f2eb896b1a661530555b9be2ff1348978ba1"],
  ["tools/barcode-audio-bridge/AudioSignal.cs", "a2a64869e2ad0dcaf6a8d58decb0e59aad0f218accf76084fe003293e6fef453"],
  ["tools/barcode-audio-bridge/BridgeConstants.cs", "a55d812afc1f3c55eec66876198619b2cb4c1a7c1b3085548515d8dab0a1e6c9"],
  ["tools/barcode-audio-bridge/LocalSignalServer.cs", "a3bdc4ec0efe220731a9ceb0c80f6de0bc385a0277017ae05d6cb1a82d17fdcc"],
  ["tools/barcode-audio-bridge/LoopbackCaptureController.cs", "3aa69514dea23322b1bef608cb8b26102dde10c362ced9510d1c87f5849e3dd3"],
]);

test("the Show Visuals renderer, audio analysis, and signal server remain byte-exact to approved PR #374", () => {
  for (const [relativePath, expectedHash] of approvedPr374Files) {
    const contents = readFileSync(path.join(projectRoot, relativePath));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    assert.equal(actualHash, expectedHash, relativePath);
  }
});
