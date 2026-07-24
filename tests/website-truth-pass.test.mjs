import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage identifies 6 Bit without adding a GALAKNOISE credit", () => {
  const content = read("src/content.ts");
  const homepage = content.slice(
    content.indexOf("export const homePage"),
    content.indexOf("// ----- RADIO PAGE -----"),
  );

  assert.match(homepage, /6 Bit is the artist, MC, and host/);
  assert.doesNotMatch(homepage, /GALAKNOISE/);
  assert.match(content, /role: "Artist \/ MC \/ Host"/);
  assert.match(content, /role: "BARCODE Music Producer"/);
  assert.doesNotMatch(content, /6 Bit is the artist, producer, and host/);
  assert.doesNotMatch(content, /hip-hop artist, producer, live host/);
});

test("Database is framed as a public dossier surface without removing in-world clearance", () => {
  const content = read("src/content.ts");
  const databasePage = read("src/app/database/page.tsx");
  const databaseTable = read("src/components/DatabaseTable.tsx");

  assert.match(content, /A public dossier index/);
  assert.match(databasePage, /A public dossier index/);
  assert.doesNotMatch(`${content}\n${databasePage}`, /Internal dossier system/);
  assert.match(content, /clearance: "INTERNAL"/);
  assert.match(content, /clearance: "RESTRICTED"/);

  for (const category of ["Artist", "Collaborator", "Community"]) {
    assert.match(databaseTable, new RegExp(`"${category}"`));
  }
  assert.match(databaseTable, /Artist: "\/\/ ARTISTS"/);
  assert.match(databaseTable, /Collaborator: "\/\/ COLLABORATORS"/);
  assert.match(databaseTable, /Community: "\/\/ COMMUNITY"/);
});

test("release history preserves all three cards and corrects Vol. 1 and redacted Vol. 0 copy", () => {
  const content = read("src/content.ts");
  const signalBreach = content.indexOf('title: "BARCODE: Signal Breach"');
  const volumeOne = content.indexOf('title: "BARCODE Vol. 1"');
  const redacted = content.indexOf('title: "[REDACTED]"');

  assert.ok(signalBreach >= 0 && signalBreach < volumeOne && volumeOne < redacted);
  assert.match(content, /BARCODE's first human-collaboration album/);
  assert.match(content, /Vol\. 0 is the first BARCODE album; its public identity remains redacted/);
  assert.match(content, /A two-part re-release remains planned; release dates are not yet confirmed/);
  assert.doesNotMatch(content, /The inaugural transmission/);
  assert.doesNotMatch(content, /scheduled for re-release/);
});

test("First Wave merch remains visible as an out-of-stock archive without retired-store actions", () => {
  const content = read("src/content.ts");
  const merchPage = read("src/app/merch/page.tsx");

  assert.equal((content.match(/status: "OUT OF STOCK"/g) ?? []).length, 4);
  assert.match(content, /STOREFRONT .* RETIRED/);
  assert.match(content, /AVAILABILITY .* OUT OF STOCK/);
  assert.match(merchPage, /1st Wave — Archived Drop/);
  assert.match(merchPage, /Storefront retired/);
  assert.match(merchPage, /\{product\.status\}/);
  assert.doesNotMatch(`${content}\n${merchPage}`, /6bithiphop\.com/);
  assert.doesNotMatch(content, /storeUrl:/);
  assert.doesNotMatch(merchPage, /product\.href|Get it|View Store/);
  assert.doesNotMatch(content, /SUPPLY_CHAIN .* ACTIVE|DISTRIBUTION .* ONLINE/);
});
