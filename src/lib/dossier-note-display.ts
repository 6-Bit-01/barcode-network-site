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
      label: "Legacy BNL Source Knowledge Bridge Note",
      copy:
        "This is review-only source material imported from the older bridge path. Treat it as internal context, not public dossier copy.",
    };
  }
  if (ingestSource === "bnl_source_file_enrichment") {
    return {
      label: "BNL Source File Enrichment",
      copy:
        "Review-only enrichment generated for this workflow record. Public copy still requires owner/admin approval.",
    };
  }
  return {
    label: "BNL Source File Note",
    copy:
      "Internal working case-file material. Review before using in any proposed or public dossier copy.",
  };
}

function excerpt(text: string, maxLength = 220) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}…`;
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
      addItem(sections, "Possible Supporting Evidence", withoutHeading(line));
    } else if (publicSafetyHeadingPattern.test(line)) {
      addItem(sections, "Public Safety", withoutHeading(line));
    } else if (missingInfoHeadingPattern.test(line)) {
      addItem(sections, "Missing Info", withoutHeading(line));
    } else if (doNotSayHeadingPattern.test(line)) {
      addItem(sections, "Do Not Say", withoutHeading(line));
    } else if (actionHeadingPattern.test(line)) {
      addItem(sections, "Suggested Next Action", withoutHeading(line));
    } else if (summaryHeadingPattern.test(line)) {
      addItem(sections, "Review Context", withoutHeading(line));
    } else if (/public use requires review|internal\/private review|required|review-only|not public copy|owner\/admin review/i.test(line)) {
      addItem(sections, "Needs Owner Review", line);
    } else if (!summary) {
      summary = line;
    } else {
      addItem(sections, "Source-Limited Notes", line);
    }
  }

  if (!summary) summary = excerpt(text) || "Review-only internal source-file note.";

  addItem(sections, "Summary", summary);
  addItem(sections, "Why It Matters / Review Reason", note.reason);
  addItem(sections, "Evidence", note.evidenceSummary);
  for (const item of note.publicSafetyNotes ?? []) addItem(sections, "Source Warnings", item);
  for (const item of note.missingInfo ?? []) addItem(sections, "Missing Info", item);
  for (const item of note.doNotSay ?? []) addItem(sections, "Do Not Say", item);
  addItem(sections, "Suggested Next Action", note.suggestedAction);
  addItem(sections, "Admin Metadata", `Source: ${note.source ?? "—"}`);
  addItem(sections, "Admin Metadata", `Status: ${note.status ?? "—"}`);
  addItem(sections, "Admin Metadata", `Public safe: ${String(note.publicSafe)}`);

  if (note.ingestKey) rawMetadata.push({ label: "ingestKey", value: note.ingestKey });
  if (note.ingestedAt) rawMetadata.push({ label: "ingestedAt", value: note.ingestedAt });
  if (note.ingestSource) rawMetadata.push({ label: "ingestSource", value: note.ingestSource });
  if (note.sourceLanes?.length) rawMetadata.push({ label: "sourceLanes", value: note.sourceLanes.join(", ") });
  if (note.sourceTypes?.length) rawMetadata.push({ label: "sourceTypes", value: note.sourceTypes.join(", ") });
  if (note.confidence) rawMetadata.push({ label: "confidence", value: note.confidence });

  const warningCount = (note.publicSafetyNotes ?? []).length +
    Array.from(sections.entries())
      .filter(([title]) => title === "Source Warnings" || title === "Public Safety")
      .reduce((count, [, items]) => count + items.length, 0);
  const missingInfoCount =
    (note.missingInfo ?? []).length + (sections.get("Missing Info")?.length ?? 0);

  return {
    sourceLabel: source.label,
    sourceCopy: source.copy,
    isLegacyBridge: note.ingestSource === "bnl_source_knowledge_bridge",
    isEnrichment: note.ingestSource === "bnl_source_file_enrichment",
    legacyRawFormatting,
    summary: excerpt(summary),
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
