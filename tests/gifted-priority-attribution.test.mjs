import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const source = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

test("gifted Priority checkout captures only the explicit public name and binds it to Stripe metadata", () => {
  const publicQueue = source("src/components/PublicQueueSession.tsx");
  const checkoutRoute = source("src/app/api/queue/priority-checkout/route.ts");
  const stripe = source("src/lib/stripe.ts");
  const webhook = source("src/app/api/stripe/webhook/route.ts");

  assert.match(publicQueue, /Your public name · optional/);
  assert.match(publicQueue, /Leave blank to show Anonymous/);
  assert.match(publicQueue, /priorityGiftAttributionDisclosureText: PRIORITY_GIFT_ATTRIBUTION_DISCLOSURE_TEXT/);
  assert.match(publicQueue, /submitterToken/);
  assert.match(publicQueue, /checkoutOwnerToken/);
  assert.match(publicQueue, /priorityCheckoutOwnerTrackIds\.has\(track\.id\)/);
  assert.match(checkoutRoute, /storedCheckoutBelongsToRequester/);
  assert.match(checkoutRoute, /checkoutOwnerTokenHash: hashPriorityCheckoutOwnerToken/);
  assert.match(checkoutRoute, /Only the person who started it can resume it/);
  assert.match(checkoutRoute, /submitterToken === checkoutRequest\.track\.submitterToken/);
  assert.match(checkoutRoute, /!requesterOwnsTrack && body\.priorityGift !== true/);
  assert.match(checkoutRoute, /const priorityGiftAttribution = !requesterOwnsTrack/);
  assert.match(checkoutRoute, /createPriorityGiftAttribution/);
  assert.match(stripe, /priorityGiftSupporterName: priorityGiftAttribution\.supporterName/);
  assert.match(stripe, /priorityGiftRecipientName: priorityGiftAttribution\.recipientName/);
  assert.match(stripe, /payment_intent_data: \{ metadata \}/);
  assert.match(webhook, /priorityGiftAttributionForSession/);
  assert.match(webhook, /checkoutSessionId: session\.id/);
  assert.match(webhook, /event\.created/);
  assert.doesNotMatch(`${checkoutRoute}\n${stripe}\n${webhook}`, /customer_details|customer_email|billing_details/);
});

test("direct Priority submission carries self-ownership and checkout-resume ownership", () => {
  const form = source("src/components/RadioQueueForm.tsx");

  assert.match(form, /getOrCreatePriorityCheckoutOwnerToken\(checkoutSessionId, trackId\)/);
  assert.match(form, /JSON\.stringify\(\{ trackId, sessionId: checkoutSessionId, submitterToken, checkoutOwnerToken,/);
});

test("confirmed own and gifted purchases use one safe display rule across queue and host surfaces but stay excluded from BNL", () => {
  const queueTypes = source("src/lib/queue-types.ts");
  const publicQueue = source("src/components/PublicQueueSession.tsx");
  const publicGateway = source("src/components/PublicQueueGateway.tsx");
  const admin = source("src/components/AdminRadioQueueControl.tsx");
  const foreground = source("src/lib/foreground-overlay-resolver.ts");
  const bnl = source("src/app/api/bnl/read-model/route.ts");
  const bnlTrackType = bnl.slice(bnl.indexOf("type BnlQueueTrack"), bnl.indexOf("function bnlTrackContext"));
  const bnlProjection = bnl.slice(bnl.indexOf("function publicTrack("), bnl.indexOf("function isRealQueueEntry"));

  assert.match(queueTypes, /function confirmedPriorityPurchaseDisplay/);
  assert.match(queueTypes, /\$\{recipientName\} BOUGHT A SKIP/);
  assert.match(queueTypes, /\$\{supporterName\} BOUGHT A SKIP FOR \$\{recipientName\}/);
  assert.match(publicQueue, /function PriorityPurchaseTag/);
  assert.match(publicQueue, /confirmedPriorityPurchaseDisplay\(track\)/);
  assert.match(publicGateway, /confirmedPriorityPurchaseDisplay\(track\)/);
  assert.match(admin, /function AdminPriorityPurchaseBanner/);
  assert.match(admin, /<AdminPriorityPurchaseBanner entry=\{player\}/);
  assert.match(admin, /<AdminPriorityPurchaseBanner entry=\{entry\}/);
  assert.match(foreground, /label: purchase \? "SKIP PURCHASED" : "SKIP CONFIRMED"/);
  assert.match(foreground, /purchasedSkipOverridesScene/);
  assert.doesNotMatch(bnlTrackType, /priorityGiftAttribution/);
  assert.doesNotMatch(bnlProjection, /priorityGiftAttribution/);
});

test("submission notes are immediately readable in Next In Line, player, and operator lanes", () => {
  const admin = source("src/components/AdminRadioQueueControl.tsx");

  assert.match(admin, /function AdminSubmissionNote/);
  assert.match(admin, /Submission Note · Read Before Playing/);
  assert.match(admin, /<AdminSubmissionNote entry=\{player\} compact \/>/);
  assert.ok([...admin.matchAll(/<AdminSubmissionNote entry=\{entry\}/g)].length >= 2, "Next In Line and operator lanes must both render the note openly");
  assert.doesNotMatch(admin, /<summary[^>]*>Submission note<\/summary>/i);
});

test("the legal and operational contracts disclose the gifted attribution boundary", () => {
  const queueTypes = source("src/lib/queue-types.ts");
  const legal = source("docs/legal/BARCODE_NETWORK_LEGAL_CENTER_2026-06-13.md");
  const capability = source("docs/queue-production-capability.md");

  assert.match(queueTypes, /PRIORITY_GIFT_ATTRIBUTION_VERSION = "1\.0"/);
  assert.match(queueTypes, /public name you enter—or Anonymous if you leave it blank—will appear/);
  assert.match(legal, /\*\*Version:\*\* 1\.1/);
  assert.match(legal, /Payment-provider identity, billing identity, and customer email are never substituted/);
  assert.match(legal, /Gift attribution is attached to the specific checkout and confirmed payment/);
  assert.match(capability, /first confirmed attribution across webhook retries/);
  assert.match(capability, /not added to the BNL queue projection/);
});
