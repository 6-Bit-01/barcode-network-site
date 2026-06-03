import type { DossierRecommendation } from "./dossier-workflow";
import type { DossierSourceFileSummary } from "./dossier-source-file-summary";
import { sanitizeDossierMeaningItems } from "./dossier-note-display";

export type DossierEntityActivityReadout = {
  currentRead: string;
  knownContext: string[];
  usefulEvidence: string[];
  relationshipSignals: string[];
  publicSafePossibilities: string[];
  privateOnlyNotes: string[];
  notPublicYet: string[];
  missingInfo: string[];
  sourceAuthority: string[];
  recommendedAction: string;
  confidence?: string;
  readoutSource: "structured" | "fallback";
};

type ReadoutRecommendation = Pick<
  DossierRecommendation,
  | "subjectName"
  | "knownContext"
  | "usefulEvidence"
  | "relationshipSignals"
  | "publicSafePossibilities"
  | "privateOnlyNotes"
  | "notPublicYet"
  | "missingInfo"
  | "sourceAuthority"
  | "recommendedAction"
  | "suggestedAction"
  | "confidence"
>;

const defaultCurrentRead =
  "BNL has not attached a structured entity summary yet. Review the Source File Snapshot and add owner-reviewed context before public use.";

function cleanItems(items: Array<string | undefined | null>, limit = 6) {
  return sanitizeDossierMeaningItems(items, limit);
}

function cleanText(value?: string | null) {
  return cleanItems([value], 1)[0];
}

function unique(items: string[], limit = 6) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const clean = item.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function recommendationHasStructuredReadout(
  recommendation: ReadoutRecommendation,
) {
  return Boolean(
    recommendation.knownContext?.length ||
      recommendation.usefulEvidence?.length ||
      recommendation.relationshipSignals?.length ||
      recommendation.publicSafePossibilities?.length ||
      recommendation.privateOnlyNotes?.length ||
      recommendation.notPublicYet?.length ||
      recommendation.missingInfo?.length ||
      recommendation.sourceAuthority?.length ||
      recommendation.recommendedAction ||
      recommendation.confidence,
  );
}

function structuredReadoutFromRecommendations(
  recommendations: ReadoutRecommendation[],
  subjectName?: string,
): DossierEntityActivityReadout | null {
  const structuredRecommendations = recommendations.filter(
    recommendationHasStructuredReadout,
  );
  if (!structuredRecommendations.length) return null;

  const knownContext = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.knownContext ?? [],
    ),
  );
  const usefulEvidence = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.usefulEvidence ?? [],
    ),
  );
  const relationshipSignals = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.relationshipSignals ?? [],
    ),
  );
  const publicSafePossibilities = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.publicSafePossibilities ?? [],
    ),
  );
  const privateOnlyNotes = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.privateOnlyNotes ?? [],
    ),
  );
  const notPublicYet = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.notPublicYet ?? [],
    ),
  );
  const missingInfo = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.missingInfo ?? [],
    ),
  );
  const sourceAuthority = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.sourceAuthority ?? [],
    ),
    5,
  );
  const confidence = unique(
    structuredRecommendations
      .map((recommendation) => recommendation.confidence)
      .filter(Boolean)
      .map((item) => String(item)),
    2,
  ).join(", ");
  const recommendedAction = cleanText(
    structuredRecommendations.find((recommendation) => recommendation.recommendedAction)
      ?.recommendedAction,
  );
  const subject = subjectName ?? structuredRecommendations[0]?.subjectName;

  return {
    currentRead:
      knownContext[0] ??
      recommendedAction ??
      `BNL supplied a structured entity activity readout${subject ? ` for ${subject}` : ""}. Treat it as admin review context, not public copy.`,
    knownContext,
    usefulEvidence,
    relationshipSignals,
    publicSafePossibilities,
    privateOnlyNotes,
    notPublicYet,
    missingInfo,
    sourceAuthority,
    recommendedAction:
      recommendedAction ??
      "Owner review needed before public wording, publishing, linking, or merging.",
    confidence: confidence || undefined,
    readoutSource: "structured",
  };
}

export function createDossierEntityActivityReadoutFromSourceFile({
  summary,
  recommendations,
  subjectName,
}: {
  summary?: DossierSourceFileSummary | null;
  recommendations?: ReadoutRecommendation[];
  subjectName?: string;
}): DossierEntityActivityReadout {
  const structuredReadout = structuredReadoutFromRecommendations(
    recommendations ?? [],
    subjectName,
  );
  if (structuredReadout) return structuredReadout;

  return {
    currentRead: cleanText(summary?.currentRead) ?? defaultCurrentRead,
    knownContext: cleanItems(summary?.knownContext ?? []),
    usefulEvidence: cleanItems(summary?.usefulEvidence ?? []),
    relationshipSignals: cleanItems(summary?.privateRelationshipContext ?? []),
    publicSafePossibilities: cleanItems(summary?.publicSafePossibilities ?? []),
    privateOnlyNotes: cleanItems(summary?.privateOnlyNotes ?? []),
    notPublicYet: cleanItems(summary?.notPublicYet ?? []),
    missingInfo: cleanItems(summary?.missingInfo ?? []),
    sourceAuthority: cleanItems(summary?.sourceAuthority ?? [], 5),
    recommendedAction:
      cleanText(summary?.recommendedNextAction) ??
      "Owner review needed before public wording.",
    readoutSource: "fallback",
  };
}

export function createDossierEntityActivityReadoutFromRecommendation(
  recommendation: ReadoutRecommendation,
): DossierEntityActivityReadout {
  return (
    structuredReadoutFromRecommendations([recommendation], recommendation.subjectName) ??
    {
      currentRead: defaultCurrentRead,
      knownContext: [],
      usefulEvidence: [],
      relationshipSignals: [],
      publicSafePossibilities: [],
      privateOnlyNotes: [],
      notPublicYet: [],
      missingInfo: [],
      sourceAuthority: [],
      recommendedAction:
        cleanText(recommendation.suggestedAction) ??
        "Owner review needed before public wording.",
      confidence: recommendation.confidence,
      readoutSource: "fallback",
    }
  );
}
