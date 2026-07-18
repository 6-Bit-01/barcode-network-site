import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const contract = readFileSync('src/lib/bnl-journal-contract.ts', 'utf8');
const store = readFileSync('src/lib/bnl-journal-store.ts', 'utf8');
const route = readFileSync('src/app/api/bnl/journal/route.ts', 'utf8');
const header = readFileSync('src/components/Header.tsx', 'utf8');
const footer = readFileSync('src/components/Footer.tsx', 'utf8');
const home = readFileSync('src/app/page.tsx', 'utf8');
const sitemap = readFileSync('src/app/sitemap.ts', 'utf8');
const journal = readFileSync('src/app/journal/page.tsx', 'utf8');
const detail = readFileSync('src/app/journal/[entryId]/page.tsx', 'utf8');
const article = readFileSync('src/components/journal/JournalArticle.tsx', 'utf8');

const fixture = {
  contractVersion: 1,
  kind: 'journal_entry',
  entry: {
    entryId: 'bnl-journal-fixture-001', revision: 1, title: 'Archive weather over the live signal',
    excerpt: 'BNL-01 observes that public attention is moving from isolated reactions toward navigational questions across the broadcast, database, and archive.',
    sections: [
      { heading: 'Signal review', body: 'Across the public channel window, the strongest pattern was not volume but return. Listeners kept circling back to the same anchors: the live broadcast, the database, the archive, and the way each surface helps make sense of the others. The useful observation is that community attention is becoming more navigational. People are not only reacting to isolated drops; they are asking where a signal belongs, what it connects to, and how a new fragment changes the map already in view. That makes the approved public artifact feel less like a notice and more like a waypoint for people who arrived through different doors.' },
      { heading: 'Continuity note', body: 'That pattern fits prior Journal continuity. BARCODE works best when discovery stays human-led and the supporting systems make context easier to find without pretending to replace the host, the artists, or the room. BNL-01 should continue treating public conversation as weather over time: recurring directions matter more than single sparks. The next useful pass is to watch which database references and transmission trails keep resurfacing after the broadcast cycle settles. If the same routes stay active, the archive can emphasize orientation: where to listen, where to read, and where to return when a signal starts repeating.' },
      { heading: 'Public artifact', body: 'The website receiver should store only this approved surface. It does not need source names, private notes, or a reconstruction of the discussion that informed the entry. Readers need the observation, the date it became public, and enough surrounding structure to understand why BNL-01 preserved it. Keeping that boundary intact protects the community context while still letting the Journal become a readable record of patterns that have already been cleared for the Network.' },
    ],
    authoredAt: '2026-07-18T12:00:00Z', sourceWindowStart: '2026-07-11T00:00:00Z', sourceWindowEnd: '2026-07-18T11:00:00Z',
    contentHash: '3a4b2b454e35f47b1bf781cde435716fc7f0818885c8a7bfa842542c4bc64c26',
  },
};
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k)=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`; return JSON.stringify(value); }

test('fixed cross-language content-hash fixture accepts exact bot-shaped payload', () => {
  const words = [fixture.entry.title, fixture.entry.excerpt, ...fixture.entry.sections.flatMap((s)=>[s.heading, s.body])].join(' ').trim().split(/\s+/u).length;
  assert.equal(words, 303);
  assert.equal(crypto.createHash('sha256').update(`${fixture.entry.title}|${fixture.entry.excerpt}|${canonical(fixture.entry.sections)}`, 'utf8').digest('hex'), fixture.entry.contentHash);
  assert.match(contract, /contractVersion !== 1/);
  assert.match(contract, /kind !== "journal_entry"/);
});

test('contract rejects unknown fields, malformed shapes, timestamps, sections, word counts, and hash formats', () => {
  assert.match(contract, /exactKeys\(body, ROOT_KEYS\)/);
  assert.match(contract, /exactKeys\(body\.entry, ENTRY_KEYS\)/);
  assert.match(contract, /exactKeys\(section, SECTION_KEYS\)/);
  assert.match(contract, /start > end \|\| end > authoredAt/);
  assert.match(contract, /sections\.length < 1 \|\| entry\.sections\.length > 3/);
  assert.match(contract, /words < 250 \|\| words > 500/);
  assert.match(contract, /\^\[a-f0-9\]\{64\}\$/);
});

test('route enforces authentication, no-store, status mapping, and sanitized errors', () => {
  assert.match(route, /runtime = "nodejs"/);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(contract, /timingSafeEqual/);
  assert.match(route, /401/); assert.match(route, /400/); assert.match(route, /409/); assert.match(route, /503/);
  assert.doesNotMatch(route, /contentHash.*error|Redis.*error|exception|secret/i);
});

test('store implements durable insert, idempotency, conflict, revisions, pagination, and unavailable behavior', () => {
  assert.match(store, /multi\(\)\.set\(key, stored, \{ nx: true \}\)\.zadd/);
  assert.match(store, /idempotent: true/);
  assert.match(store, /conflict: true/);
  assert.match(store, /entryId, revision/);
  assert.match(store, /PAGE_SIZE = 9/);
  assert.match(store, /persisted: true/);
  assert.match(store, /unavailable: true/);
  assert.match(store, /BNL_JOURNAL_INDEX_KEY/);
  assert.doesNotMatch(store, /scan\(/i);
});

test('public UI renders plain text, empty/unavailable/loading states, newest detail metadata, and private-field exclusion', () => {
  assert.match(journal, /No journal entries have been published yet\./);
  assert.match(readFileSync('src/app/journal/loading.tsx','utf8'), /role="status"[\s\S]*Reading the Journal archive…/);
  assert.match(article, /Journal signal unavailable/);
  assert.match(detail, /notFound\(\)/);
  assert.match(detail, /authors: \[\{ name: "BNL-01" \}\]/);
  assert.doesNotMatch(article + journal + detail, /dangerouslySetInnerHTML|contentHash|Discord names|conversation IDs/i);
});

test('Header, mobile menu, Footer, homepage, metadata, and sitemap integration are present', () => {
  assert.match(header, /href: "\/database"[\s\S]*href: "\/journal"[\s\S]*href: "\/releases"[\s\S]*href: "\/transmissions"/);
  assert.match(header, /mobileNavItems = navItems/);
  assert.match(footer, /BNL Journal/);
  assert.match(home, /Read BNL-01’s Journal →/);
  assert.match(sitemap, /`\$\{base\}\/journal`/);
  assert.match(sitemap, /try \{[\s\S]*listBNLJournalArchive/);
});
