import { CREW_HISTORY_START, crewArchiveAvailable, crewArchiveShows, crewDate, crewNumber, crewText, genuineQueueTrack } from "./crew-show";
import type { QueueEntry, QueuePublicStats, QueueState } from "./queue-types";
import type { QueueShowReport } from "./queue-show-report";
export type CrewAccountInsights = { total: number; verified: number; active: number; suspended: number; signupsByMonth: { month: string; count: number }[] };
type Outcomes = { submitted: number; finished: number; skipped: number; removed: number; unknown: number };
export type CrewShowSummary = Outcomes & { id: string; title: string; showDate: string; broadcastSeconds: number | null; coverage: "partial"; pacing: { modeledMusicSeconds: number | null; observedMusicSeconds: number | null; observedTrackCount: number | null; fallbackTrackCount: number | null; observedCoveragePercent: number | null; tracksPerHour: number | null; averageTransitionSeconds: number | null; commercialSeconds: number | null; wheelSeconds: number | null } | null };
type Financials = { available: boolean; basis: "recorded_confirmed_gross"; coverage: "partial"; scannedShows: number; availableShows: number; currencies: { currency: string; amountCents: number; paymentCount: number }[]; refunds: null; net: null };
export type CrewShowAnalytics = {
 schemaVersion: "barcode_crew_insights_v1"; available: boolean;
 source: { readAt: string; archiveBuiltAt: string | null; archiveRevision: number | null; historyCoverageStartedAt: string; coverage: "retained_public_archive" };
 overview: (Outcomes & { showCount: number; creditedArtistGroups: number; repeatArtistGroups: number }) | null;
 shows: CrewShowSummary[]; comparison: { latest: CrewShowSummary | null; previous: CrewShowSummary | null };
 artists: { label: string; showCount: number; trackCount: number; identityStatus: "credited_group_not_verified_identity" }[];
 accounts: CrewAccountInsights | null; unavailable: string[]; financials?: Financials;
};
export type CrewAnalyticsInput = { stats: QueuePublicStats | null; reports: { sessionId: string; report: QueueShowReport }[]; accounts: CrewAccountInsights | null; owner: boolean; paymentStates?: QueueState[]; paymentsAvailable?: boolean };
function accountsProjection(value: CrewAccountInsights | null): CrewAccountInsights | null {
 if (!value || [value.total, value.verified, value.active, value.suspended].some(number => crewNumber(number) === null || !Number.isSafeInteger(number))) return null;
 return { total: value.total, verified: value.verified, active: value.active, suspended: value.suspended, signupsByMonth: value.signupsByMonth.filter(row => /^\d{4}-\d{2}$/.test(row.month) && Number.isSafeInteger(row.count) && row.count >= 0).slice(-36).map(row => ({ month: row.month, count: row.count })) };
}
function confirmedPayments(states: QueueState[], eligibleIds: Set<string>) {
 const payments = new Map<string, { currency: string; amountCents: number } | null>();
 function remember(id: unknown, provider: unknown, paidAt: unknown, amount: unknown, currency: unknown) {
  if (provider !== "stripe" || typeof id !== "string" || !/^(pi_|cs_)[A-Za-z0-9_]+$/.test(id) || !crewDate(paidAt) || !Number.isSafeInteger(amount) || (amount as number) <= 0 || typeof currency !== "string" || !/^[a-zA-Z]{3}$/.test(currency)) return;
  const record = { currency: currency.toUpperCase(), amountCents: amount as number }, old = payments.get(id);
  if (old === null || (old && (old.currency !== record.currency || old.amountCents !== record.amountCents))) payments.set(id, null);
  else payments.set(id, record);
 }
 for (const state of states) {
  if (!state.session || state.session.purpose !== "live_broadcast" || state.session.status !== "archived" || !eligibleIds.has(state.session.sessionId)) continue;
  const entries: QueueEntry[] = [...state.queue, ...state.history, ...(state.removed ?? []), ...(state.spotlight ?? []), ...(state.nowPlaying ? [state.nowPlaying] : []), ...(state.nextInLine ? [state.nextInLine] : [])];
  for (const track of entries.filter(genuineQueueTrack)) {
   if (["paid", "paid_needs_attention", "refunded"].includes(track.priorityUpgradeStatus ?? "")) remember(track.priorityUpgradePaymentId, track.priorityUpgradePaymentProvider, track.priorityUpgradePaidAt, track.priorityUpgradeAmountCents, track.priorityUpgradeCurrency);
   if (["active", "paid_needs_attention", "fulfilled", "expired", "refunded"].includes(track.signalHoldStatus ?? "")) remember(track.signalHoldPaymentId, track.signalHoldPaymentProvider, track.signalHoldPaidAt, track.signalHoldAmountCents, track.signalHoldCurrency);
  }
 }
 const currencies = new Map<string, { currency: string; amountCents: number; paymentCount: number }>();
 for (const record of payments.values()) if (record) { const total = currencies.get(record.currency) ?? { currency: record.currency, amountCents: 0, paymentCount: 0 }; total.amountCents += record.amountCents; total.paymentCount++; currencies.set(record.currency, total); }
 return [...currencies.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}
export function buildCrewShowAnalytics(input: CrewAnalyticsInput, now = new Date()): CrewShowAnalytics {
 input = { ...input, stats: crewArchiveAvailable(input.stats) ? input.stats : null };
 const archive = crewArchiveShows(input.stats), reports = new Map(input.reports.map(item => [item.sessionId, item.report]));
 const artists = new Map<string, { label: string; tracks: Set<string>; shows: Set<string> }>();
 const shows: CrewShowSummary[] = archive.map(show => {
  const outcomes: Outcomes = { submitted: 0, finished: 0, skipped: 0, removed: 0, unknown: 0 }, seen = new Set<string>();
  for (const track of show.trackRoster) {
   if (seen.has(track.trackId)) continue; seen.add(track.trackId); outcomes.submitted++;
   if (track.outcome === "finished" || track.outcome === "skipped" || track.outcome === "removed") outcomes[track.outcome]++; else outcomes.unknown++;
   if (track.projectKey) { const artist = artists.get(track.projectKey) ?? { label: crewText(track.projectLabel), tracks: new Set<string>(), shows: new Set<string>() }; artist.tracks.add(show.sessionId + ":" + track.trackId); artist.shows.add(show.sessionId); artists.set(track.projectKey, artist); }
  }
  const report = reports.get(show.sessionId), pacing = report?.pacing;
  return { id: crewText(show.sessionId, 128), title: crewText(show.title), showDate: crewText(show.showDate, 10), ...outcomes, broadcastSeconds: crewNumber(report?.timeline.broadcastDurationSeconds), coverage: "partial", pacing: pacing ? { modeledMusicSeconds: crewNumber(pacing.modeledMusicAirtimeSeconds), observedMusicSeconds: crewNumber(pacing.directlyObservedMusicAirtimeSeconds), observedTrackCount: crewNumber(pacing.directlyObservedTrackCount), fallbackTrackCount: crewNumber(pacing.fallbackTrackCount), observedCoveragePercent: crewNumber(pacing.observedTrackCoveragePercent), tracksPerHour: crewNumber(pacing.tracksPerBroadcastHour), averageTransitionSeconds: crewNumber(pacing.averageTransitionSeconds), commercialSeconds: crewNumber(pacing.sponsorBreakSeconds), wheelSeconds: crewNumber(pacing.wheelCeremonySeconds) } : null };
 });
 const total = shows.reduce<Outcomes>((sum, show) => ({ submitted: sum.submitted + show.submitted, finished: sum.finished + show.finished, skipped: sum.skipped + show.skipped, removed: sum.removed + show.removed, unknown: sum.unknown + show.unknown }), { submitted: 0, finished: 0, skipped: 0, removed: 0, unknown: 0 });
 const artistRows = [...artists.values()].map(artist => ({ label: artist.label, showCount: artist.shows.size, trackCount: artist.tracks.size, identityStatus: "credited_group_not_verified_identity" as const })).sort((left, right) => right.showCount - left.showCount || left.label.localeCompare(right.label));
 const dto: CrewShowAnalytics = { schemaVersion: "barcode_crew_insights_v1", available: input.stats !== null, source: { readAt: now.toISOString(), archiveBuiltAt: crewDate(input.stats?.builtAt), archiveRevision: crewNumber(input.stats?.sourceRevision), historyCoverageStartedAt: CREW_HISTORY_START, coverage: "retained_public_archive" }, overview: input.stats ? { ...total, showCount: shows.length, creditedArtistGroups: artistRows.length, repeatArtistGroups: artistRows.filter(artist => artist.showCount > 1).length } : null, shows, comparison: { latest: shows[0] ?? null, previous: shows[1] ?? null }, artists: artistRows.slice(0, 50), accounts: accountsProjection(input.accounts), unavailable: ["website_visits_and_referral_funnel", "tiktok_unique_viewers", "captured_bnl_and_tiktok_engagement"] };
 // Authority is checked before even walking payment records. Crew DTOs have no financial envelope.
 if (input.owner) { const eligibleIds = new Set(archive.map(show => show.sessionId)), states = input.paymentStates ?? []; dto.financials = { available: input.stats !== null && input.paymentsAvailable !== false && input.paymentStates !== undefined, basis: "recorded_confirmed_gross", coverage: "partial", scannedShows: new Set(states.filter(state => state.session && eligibleIds.has(state.session.sessionId)).map(state => state.session!.sessionId)).size, availableShows: archive.length, currencies: input.paymentsAvailable === false ? [] : confirmedPayments(states, eligibleIds), refunds: null, net: null }; }
 return dto;
}
