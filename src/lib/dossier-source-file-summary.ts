import type {
  DossierCandidate,
  DossierDraft,
  DossierRecommendation,
} from "./dossier-workflow";
import {
  containsDossierBackendJunk,
  hasDossierMeaningfulPattern,
  sanitizeDossierMeaningItems,
} from "./dossier-note-display";

export type DossierSourceFileSubstanceLevel =
  | "thin"
  | "partial"
  | "useful"
  | "strong";

export type DossierSourceFilePublicReadiness =
  | "not_ready"
  | "needs_review"
  | "draftable"
  | "owner_approved";

export type DossierSourceFileNextAction =
  | "archive"
  | "enrich"
  | "attach_to_existing_dossier"
  | "draft_public_dossier"
  | "owner_review";

export type DossierSourceFileSummary = {
  currentRead: string;
  knownContext: string[];
  whyTracked: string;
  usefulEvidence: string[];
  patterns: string[];
  confirmedStrong: string[];
  claimedNeedsReview: string[];
  uncertainties: string[];
  missingInfo: string[];
  notPublicYet: string[];
  recommendedNextAction: string;
  substanceLevel: DossierSourceFileSubstanceLevel;
  publicReadiness: DossierSourceFilePublicReadiness;
  existingPublicDossier: "yes" | "no" | "linked_update_target";
  nextAction: DossierSourceFileNextAction;
  lastUpdatedAt: string;
  summarySource: "operator" | "structured" | "derived" | "thin";
};

type SummaryInput = {
  candidate: DossierCandidate;
  drafts?: DossierDraft[];
  recommendations?: DossierRecommendation[];
};

const activeDraftStatuses = new Set<DossierDraft["status"]>([
  "draft",
  "owner_changes_requested",
  "ready_for_owner_review",
]);

function unique(items: Array<string | undefined | null>, limit = 4): string[] {
  return sanitizeDossierMeaningItems(items, limit);
}

function cleanOperatorSummaryValue(value?: string | null): string | undefined {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (containsDossierBackendJunk(clean)) return undefined;
  return clean;
}

