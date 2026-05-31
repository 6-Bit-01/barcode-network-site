import type {
  DossierRecommendation,
  DossierRecommendationIngestSource,
  DossierSourceFileNote,
} from "./dossier-workflow";

export type DossierHumanReadableSection = {
  title: string;
  items: string[];
};

export type DossierHumanReadableNoteView = {
  sourceLabel: string;
  sourceCopy: string;
  isLegacyBridge: boolean;
  isEnrichment: boolean;
  legacyRawFormatting: boolean;
  summary: string;
  sections: DossierHumanReadableSection[];
  rawMetadata: Array<{ label: string; value: string }>;
  rawText?: string;
  warningCount: number;
  missingInfoCount: number;
  reviewStatus?: string;
  workflowLane?: string;
};

type NoteLike = Pick<
  DossierSourceFileNote,
  | "type"
  | "text"
  | "source"
  | "publicSafe"
  | "createdAt"
  | "ingestKey"
  | "ingestedAt"
  | "ingestSource"
> & {
  status?: string;
  sourceLanes?: string[];
  sourceTypes?: string[];
  confidence?: string;
  missingInfo?: string[];
  publicSafetyNotes?: string[];
  doNotSay?: string[];
  suggestedAction?: string;
  evidenceSummary?: string;
  reason?: string;
};

const rawMetadataHeadingPattern =
  /^(ingest\s*key|ingestkey|source\s*lane|source\s*lanes|source\s*types|source\s*counts|evidence\s*mapping|source\s*qualities|visibility|confidence|confidence\s*debug|debug|internal\s*id|internal\s*ids|taxonomy\s*metadata)\s*:/i;

const evidenceHeadingPattern = /^(evidence|possible supporting evidence)\s*:/i;
const publicSafetyHeadingPattern = /^(public safety|safety note|safety notes|source warnings?)\s*:/i;
const missingInfoHeadingPattern = /^(missing info|missing information|needs owner review)\s*:/i;
const doNotSayHeadingPattern = /^(do not say|do-not-say)\s*:/i;
const actionHeadingPattern = /^(suggested next action|suggested action|next action)\s*:/i;
const summaryHeadingPattern = /^(summary|review context|why it matters|review reason|reason)\s*:/i;

function cleanLine(line: string) {
  return line.replace(/^[-*•]\s*/, "").trim();
}

function withoutHeading(line: string) {
  return cleanLine(line).replace(/^[^:]{1,80}:\s*/, "").trim();
}

function addItem(sections: Map<string, string[]>, title: string, value?: string) {
  const item = value?.trim();
  if (!item) return;
  const items = sections.get(title) ?? [];
  if (!items.includes(item)) items.push(item);
  sections.set(title, items);
}

function sourceLabel(ingestSource?: DossierRecommendationIngestSource) {
  if (ingestSource === "bnl_source_knowledge_bridge") {
    return {
      label: "Older BNL Review Note",
      copy:
        "Review-only context connected to this subject. Treat it as internal background, not public dossier copy.",
    };
  }
  if (ingestSource === "bnl_source_file_enrichment") {
    return {
      label: "BNL Review Addendum",
      copy:
        "Review-only enrichment for this subject. Public copy still requires owner/admin approval.",
    };
  }
  return {
    label: "Internal Case-File Note",
    copy:
      "Internal working material. Review before using in any proposed or public dossier copy.",
  };
}

function excerpt(text: string, maxLength = 220) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function hasSubstance(note: NoteLike, sections: Map<string, string[]>) {
  return Boolean(
    note.evidenceSummary ||
      note.reason ||
      sections.get("Confirmed / Strong")?.length ||
      sections.get("Claimed / Needs Review")?.length ||
      sections.get("Pattern BNL Noticed")?.length ||
      sections.get("Not Public Yet")?.length ||
      (note.publicSafetyNotes ?? []).length ||
      (note.missingInfo ?? []).length,
  );
}

function plainTakeaway(note: NoteLike, sections: Map<string, string[]>, fallback: string) {
  if (note.ingestSource === "bnl_source_knowledge_bridge") {
    return hasSubstance(note, sections)
      ? "BNL found older review-only context connected to this subject. Review the evidence before using it publicly."
      : "BNL found review-only context connected to this subject, but the note does not yet contain enough public-safe detail to draft from.";
  }
  if (note.ingestSource === "bnl_source_file_enrichment") {
    return hasSubstance(note, sections)
      ? "BNL found review-only enrichment for this subject. Check what is useful, claimed, or not public before drafting from it."
      : "BNL added a review-only enrichment note, but it mostly confirms the file needs more useful context before drafting.";
  }
  if (hasSubstance(note, sections)) {
    return "This internal note may add useful context. Review what is confirmed, claimed, or not public before drafting from it.";
  }
  return fallback || "This internal note is review-only and does not yet add enough public-safe detail to draft from.";
}

