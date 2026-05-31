import type {
  DossierCandidate,
  DossierDraft,
  DossierRecommendation,
} from "./dossier-workflow";

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
  uncertainties: string[];
  missingInfo: string[];
  recommendedNextAction: string;
  substanceLevel: DossierSourceFileSubstanceLevel;
  publicReadiness: DossierSourceFilePublicReadiness;
  existingPublicDossier: "yes" | "no" | "linked_update_target";
  nextAction: DossierSourceFileNextAction;
  lastUpdatedAt: string;
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
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = item?.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function hasMeaningfulText(value?: string) {
  return Boolean(value && value.replace(/\s+/g, " ").trim().length >= 24);
}

function noteIsUseful(note: NonNullable<DossierCandidate["sourceFileNotes"]>[number]) {
  return (
    note.publicSafe === true ||
    note.source === "admin_manual" ||
    note.source === "owner_manual" ||
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
  if (candidate.publicSafetyNotes?.length) score += 1;
  if (candidate.doNotSay?.length) score += 1;
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
  if (candidate.existingDossierMatch || candidate.status === "existing_dossier_update") {
    return "attach_to_existing_dossier";
  }
  if (readiness === "owner_approved" || drafts.some((draft) => draft.status === "ready_for_owner_review")) {
    return "owner_review";
  }
  if (level === "useful" || level === "strong") return "draft_public_dossier";
  return "enrich";
}

function nextActionCopy(action: DossierSourceFileNextAction) {
  if (action === "archive") return "Archive or keep closed unless a lead asks for more review.";
  if (action === "attach_to_existing_dossier") return "Review the new context and attach only useful, public-safe updates to the linked public dossier later.";
  if (action === "draft_public_dossier") return "Review the evidence, separate claims from confirmed facts, then draft a public dossier only from approved material.";
  if (action === "owner_review") return "Send the reviewed draft or update notes through owner review before anything public changes.";
  return "Add real context: repeated appearances, channel notes, public-safe facts, missing history, and owner/admin review notes.";
}

export function createDossierSourceFileSummary(
  input: SummaryInput,
): DossierSourceFileSummary {
  const { candidate, drafts = [], recommendations = [] } = input;
  const level = substanceLevel(input);
  const readiness = publicReadiness(level, drafts);
  const action = nextAction({ candidate, drafts, level, readiness });
  const activeDraft = drafts.find((draft) => activeDraftStatuses.has(draft.status));
  const usefulEvidence = unique(
    [
      candidate.evidenceSummary,
      ...(candidate.evidenceItems ?? []).map((item) => item.summary || item.label),
      ...recommendations.map((recommendation) => recommendation.evidenceSummary),
    ],
    4,
  );
  const knownContext = unique(
    [
      ...((candidate.knownFacts ?? []).length
        ? candidate.knownFacts ?? []
        : [candidate.reason]),
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
    ],
    3,
  );
  const uncertainties = unique(
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
  const missingInfo = unique(
    [
      ...(candidate.missingInfo ?? []),
      ...recommendations.flatMap((recommendation) => recommendation.missingInfo ?? []),
    ],
    4,
  );
  const thinCopy =
    "This file is currently thin. It confirms the subject exists in BNL records, but it does not yet contain enough history, repeated behavior, channel context, or public-safe facts to support a useful dossier.";

  return {
    currentRead:
      level === "thin"
        ? thinCopy
        : `${candidate.name} has a ${labelLevel(level).toLowerCase()} internal case file. Review what is confirmed, what is only claimed, and what still needs owner/admin review before drafting from it.`,
    knownContext:
      knownContext.length > 0
        ? knownContext
        : ["BNL has this subject in the internal review workspace, but no substantial public-safe context has been captured yet."],
    whyTracked:
      candidate.reason ||
      candidate.whyNow ||
      "This subject is being tracked because it appeared in BNL records and needs human review before any public use.",
    usefulEvidence:
      usefulEvidence.length > 0
        ? usefulEvidence
        : ["No useful evidence has been captured yet beyond the fact that this internal file exists."],
    patterns:
      patterns.length > 0
        ? patterns
        : ["No repeated pattern has been established yet."],
    uncertainties:
      uncertainties.length > 0
        ? uncertainties
        : ["Treat names, mentions, and possible connections as unconfirmed until reviewed."],
    missingInfo:
      missingInfo.length > 0
        ? missingInfo
        : ["Needs more history, repeated appearances, public-safe facts, and owner/admin context."],
    recommendedNextAction: nextActionCopy(action),
    substanceLevel: level,
    publicReadiness: readiness,
    existingPublicDossier: candidate.existingDossierMatch
      ? candidate.status === "existing_dossier_update"
        ? "linked_update_target"
        : "yes"
      : "no",
    nextAction: action,
    lastUpdatedAt:
      [candidate.updatedAt, activeDraft?.updatedAt, recommendations[0]?.updatedAt]
        .filter(Boolean)
        .sort()
        .at(-1) ?? candidate.updatedAt,
  };
}

export function formatDossierSummaryBadge(value: string): string {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