function trustedOperatorSummaryItems(
  items: Array<string | undefined | null>,
  limit = 4,
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = cleanOperatorSummaryValue(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

export const DOSSIER_THIN_FILE_WARNING =
  "This file is still thin. This source file only confirms that BNL found internal references. It does not yet contain enough human-usable context to draft from.";

export const DOSSIER_NO_MEANINGFUL_PATTERN =
  "No meaningful pattern has been extracted yet.";

function hasMeaningfulText(value?: string) {
  return sanitizeDossierMeaningItems([value], 1).length > 0;
}

function noteIsUseful(
  note: NonNullable<DossierCandidate["sourceFileNotes"]>[number],
) {
  return (
    (note.publicSafe === true ||
      note.source === "admin_manual" ||
      note.source === "owner_manual") &&
    hasMeaningfulText(note.text)
  );
}

function substanceScore({
  candidate,
  recommendations = [],
}: SummaryInput): number {
  let score = 0;
  if (hasMeaningfulText(candidate.reason)) score += 1;
  if (hasMeaningfulText(candidate.whyNow)) score += 1;
  if (hasMeaningfulText(candidate.evidenceSummary)) score += 1;
  score += Math.min(candidate.knownFacts?.length ?? 0, 3);
  score += Math.min(candidate.evidenceItems?.length ?? 0, 3);
  score += Math.min(
    (candidate.sourceFileNotes ?? []).filter(noteIsUseful).length,
    3,
  );
  score += Math.min(
    recommendations.filter(
      (recommendation) =>
        hasMeaningfulText(recommendation.reason) ||
        hasMeaningfulText(recommendation.evidenceSummary),
    ).length,
    3,
  );
  return score;
}

function substanceLevel(input: SummaryInput): DossierSourceFileSubstanceLevel {
  const score = substanceScore(input);
  if (score >= 10) return "strong";
  if (score >= 6) return "useful";
  if (score >= 3) return "partial";
  return "thin";
}

function labelLevel(level: DossierSourceFileSubstanceLevel) {
  return level[0].toUpperCase() + level.slice(1);
}

function publicReadiness(
  level: DossierSourceFileSubstanceLevel,
  drafts: DossierDraft[] = [],
): DossierSourceFilePublicReadiness {
  if (drafts.some((draft) => draft.status === "owner_approved")) {
    return "owner_approved";
  }
  if (drafts.some((draft) => draft.status === "ready_for_owner_review")) {
    return "draftable";
  }
  if (level === "useful" || level === "strong") return "needs_review";
  return "not_ready";
}

function nextAction(input: {
  candidate: DossierCandidate;
  drafts?: DossierDraft[];
  level: DossierSourceFileSubstanceLevel;
  readiness: DossierSourceFilePublicReadiness;
}): DossierSourceFileNextAction {
  const { candidate, drafts = [], level, readiness } = input;
  if (candidate.status === "archived" || candidate.status === "denied") {
    return "archive";
  }
  if (
    candidate.existingDossierMatch ||
    candidate.status === "existing_dossier_update"
  ) {
    return "attach_to_existing_dossier";
  }
  if (
    readiness === "owner_approved" ||
    drafts.some((draft) => draft.status === "ready_for_owner_review")
  ) {
    return "owner_review";
  }
  if (level === "useful" || level === "strong") return "draft_public_dossier";
  return "enrich";
}

function nextActionCopy(action: DossierSourceFileNextAction) {
  if (action === "archive")
    return "Archive or keep closed unless a lead asks for more review.";
  if (action === "attach_to_existing_dossier")
    return "Review the new context and attach only useful, public-safe updates to the linked public dossier later.";
  if (action === "draft_public_dossier")
    return "Review the evidence, separate claims from confirmed facts, then draft a public dossier only from approved material.";
  if (action === "owner_review")
    return "Send the reviewed draft or update notes through owner review before anything public changes.";
  return "Add real context: repeated appearances, channel notes, public-safe facts, missing history, and owner/admin review notes.";
}

export function createDossierSourceFileSummary(
  input: SummaryInput,
): DossierSourceFileSummary {
  const { candidate, drafts = [], recommendations = [] } = input;
  const level = substanceLevel(input);
  const readiness = publicReadiness(level, drafts);
  const action = nextAction({ candidate, drafts, level, readiness });
  const activeDraft = drafts.find((draft) =>
    activeDraftStatuses.has(draft.status),
  );
  const operatorSummary = candidate.sourceFileSummary;
  const operatorKnownContext = trustedOperatorSummaryItems(
    operatorSummary?.knownContext ?? [],
    4,
  );
  const operatorOpenQuestions = trustedOperatorSummaryItems(
    operatorSummary?.openQuestions ?? [],
    4,
  );
  const operatorNextAction = trustedOperatorSummaryItems(
    [operatorSummary?.nextAction],
    1,
  )[0];
  const operatorSummaryText = trustedOperatorSummaryItems(
    [operatorSummary?.summaryText],
    1,
  )[0];
  const structuredSummary = unique(
    [candidate.evidenceSummary, candidate.reason],
    1,
  )[0];
  const usefulEvidence = unique(
    [
      candidate.evidenceSummary,
      ...(candidate.evidenceItems ?? []).map(
        (item) => item.summary || item.label,
      ),
      ...recommendations.map(
        (recommendation) => recommendation.evidenceSummary,
      ),
    ],
    4,
  );
  const knownContext = unique(
    [
      ...(candidate.knownFacts ?? []),
      candidate.reason,
      ...(candidate.sourceFileNotes ?? [])
        .filter((note) => note.publicSafe === true)
        .map((note) => note.text),
    ],
    4,
  );
  const patterns = unique(
    [
      candidate.whyNow,
      ...recommendations.map((recommendation) => recommendation.reason),
      ...(candidate.sourceFileNotes ?? []).map((note) => note.text),
    ].filter((item) => hasDossierMeaningfulPattern(item)),
    3,
  );
  const notPublicYet = unique(
    [
      ...(candidate.publicSafetyNotes ?? []),
      ...(candidate.doNotSay ?? []),
      ...recommendations.flatMap((recommendation) => [
        ...(recommendation.publicSafetyNotes ?? []),
        ...(recommendation.doNotSay ?? []),
      ]),
    ],
    4,
  );
  const uncertainties = notPublicYet;
  const confirmedStrong = unique(
    [
      ...(candidate.knownFacts ?? []),
      ...(candidate.sourceFileNotes ?? [])
        .filter((note) => note.publicSafe === true)
        .map((note) => note.text),
    ],
    4,
  );
  const claimedNeedsReview = unique(
    [
      candidate.reason,
      candidate.whyNow,
      ...recommendations.map((recommendation) => recommendation.reason),
      ...(candidate.sourceFileNotes ?? [])
        .filter((note) => note.publicSafe !== true)
        .map((note) => note.text),
    ],
    4,
  );
  const missingInfo = unique(
    [
      ...(candidate.missingInfo ?? []),
      ...recommendations.flatMap(
        (recommendation) => recommendation.missingInfo ?? [],
      ),
    ],
    4,
  );
  const primarySummarySourceText = [
    candidate.reason,
    candidate.whyNow,
    candidate.evidenceSummary,
  ].join(" ");
  const technicalOnlyPrimaryText =
    containsDossierBackendJunk(primarySummarySourceText) &&
    !(candidate.knownFacts ?? []).length &&
    !(candidate.evidenceItems ?? []).length &&
    !(candidate.sourceFileNotes ?? []).some(
      (note) =>
        note.publicSafe === true && !containsDossierBackendJunk(note.text),
    );
  const summarySource = operatorSummaryText
    ? "operator"
    : level === "thin" || technicalOnlyPrimaryText
      ? "thin"
      : structuredSummary
        ? "structured"
        : "derived";

  return {
    currentRead:
      operatorSummaryText ??
      (summarySource === "thin"
        ? DOSSIER_THIN_FILE_WARNING
        : `${candidate.name} has a ${labelLevel(level).toLowerCase()} internal case file. Review what is confirmed, what is only claimed, and what still needs owner/admin review before drafting from it.`),
    knownContext:
      operatorKnownContext.length > 0
        ? operatorKnownContext
        : knownContext.length > 0
          ? knownContext
          : [
              "BNL has this subject in the internal review workspace, but no substantial public-safe context has been captured yet.",
            ],
    whyTracked:
      unique([candidate.reason, candidate.whyNow], 1)[0] ||
      "This subject is being tracked because it appeared in BNL records and needs human review before any public use.",
    usefulEvidence:
      usefulEvidence.length > 0
        ? usefulEvidence
        : [
            "No useful evidence has been captured yet beyond the fact that this internal file exists.",
          ],
    patterns: patterns.length > 0 ? patterns : [DOSSIER_NO_MEANINGFUL_PATTERN],
    confirmedStrong:
      confirmedStrong.length > 0
        ? confirmedStrong
        : ["No confirmed public-safe facts have been separated yet."],
    claimedNeedsReview:
      claimedNeedsReview.length > 0
        ? claimedNeedsReview
        : ["No human-readable claims have been extracted yet."],
    uncertainties:
      uncertainties.length > 0
        ? uncertainties
        : [
            "Treat names, mentions, and possible connections as unconfirmed until reviewed.",
          ],
    missingInfo:
      operatorOpenQuestions.length > 0
        ? operatorOpenQuestions
        : missingInfo.length > 0
          ? missingInfo
          : [
              "Needs more history, repeated appearances, public-safe facts, and owner/admin context.",
            ],
    notPublicYet:
      notPublicYet.length > 0
        ? notPublicYet
        : ["Do not say more publicly until owner/admin review confirms it."],
    recommendedNextAction: operatorNextAction ?? nextActionCopy(action),
    substanceLevel: level,
    publicReadiness: readiness,
    existingPublicDossier: candidate.existingDossierMatch
      ? candidate.status === "existing_dossier_update"
        ? "linked_update_target"
        : "yes"
      : "no",
    nextAction: action,
    lastUpdatedAt:
      [
        candidate.updatedAt,
        activeDraft?.updatedAt,
        recommendations[0]?.updatedAt,
      ]
        .filter(Boolean)
        .sort()
        .at(-1) ?? candidate.updatedAt,
    summarySource,
  };
}

export function formatDossierSummaryBadge(value: string): string {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