export function createHumanReadableSourceFileNoteView(
  note: NoteLike,
): DossierHumanReadableNoteView {
  const source = sourceLabel(note.ingestSource);
  const sections = new Map<string, string[]>();
  const rawMetadata: Array<{ label: string; value: string }> = [];
  const text = note.text ?? "";
  const rawLines = text
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean);
  let legacyRawFormatting = false;
  let summary = "";

  for (const line of rawLines) {
    if (rawMetadataHeadingPattern.test(line)) {
      legacyRawFormatting = true;
      const [label, ...rest] = line.split(":");
      rawMetadata.push({ label: label.trim(), value: rest.join(":").trim() });
      continue;
    }
    if (/source lanes\/types summary|source lanes:|ingest key:|confidence:|taxonomy metadata:/i.test(line)) {
      legacyRawFormatting = true;
      const [label, ...rest] = line.split(":");
      rawMetadata.push({ label: label.trim(), value: rest.join(":").trim() });
      continue;
    }
    if (evidenceHeadingPattern.test(line)) {
      addItem(sections, "Claimed / Needs Review", withoutHeading(line));
    } else if (publicSafetyHeadingPattern.test(line)) {
      addItem(sections, "Not Public Yet", withoutHeading(line));
    } else if (missingInfoHeadingPattern.test(line)) {
      addItem(sections, "Open Questions", withoutHeading(line));
    } else if (doNotSayHeadingPattern.test(line)) {
      addItem(sections, "Not Public Yet", withoutHeading(line));
    } else if (actionHeadingPattern.test(line)) {
      addItem(sections, "Recommended Next Step", withoutHeading(line));
    } else if (summaryHeadingPattern.test(line)) {
      addItem(sections, "Pattern BNL Noticed", withoutHeading(line));
    } else if (/public use requires review|internal\/private review|required|review-only|not public copy|owner\/admin review/i.test(line)) {
      addItem(sections, "Not Public Yet", line);
    } else if (!summary) {
      summary = line;
    } else {
      addItem(sections, "Claimed / Needs Review", line);
    }
  }

  if (!summary) summary = excerpt(text) || "Review-only internal source-file note.";

  addItem(sections, "Pattern BNL Noticed", note.reason || summary);
  addItem(sections, "Claimed / Needs Review", note.evidenceSummary);
  for (const item of note.publicSafetyNotes ?? []) addItem(sections, "Not Public Yet", item);
  for (const item of note.missingInfo ?? []) addItem(sections, "Open Questions", item);
  for (const item of note.doNotSay ?? []) addItem(sections, "Not Public Yet", item);
  addItem(sections, "Recommended Next Step", note.suggestedAction);

  rawMetadata.push({ label: "noteSource", value: note.source ?? "—" });
  rawMetadata.push({ label: "noteStatus", value: note.status ?? "—" });
  rawMetadata.push({ label: "publicSafe", value: String(note.publicSafe) });
  if (note.ingestKey) rawMetadata.push({ label: "ingestKey", value: note.ingestKey });
  if (note.ingestedAt) rawMetadata.push({ label: "ingestedAt", value: note.ingestedAt });
  if (note.ingestSource) rawMetadata.push({ label: "ingestSource", value: note.ingestSource });
  if (note.sourceLanes?.length) rawMetadata.push({ label: "sourceLanes", value: note.sourceLanes.join(", ") });
  if (note.sourceTypes?.length) rawMetadata.push({ label: "sourceTypes", value: note.sourceTypes.join(", ") });
  if (note.confidence) rawMetadata.push({ label: "confidence", value: note.confidence });

  const warningCount = (note.publicSafetyNotes ?? []).length +
    Array.from(sections.entries())
      .filter(([title]) => title === "Not Public Yet")
      .reduce((count, [, items]) => count + items.length, 0);
  const missingInfoCount =
    (note.missingInfo ?? []).length + (sections.get("Open Questions")?.length ?? 0);

  return {
    sourceLabel: source.label,
    sourceCopy: source.copy,
    isLegacyBridge: note.ingestSource === "bnl_source_knowledge_bridge",
    isEnrichment: note.ingestSource === "bnl_source_file_enrichment",
    legacyRawFormatting,
    summary: plainTakeaway(note, sections, excerpt(summary)),
    sections: Array.from(sections.entries()).map(([title, items]) => ({ title, items })),
    rawMetadata,
    rawText: text,
    warningCount,
    missingInfoCount,
    reviewStatus: note.status,
  };
}

export function createHumanReadableRecommendationView(
  recommendation: DossierRecommendation,
): DossierHumanReadableNoteView {
  return createHumanReadableSourceFileNoteView({
    type: "general_note",
    text: [recommendation.reason, recommendation.evidenceSummary]
      .filter(Boolean)
      .join("\n\n"),
    source: "bnl_recommendation",
    status: recommendation.status,
    publicSafe: false,
    createdAt: recommendation.createdAt,
    ingestKey: recommendation.ingestKey,
    ingestedAt: recommendation.ingestedAt,
    ingestSource: recommendation.ingestSource,
    sourceLanes: recommendation.sourceLanes,
    sourceTypes: recommendation.sourceTypes,
    confidence: recommendation.confidence,
    missingInfo: recommendation.missingInfo,
    publicSafetyNotes: recommendation.publicSafetyNotes,
    doNotSay: recommendation.doNotSay,
    suggestedAction: recommendation.suggestedAction,
    evidenceSummary: recommendation.evidenceSummary,
    reason: recommendation.reason,
  });
}
