import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(
  projectRoot,
  "src/app/admin/queue/recovery-priority-checkouts/page.tsx",
);

function pageSource() {
  return fs.readFileSync(pagePath, "utf8");
}

test("priority recovery page performs one credentialed no-store GET to the fixed inventory endpoint", () => {
  const source = pageSource();
  const fetches = [...source.matchAll(/fetch\(\s*["']([^"']+)["']/g)];

  assert.deepEqual(
    fetches.map((match) => match[1]),
    ["/api/admin/queue/recovery/priority-checkouts"],
  );
  assert.match(source, /method:\s*["']GET["']/);
  assert.match(source, /credentials:\s*["']same-origin["']/);
  assert.match(source, /cache:\s*["']no-store["']/);
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
});

test("priority recovery page labels fallback evidence and exposes no mutation controls", () => {
  const source = pageSource();

  assert.match(source, /Admin access required/);
  assert.match(source, /Loading priority recovery inventory/);
  assert.match(source, /Machine-readable inventory/);
  assert.match(source, /product description is the strongest Stripe identity evidence/i);
  assert.match(source, /line_item_description/);
  assert.match(source, /does not prove\s+playback/);
  assert.match(source, /<pre\b/);
  assert.match(source, /JSON\.stringify\(inventory, null, 2\)/);
  assert.doesNotMatch(source, /<(?:button|form)\b/);
  assert.doesNotMatch(source, /\bonClick\s*=/);
  assert.doesNotMatch(source, /\b(?:create|update|refund|cancel)\s*\(|STRIPE_SECRET_KEY|customer_details|payment_method/);
});
