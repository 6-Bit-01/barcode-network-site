import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(
  projectRoot,
  "src/app/admin/queue/recovery-uploads/page.tsx",
);

function pageSource() {
  return fs.readFileSync(pagePath, "utf8");
}

test("queue upload recovery page performs one credentialed no-store GET to the existing inventory endpoint", () => {
  const source = pageSource();
  const fetches = [...source.matchAll(/fetch\(\s*["']([^"']+)["']/g)];

  assert.deepEqual(
    fetches.map((match) => match[1]),
    ["/api/admin/queue/recovery/uploads"],
  );
  assert.match(source, /method:\s*["']GET["']/);
  assert.match(source, /credentials:\s*["']same-origin["']/);
  assert.match(source, /cache:\s*["']no-store["']/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});

test("queue upload recovery page renders guarded read-only states and no mutation controls", () => {
  const source = pageSource();

  assert.match(source, /Admin access required/);
  assert.match(source, /Loading recovery inventory/);
  assert.match(source, /Inventory unavailable/);
  assert.match(source, /Machine-readable inventory/);
  assert.match(source, /<pre\b/);
  assert.match(source, /JSON\.stringify\(inventory, null, 2\)/);
  assert.doesNotMatch(source, /<(?:button|form)\b/);
  assert.doesNotMatch(source, /\bonClick\s*=/);
  assert.doesNotMatch(source, /@vercel\/blob|QUEUE_REDIS|UPSTASH_REDIS|\b(?:put|del)\s*\(/);
});
