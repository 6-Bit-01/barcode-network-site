import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const source = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

const legal = source("docs/legal/BARCODE_NETWORK_LEGAL_CENTER_2026-06-13.md");
const legalPage = source("src/app/legal/page.tsx");
const queueTypes = source("src/lib/queue-types.ts");
const publicQueue = source("src/components/PublicQueueSession.tsx");
const adminQueue = source("src/components/AdminRadioQueueControl.tsx");

function documentSection(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  assert.notEqual(start, -1, `missing ${startHeading}`);
  assert.notEqual(end, -1, `missing ${endHeading}`);
  return markdown.slice(start, end);
}

test("Legal Center publishes standalone Signal Hold Terms without changing Priority Terms 1.1", () => {
  assert.match(legal, /^\*\*Last Updated:\*\* August 23, 2026\s*$/m);
  assert.match(legal, /^\*\*Legal Center Version:\*\* 1\.2\s*$/m);

  const priorityTerms = documentSection(legal, "# Priority Signal Terms", "# Signal Hold Terms");
  assert.match(priorityTerms, /^\*\*Version:\*\* 1\.1\s*$/m);

  const signalHoldTerms = documentSection(legal, "# Signal Hold Terms", "# Privacy Policy");
  assert.match(signalHoldTerms, /^\*\*Version:\*\* 1\.0\s*$/m);
  assert.match(signalHoldTerms, /paid “I might leave” insurance for one eligible submitted track in one current BARCODE Radio show/i);
  assert.match(signalHoldTerms, /move that track to the bottom of the active regular queue instead of removing it because of the artist’s absence/i);
  assert.match(signalHoldTerms, /does not preserve Next In Line, Wheel Chosen, Priority, or any other special queue position/i);
  assert.match(signalHoldTerms, /does not guarantee approval, airplay, a specific time, a repeat call, a queue position, promotion, review/i);
  assert.match(signalHoldTerms, /expires when that show or session ends/i);
  assert.match(signalHoldTerms, /does not carry into another show and does not create a future queue slot, future placement, automatic credit, or automatic refund solely because the show ended first/i);
  assert.match(signalHoldTerms, /invalid, unavailable, or unsafe media; rights, copyright, or policy concerns; moderation or community-safety decisions; artist withdrawal/i);
  assert.match(signalHoldTerms, /Checkout pending or Payment Processing is not active protection/i);
  assert.match(signalHoldTerms, /only after paid confirmation from BARCODE Network’s signed Stripe webhook/i);
  assert.match(signalHoldTerms, /may be purchased only by the submitting viewer whose ownership of the eligible track is verified/i);
  assert.match(signalHoldTerms, /cannot be purchased, gifted, sent, or transferred to another artist’s track/i);
});

test("legal page metadata and navigation expose the Signal Hold section", () => {
  assert.match(legalPage, /Priority Signal Terms, Signal Hold Terms, Privacy Policy/);
  assert.match(legalPage, /"Signal Hold Terms": "signal-hold"/);
  assert.match(legalPage, /\["Signal Hold", "#signal-hold"\]/);
  assert.ok(
    legalPage.indexOf('["Priority Signal", "#priority-signal"]')
      < legalPage.indexOf('["Signal Hold", "#signal-hold"]'),
    "Signal Hold should follow Priority Signal in legal navigation",
  );
  assert.ok(
    legalPage.indexOf('["Signal Hold", "#signal-hold"]')
      < legalPage.indexOf('["Privacy", "#privacy"]'),
    "Signal Hold should precede Privacy in legal navigation",
  );
});

test("public Signal Hold copy stays owner-only, plain, and distinct from active protection", () => {
  const publicContract = `${queueTypes}\n${publicQueue}`;
  assert.match(publicQueue, /Signal Hold/i);
  assert.match(publicContract, /bottom instead of remov/i);
  assert.match(publicContract, /only (?:for|through) this show|one show only|current show only/i);
  assert.match(publicContract, /does not (?:hold|preserve) (?:your |a |the )?(?:place|position)/i);
  assert.match(publicContract, /does not guarantee (?:play|airplay)/i);
  assert.match(publicContract, /pending[^.]{0,120}not active|not active[^.]{0,120}pending/i);
  assert.match(publicQueue, /viewerSubmittedTrackIds/);
  assert.doesNotMatch(publicContract, /Gift Signal Hold|Gifted Signal Hold|Boost (?:This )?.*Signal Hold|Send Signal Hold/i);
});

test("admin UI keeps Signal Hold statuses narrow and renames visible Held Priority copy", () => {
  assert.match(adminQueue, /USE SIGNAL HOLD(?:\s+—|\s+-)?\s+MOVE TO BOTTOM/i);
  assert.match(adminQueue, /Signal Hold Active/i);
  assert.match(adminQueue, /Signal Hold[\s\S]{0,500}Payment Processing|Payment Processing[\s\S]{0,500}Signal Hold/i);
  assert.match(adminQueue, /Signal Hold[\s\S]{0,500}Needs Attention|Needs Attention[\s\S]{0,500}Signal Hold/i);
  assert.match(adminQueue, /Paused Priority/);
  assert.doesNotMatch(adminQueue, /label:\s*"Held Priority"/);
  assert.doesNotMatch(adminQueue, />Held Priority(?::|\s*<\/)/);
});

test("public UI does not present relinquished historical Priority as active", () => {
  assert.match(publicQueue, /function isActivePublicPriority[\s\S]{0,300}track\.lane === "priority"/);
  assert.match(publicQueue, /const priorityActiveTrack = allSubmitted\.find\(\(track\) => isActivePublicPriority\(track\)\)/);
  assert.match(publicQueue, /function submittedPublicTrack[\s\S]{0,900}signalHoldStatus: submitted\.signalHoldStatus/);
  assert.match(publicQueue, /PRIORITY PAYMENT RECORDED · POSITION NOT ACTIVE/);
  assert.match(publicQueue, /PAYMENT CONFIRMED — PRIORITY NOT ACTIVE/);
});
