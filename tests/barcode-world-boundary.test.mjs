import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gameFiles = [
  "src/app/world/playtest/page.tsx",
  "src/components/BarcodeWorldGreybox.tsx",
  "src/lib/barcode-world/constants.mjs",
  "src/lib/barcode-world/engine.mjs",
];

test("greybox is production-gated, unlinked, local-only, and has no live-system dependency", async () => {
  const contents = await Promise.all(
    gameFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  );
  const combined = contents.map(([, source]) => source).join("\n");
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /process\.env\.NODE_ENV === "production"/,
  );
  assert.match(
    contents.find(([path]) => path.endsWith("page.tsx"))[1],
    /notFound\(\)/,
  );
  assert.doesNotMatch(
    combined,
    /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/,
  );
  assert.doesNotMatch(
    combined,
    /\b(localStorage|sessionStorage|indexedDB)\b/,
  );
  assert.doesNotMatch(
    combined,
    /(?:from|import)\s+["'][^"']*(?:bnl|queue|relay|journal|supabase|redis)/i,
  );

  const publicShell = (
    await Promise.all(
      [
        "src/components/Header.tsx",
        "src/app/layout.tsx",
        "src/app/sitemap.ts",
      ].map((path) => readFile(path, "utf8")),
    )
  ).join("\n");
  assert.doesNotMatch(publicShell, /\/world\/playtest/);
});
