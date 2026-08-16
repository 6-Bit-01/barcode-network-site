import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryPath = "src/lib/queue-historical-evidence-repository.ts";
const importPath = "src/lib/queue-historical-evidence-import.ts";
const repositorySource = fs.readFileSync(repositoryPath, "utf8");
const importSource = fs.readFileSync(importPath, "utf8");

test("repository is read-only and writer exposes one create-only Blob operation", () => {
  assert.match(repositorySource, /import \{ get, list \} from "@vercel\/blob";/);
  assert.doesNotMatch(repositorySource, /import \{[^}]*\b(?:put|del|copy|upload)\b[^}]*\} from "@vercel\/blob";/);
  assert.match(importSource, /import \{ put \} from "@vercel\/blob";/);
  assert.doesNotMatch(importSource, /import \{[^}]*\b(?:get|list|del|copy|upload)\b[^}]*\} from "@vercel\/blob";/);
  assert.match(importSource, /allowOverwrite: false/);
  assert.match(importSource, /addRandomSuffix: false/);
  assert.match(importSource, /access: "private"/);
  assert.match(importSource, /contentType: "application\/json"/);
  assert.match(importSource, /cacheControlMaxAge: 60/);
  assert.doesNotMatch(`${repositorySource}\n${importSource}`, /\bdel\s*\(|\bdeleteBlob\b|allowOverwrite:\s*true/);
});

test("declared Blob SDK minimum includes consistent private reads", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const packageLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  assert.equal(packageJson.dependencies["@vercel/blob"], "^2.6.1");
  assert.equal(packageLock.packages[""].dependencies["@vercel/blob"], "^2.6.1");
  assert.equal(packageLock.packages["node_modules/@vercel/blob"].version, "2.6.1");
  assert.match(repositorySource, /useCache: false/);
});

test("historical repository uses only its dedicated environment variable", () => {
  assert.match(repositorySource, /process\.env\.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(repositorySource, /process\.env\.(?:BLOB_READ_WRITE_TOKEN|VERCEL_OIDC_TOKEN|QUEUE_REDIS_REST_TOKEN|UPSTASH_REDIS_REST_TOKEN)/);
  assert.doesNotMatch(importSource, /process\.env\./);
});

test("historical evidence foundation has no live QueueStore, Redis, fetch, or upload-state dependency", () => {
  const combined = `${repositorySource}\n${importSource}`;
  assert.doesNotMatch(combined, /from ["']\.\/?queue["']/);
  assert.doesNotMatch(combined, /queue-types|@upstash\/redis|\bRedis\b|\bfetch\s*\(/);
  assert.doesNotMatch(combined, /barcode-radio-queue\/(?!historical-evidence)/);
});

test("only the isolated writer and admin historical routes consume the repository", () => {
  const allowed = new Set([
    importPath,
    "src/app/api/admin/queue/historical-evidence/_shared.ts",
    "src/app/api/admin/queue/historical-evidence/route.ts",
    "src/app/api/admin/queue/historical-evidence/dry-run/route.ts",
  ]);
  const consumers = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const pathname = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(pathname);
      else if (/\.(?:ts|tsx|mjs)$/.test(entry.name)) {
        const source = fs.readFileSync(pathname, "utf8");
        if (source.includes("queue-historical-evidence-repository")) consumers.push(pathname);
      }
    }
  };
  walk("src");
  assert.deepEqual(consumers.sort(), [...allowed].sort());
});
