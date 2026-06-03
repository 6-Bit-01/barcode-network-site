import type {
  DossierRecommendation,
  DossierRecommendationIngestSource,
  DossierSourceFileNote,
} from "./dossier-workflow";
import {
  isRawSourceMemoryDebugText,
  sourceMemoryMeaningItems,
} from "./dossier-source-memory-meaning";

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
  knownContext?: string[];
  usefulEvidence?: string[];
  relationshipSignals?: string[];
  publicSafePossibilities?: string[];
  privateOnlyNotes?: string[];
  notPublicYet?: string[];
  observedChannels?: string[];
  conversationHighlights?: string[];
  topicBreakdown?: string[];
  bestEvidenceToReview?: string[];
  bnlInteractionSignals?: string[];
  musicSignals?: string[];
  communitySignals?: string[];
  sourceCoverage?: string[];
  evidenceDetails?: string[];
  representativeEvidence?: string[];
  activityFrequencySummary?: string[];
  topChannels?: string[];
  topTopicDetails?: string[];
  recentActivitySummary?: string[];
  authoredVsMentionedSummary?: string[];
  publicUseCandidates?: string[];
  reviewOnlyEvidence?: string[];
  queueSubmissionStatus?: string;
  queueSubmissionNote?: string;
  recommendedAction?: string;
  sourceAuthority?: string[];
  rawProvenance?: unknown;
  evidenceSummary?: string;
  reason?: string;
  subjectName?: string;
};

const thinFileWarning =
  "This file is still thin. It confirms that BNL has some internal references to this subject, but it does not yet contain enough history, repeated patterns, public-safe facts, or specific context to draft from.";

const noPatternCopy = "No meaningful pattern has been extracted yet.";

const rawMetadataHeadingPattern =
  /^(ingest\s*key|ingestkey|source\s*lane|source\s*lanes|source\s*types|source\s*counts|source\s*lane\s*mapping|evidence\s*mapping|source\s*qualities|visibility|confidence|confidence\s*debug|debug|internal\s*id|internal\s*ids|target\s*id|candidate\s*id|taxonomy\s*metadata|payload|metadata|workflow\s*record)\s*:/i;

const evidenceHeadingPattern =
  /^(evidence|possible supporting evidence|evidence summary)\s*:/i;
const publicSafetyHeadingPattern =
  /^(public safety|safety note|safety notes|source warnings?)\s*:/i;
const missingInfoHeadingPattern =
  /^(missing info|missing information|needs owner review|open questions?)\s*:/i;
const doNotSayHeadingPattern = /^(do not say|do-not-say)\s*:/i;
const actionHeadingPattern =
  /^(suggested next action|suggested action|next action)\s*:/i;
const summaryHeadingPattern =
  /^(summary|review context|why it matters|review reason|reason)\s*:/i;

const technicalTermPattern =
  /\b(source lane|source_lanes|sourceTypes|sourceCounts|ingest|ingestKey|bridge source lane mapping|workflow record|payload|metadata|local_profile_observed|public_discord_observed|local_relationship_trace|relationship_journal|user_profiles|conversations|rd_context|broadcast_memory|help_signal|EDGE_SESSI(?:ON)?|BNL local knowledge stores?|public_safe_candidate|private_review_required|owner_review_required|public_use_not_allowed_until_review|internal_only|target id|targetId|candidate id|candidateId|recommendation id|recommendationId|source type mapping|source type mappings|source types|source_lanes|public_home|admin\/dossiers|api\/admin|api\/bnl)\b|unknown\s*->\s*unknown/i;

const rawIdPattern =
  /\b(?:candidate|target|dossier|source_file|recommendation|rec|bnl)_[a-z0-9][a-z0-9_-]{8,}\b/i;
const routeLikePattern =
  /\b(?:user_profiles|conversations|relationship_journal|rd_context|broadcast_memory|api|admin|database)\s*\/\s*[a-z0-9_/-]+\b/i;
const underscoreBackendPattern = /\b[a-z]+(?:_[a-z0-9]+){2,}\b/;

const technicalTranslations: Array<[RegExp, string]> = [
  [
    /local_profile_observed/i,
    "BNL has a local profile match for this subject.",
  ],
  [
    /public_discord_observed/i,
    "This subject appears in approved public Discord-side records.",
  ],
  [
    /local_relationship_trace/i,
    "BNL has prior relationship/context notes connected to this subject.",
  ],
  [/private_review_required/i, "This needs internal review before public use."],
  [
    /owner_review_required/i,
    "This needs owner/admin review before public use.",
  ],
  [
    /public_use_not_allowed_until_review/i,
    "Do not use publicly until owner/admin review.",
  ],
  [
    /public_safe_candidate/i,
    "Some source material may be usable only after human review confirms it is public-safe.",
  ],
];

function cleanLine(line: string) {
  return line.replace(/^[-*•]\s*/, "").trim();
}

function withoutHeading(line: string) {
  return cleanLine(line)
    .replace(/^[^:]{1,80}:\s*/, "")
    .trim();
}

function normalizeIdea(value: string) {
  return value
    .toLowerCase()
    .replace(/^[^:]{1,80}:\s*/, "")
    .replace(
      /\b(?:source|evidence|summary|review|route|mapping|label|status|lane|type)s?\b/g,
      "",
    )
    .replace(technicalTermPattern, "")
    .replace(rawIdPattern, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(?:bnl|internal|public|review|subject|file|note|this|has|the|a|an|to|from|for|and|or)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueItems(items: string[], limit = 6) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const compact = item.replace(/\s+/g, " ").trim();
    if (!compact) continue;
    const key = normalizeIdea(compact) || compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(compact);
    if (output.length >= limit) break;
  }
  return output;
}

function translatedTechnicalSignals(
  value: string,
  options: { subjectName?: string } = {},
) {
  const sourceMemoryMeanings = sourceMemoryMeaningItems(value, {
    subjectName: options.subjectName,
    includePublicDiscord: true,
  });
  if (sourceMemoryMeanings.length) return uniqueItems(sourceMemoryMeanings);
  return uniqueItems(
    technicalTranslations
      .filter(([pattern]) => pattern.test(value))
      .map(([, copy]) => copy),
  );
}

export function containsDossierBackendJunk(value?: string | null) {
  if (!value) return false;
  return (
    isRawSourceMemoryDebugText(value) ||
    technicalTermPattern.test(value) ||
    routeLikePattern.test(value) ||
    rawIdPattern.test(value) ||
    /\b(?:source knowledge bridge origin|bnl source knowledge bridge origin)\b/i.test(
      value,
    )
  );
}

function isMostlyTechnical(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return true;
  if (rawMetadataHeadingPattern.test(clean)) return true;
  if (routeLikePattern.test(clean)) return true;
  if (
    /^(?:source knowledge bridge origin|bnl source knowledge bridge origin|source lane mapping)\b/i.test(
      clean,
    )
  ) {
    return true;
  }
  const words = clean.split(/\s+/).filter(Boolean).length;
  const backendMatches =
    clean.match(new RegExp(technicalTermPattern.source, "gi"))?.length ?? 0;
  return (
    backendMatches > 0 && (words <= 12 || underscoreBackendPattern.test(clean))
  );
}

function sentenceHasHumanMeaning(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length < 24) return false;
  if (isMostlyTechnical(clean)) return false;
  return /[a-z][a-z]+\s+[a-z][a-z]+/i.test(clean);
}

function stripBackendFragments(value: string) {
  return value
    .replace(
      /\b(?:user_profiles|conversations|relationship_journal|rd_context|broadcast_memory)\s*\/\s*[a-z0-9_/-]+\b/gi,
      "",
    )
    .replace(technicalTermPattern, "")
    .replace(rawIdPattern, "")
    .replace(
      /\b(?:Source Knowledge Bridge origin|BNL Source Knowledge Bridge origin|source lane mapping)\b/gi,
      "",
    )
    .replace(/\s*[-–—]*\s*unknown\s*->\s*unknown\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

export function humanizeDossierMeaningLine(
  value?: string | null,
  options: { subjectName?: string } = {},
): string[] {
  const clean = cleanLine(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];

  const translations = translatedTechnicalSignals(clean, options);
  if (containsDossierBackendJunk(clean) || isRawSourceMemoryDebugText(clean)) {
    return translations.length
      ? translations
      : [
          "Internal BNL memory references exist, but they need owner review before public use.",
        ];
  }
  const stripped = stripBackendFragments(clean);
  const includeStripped =
    sentenceHasHumanMeaning(stripped) &&
    !containsDossierBackendJunk(stripped) &&
    !isMostlyTechnical(stripped);

  return uniqueItems([...(includeStripped ? [stripped] : []), ...translations]);
}

export function sanitizeDossierMeaningItems(
  items: Array<string | undefined | null>,
  limit = 4,
): string[] {
  return uniqueItems(
    items.flatMap((item) => humanizeDossierMeaningLine(item)),
    limit,
  );
}

export function hasDossierMeaningfulPattern(value?: string | null) {
  const clean = stripBackendFragments(value ?? "");
  if (!sentenceHasHumanMeaning(clean)) return false;
  return /\b(repeated|recurring|multiple|again|frequent|often|consistent|ongoing|pattern|appears?\s+across|community\s+presence|channel\s+activity|role|relationship|context notes|barcode radio|broadcast|collaboration|appearance|connected\s+to)\b/i.test(
    clean,
  );
}

function addItem(
  sections: Map<string, string[]>,
  title: string,
  value?: string,
  options?: { translateOnly?: boolean; subjectName?: string },
) {
  const candidates = options?.translateOnly
    ? translatedTechnicalSignals(value ?? "", {
        subjectName: options.subjectName,
      })
    : humanizeDossierMeaningLine(value, { subjectName: options?.subjectName });
  if (!candidates.length) return;
  const items = uniqueItems([...(sections.get(title) ?? []), ...candidates]);
  sections.set(title, items);
}

function addPattern(
  sections: Map<string, string[]>,
  value?: string,
  options: { subjectName?: string } = {},
) {
  if (!hasDossierMeaningfulPattern(value)) return;
  addItem(sections, "Pattern BNL Noticed", value, options);
}

function addShortWarning(
  sections: Map<string, string[]>,
  value?: string,
  options: { subjectName?: string } = {},
) {
  if (containsDossierBackendJunk(value) || isRawSourceMemoryDebugText(value)) {
    addItem(
      sections,
      "Not Public Yet",
      "Do not use publicly until owner/admin review.",
      options,
    );
    return;
  }
  const translations = translatedTechnicalSignals(value ?? "", options);
  if (translations.length) {
    addItem(sections, "Not Public Yet", translations[0], options);
    return;
  }
  if (
    /public use requires review|review-only|not public copy|owner\/admin review|before public use|keep internal|do not present|do not say/i.test(
      value ?? "",
    )
  ) {
    addItem(
      sections,
      "Not Public Yet",
      "Do not use publicly until owner/admin review.",
      options,
    );
  }
}

function addClaimedNeedsReview(
  sections: Map<string, string[]>,
  value?: string,
  options: { subjectName?: string } = {},
) {
  if (containsDossierBackendJunk(value) || isRawSourceMemoryDebugText(value)) {
    addItem(
      sections,
      "Claimed / Needs Review",
      "Internal BNL memory references exist, but they need owner review before public use.",
      options,
    );
    return;
  }
  addItem(sections, "Claimed / Needs Review", value, options);
}

function sourceLabel(ingestSource?: DossierRecommendationIngestSource) {
  if (ingestSource === "bnl_source_knowledge_bridge") {
    return {
      label: "Older BNL Review Note",
      copy: "Review-only context connected to this subject. Treat it as internal background, not public dossier copy.",
    };
  }
  if (ingestSource === "bnl_source_file_enrichment") {
    return {
      label: "BNL Review Addendum",
      copy: "Review-only enrichment for this subject, not candidate discovery. Public copy still requires owner/admin approval.",
    };
  }
  return {
    label: "Internal Case-File Note",
    copy: "Internal working material. Review before using in any proposed or public dossier copy.",
  };
}

function excerpt(text: string, maxLength = 220) {
  const compact = stripBackendFragments(text).replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}…`;
}

function hasSubstance(note: NoteLike, sections: Map<string, string[]>) {
  return Boolean(
    sanitizeDossierMeaningItems([note.evidenceSummary, note.reason], 2)
      .length ||
    sections.get("Confirmed / Strong")?.length ||
    sections.get("Useful Evidence")?.length ||
    sections.get("Claimed / Needs Review")?.length ||
    (sections.get("Pattern BNL Noticed") ?? []).some(
      (item) => item !== noPatternCopy,
    ),
  );
}

function technicalSignalTakeaway(note: NoteLike, text: string) {
  if (/local_profile_observed/i.test(text)) {
    return "BNL found a local profile match. No specific public-safe history has been extracted from this note yet.";
  }
  if (/local_relationship_trace|relationship_journal/i.test(text)) {
    return "BNL found review-only context connected to this subject through older internal references, but it is not ready for public dossier copy.";
  }
  if (/public_discord_observed/i.test(text)) {
    return "BNL found approved public Discord-side records connected to this subject. Review is still required before using any detail publicly.";
  }
  if (note.ingestSource === "bnl_source_knowledge_bridge") {
    return "BNL found review-only context connected to this subject through older internal references, but it is not ready for public dossier copy.";
  }
  return "BNL found an internal reference for this subject. No specific public-safe history has been extracted from this note yet.";
}

function plainTakeaway(
  note: NoteLike,
  sections: Map<string, string[]>,
  fallback: string,
  text: string,
) {
  if (!hasSubstance(note, sections) && containsDossierBackendJunk(text)) {
    return technicalSignalTakeaway(note, text);
  }
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
  return (
    fallback ||
    "This internal note is review-only and does not yet add enough public-safe detail to draft from."
  );
}

export function createHumanReadableSourceFileNoteView(
  note: NoteLike,
): DossierHumanReadableNoteView {
  const source = sourceLabel(note.ingestSource);
  const sections = new Map<string, string[]>();
  const rawMetadata: Array<{ label: string; value: string }> = [];
  const text = note.text ?? "";
  const rawLines = text.split(/\n+/).map(cleanLine).filter(Boolean);
  const subjectOptions = { subjectName: note.subjectName };
  let legacyRawFormatting = false;
  let summary = "";

  for (const line of rawLines) {
    if (rawMetadataHeadingPattern.test(line)) {
      legacyRawFormatting = true;
      const [label, ...rest] = line.split(":");
      rawMetadata.push({ label: label.trim(), value: rest.join(":").trim() });
      addItem(sections, "Useful Evidence", rest.join(":"), {
        ...subjectOptions,
        translateOnly: true,
      });
      addShortWarning(sections, rest.join(":"), subjectOptions);
      continue;
    }
    if (
      /source lanes\/types summary|source lanes:|ingest key:|confidence:|taxonomy metadata:/i.test(
        line,
      )
    ) {
      legacyRawFormatting = true;
      const [label, ...rest] = line.split(":");
      rawMetadata.push({ label: label.trim(), value: rest.join(":").trim() });
      addItem(sections, "Useful Evidence", rest.join(":"), {
        ...subjectOptions,
        translateOnly: true,
      });
      addShortWarning(sections, rest.join(":"), subjectOptions);
      continue;
    }
    if (evidenceHeadingPattern.test(line)) {
      addItem(sections, "Useful Evidence", withoutHeading(line), subjectOptions);
    } else if (publicSafetyHeadingPattern.test(line)) {
      addShortWarning(sections, withoutHeading(line), subjectOptions);
    } else if (missingInfoHeadingPattern.test(line)) {
      addItem(sections, "Open Questions", withoutHeading(line), subjectOptions);
    } else if (doNotSayHeadingPattern.test(line)) {
      addShortWarning(sections, withoutHeading(line), subjectOptions);
    } else if (actionHeadingPattern.test(line)) {
      addItem(sections, "Recommended Next Step", withoutHeading(line), subjectOptions);
    } else if (summaryHeadingPattern.test(line)) {
      const body = withoutHeading(line);
      if (hasDossierMeaningfulPattern(body)) addPattern(sections, body, subjectOptions);
      else addClaimedNeedsReview(sections, body, subjectOptions);
    } else if (
      /public use requires review|internal\/private review|required|review-only|not public copy|owner\/admin review/i.test(
        line,
      )
    ) {
      addShortWarning(sections, line, subjectOptions);
    } else if (
      !summary &&
      sentenceHasHumanMeaning(line) &&
      !containsDossierBackendJunk(line)
    ) {
      summary = line;
    } else if (hasDossierMeaningfulPattern(line)) {
      addPattern(sections, line, subjectOptions);
    } else {
      addClaimedNeedsReview(sections, line, subjectOptions);
      addItem(sections, "Useful Evidence", line, {
        ...subjectOptions,
        translateOnly: true,
      });
      addShortWarning(sections, line, subjectOptions);
    }
  }

  if (!summary)
    summary = excerpt(text) || "Review-only internal source-file note.";

  for (const item of note.knownContext ?? [])
    addItem(sections, "Known Context / Current Read", item, subjectOptions);
  for (const item of note.usefulEvidence ?? [])
    addItem(sections, "Useful Evidence", item, subjectOptions);
  for (const item of note.relationshipSignals ?? [])
    addItem(sections, "Private Relationship Context — Review Only", item, subjectOptions);
  for (const item of note.publicSafePossibilities ?? [])
    addItem(
      sections,
      "Public-Safe Possibilities Pending Owner Review",
      item,
      subjectOptions,
    );
  for (const item of note.privateOnlyNotes ?? [])
    addItem(sections, "Review-Only Cautions", item, subjectOptions);
  for (const item of note.notPublicYet ?? [])
    addShortWarning(sections, item, subjectOptions);
  for (const item of note.bestEvidenceToReview ?? [])
    addItem(sections, "What BNL Found", item, subjectOptions);
  for (const item of note.observedChannels ?? [])
    addItem(sections, "Observed Channels / Activity", item, subjectOptions);
  for (const item of note.conversationHighlights ?? [])
    addItem(sections, "Public Activity Notes", item, subjectOptions);
  for (const item of note.musicSignals ?? [])
    addItem(sections, "Music / Show Signals", item, subjectOptions);
  for (const item of note.communitySignals ?? [])
    addItem(sections, "Community Signals", item, subjectOptions);
  for (const item of note.bnlInteractionSignals ?? [])
    addItem(sections, "BNL Interaction Signals", item, subjectOptions);
  for (const item of note.topicBreakdown ?? [])
    addItem(sections, "Main Discussion Areas", item, subjectOptions);
  for (const item of note.evidenceDetails ?? [])
    addItem(sections, "Evidence Log", item, subjectOptions);
  for (const item of note.representativeEvidence ?? [])
    addItem(sections, "Representative Activity Details", item, subjectOptions);
  for (const item of note.activityFrequencySummary ?? [])
    addItem(sections, "Activity Frequency", item, subjectOptions);
  for (const item of note.topChannels ?? [])
    addItem(sections, "Top Channels", item, subjectOptions);
  for (const item of note.topTopicDetails ?? [])
    addItem(sections, "Main Discussion Areas", item, subjectOptions);
  for (const item of note.recentActivitySummary ?? [])
    addItem(sections, "Recent Activity", item, subjectOptions);
  for (const item of note.authoredVsMentionedSummary ?? [])
    addItem(sections, "Posted / Mentioned Balance", item, subjectOptions);
  for (const item of note.publicUseCandidates ?? [])
    addItem(
      sections,
      "Public-Use Candidates Pending Owner Review",
      item,
      subjectOptions,
    );
  for (const item of note.reviewOnlyEvidence ?? [])
    addItem(sections, "Review-Only Cautions", item, subjectOptions);
  for (const item of note.sourceCoverage ?? [])
    addItem(sections, "Source Coverage", item, subjectOptions);
  if (note.queueSubmissionStatus === "not_connected") {
    addItem(
      sections,
      "Queue / Submission Status",
      "Queue/submission identity is not connected yet.",
      subjectOptions,
    );
  } else if (note.queueSubmissionStatus) {
    addItem(
      sections,
      "Queue / Submission Status",
      `Queue/submission status: ${note.queueSubmissionStatus.replace(/_/g, " ")}.`,
      subjectOptions,
    );
  }
  addItem(sections, "Queue / Submission Status", note.queueSubmissionNote, subjectOptions);
  addItem(sections, "Recommended Next Step", note.recommendedAction, subjectOptions);
  for (const item of note.sourceAuthority ?? [])
    addItem(sections, "Evidence Status", item, subjectOptions);
  addPattern(sections, note.reason, subjectOptions);
  if ((note.usefulEvidence ?? []).length === 0) {
    addItem(sections, "Useful Evidence", note.evidenceSummary, subjectOptions);
  }
  for (const item of note.publicSafetyNotes ?? [])
    addShortWarning(sections, item, subjectOptions);
  for (const item of note.missingInfo ?? [])
    addItem(sections, "Open Questions", item, subjectOptions);
  for (const item of note.doNotSay ?? [])
    addShortWarning(sections, item, subjectOptions);
  addItem(sections, "Recommended Next Step", note.suggestedAction, subjectOptions);

  if (!sections.get("Pattern BNL Noticed")?.length) {
    sections.set("Pattern BNL Noticed", [noPatternCopy]);
  }
  if (!hasSubstance(note, sections)) {
    sections.set("Case File Quality", [thinFileWarning]);
  }

  rawMetadata.push({ label: "noteSource", value: note.source ?? "—" });
  rawMetadata.push({ label: "noteStatus", value: note.status ?? "—" });
  rawMetadata.push({ label: "publicSafe", value: String(note.publicSafe) });
  if (note.ingestKey)
    rawMetadata.push({ label: "ingestKey", value: note.ingestKey });
  if (note.ingestedAt)
    rawMetadata.push({ label: "ingestedAt", value: note.ingestedAt });
  if (note.ingestSource)
    rawMetadata.push({ label: "ingestSource", value: note.ingestSource });
  if (note.sourceLanes?.length)
    rawMetadata.push({
      label: "sourceLanes",
      value: note.sourceLanes.join(", "),
    });
  if (note.sourceTypes?.length)
    rawMetadata.push({
      label: "sourceTypes",
      value: note.sourceTypes.join(", "),
    });
  if (note.confidence)
    rawMetadata.push({ label: "confidence", value: note.confidence });
  if (note.rawProvenance !== undefined)
    rawMetadata.push({
      label: "rawProvenance",
      value: JSON.stringify(note.rawProvenance, null, 2),
    });

  if (note.reason && containsDossierBackendJunk(note.reason)) {
    rawMetadata.push({ label: "legacyReason", value: note.reason });
  }
  if (
    note.evidenceSummary &&
    containsDossierBackendJunk(note.evidenceSummary)
  ) {
    rawMetadata.push({
      label: "legacyEvidenceSummary",
      value: note.evidenceSummary,
    });
  }

  const sectionEntries = Array.from(sections.entries())
    .map(([title, items]) => ({ title, items: uniqueItems(items) }))
    .filter((section) => section.items.length > 0);

  const warningCount = sectionEntries
    .filter((section) => section.title === "Not Public Yet")
    .reduce((count, section) => count + section.items.length, 0);
  const missingInfoCount = sectionEntries
    .filter((section) => section.title === "Open Questions")
    .reduce((count, section) => count + section.items.length, 0);

  return {
    sourceLabel: source.label,
    sourceCopy: source.copy,
    isLegacyBridge: note.ingestSource === "bnl_source_knowledge_bridge",
    isEnrichment: note.ingestSource === "bnl_source_file_enrichment",
    legacyRawFormatting,
    summary: plainTakeaway(note, sections, excerpt(summary), text),
    sections: sectionEntries,
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
    text: [
      recommendation.reason,
      (recommendation.knownContext ?? [])
        .map((item) => `Known context: ${item}`)
        .join("\n"),
      (recommendation.usefulEvidence ?? [])
        .map((item) => `Useful evidence: ${item}`)
        .join("\n"),
      (recommendation.relationshipSignals ?? [])
        .map((item) => `Relationship signal — private review: ${item}`)
        .join("\n"),
      (recommendation.publicSafePossibilities ?? [])
        .map((item) => `Public-safe possibility pending owner review: ${item}`)
        .join("\n"),
      (recommendation.privateOnlyNotes ?? [])
        .map((item) => `Private/internal note: ${item}`)
        .join("\n"),
      (recommendation.notPublicYet ?? [])
        .map((item) => `Not public yet: ${item}`)
        .join("\n"),
      (recommendation.bestEvidenceToReview ?? [])
        .map((item) => `Best evidence to review: ${item}`)
        .join("\n"),
      (recommendation.observedChannels ?? [])
        .map((item) => `Observed channel/activity: ${item}`)
        .join("\n"),
      (recommendation.conversationHighlights ?? [])
        .map((item) => `Conversation highlight: ${item}`)
        .join("\n"),
      (recommendation.musicSignals ?? [])
        .map((item) => `Music/show signal: ${item}`)
        .join("\n"),
      (recommendation.communitySignals ?? [])
        .map((item) => `Community signal: ${item}`)
        .join("\n"),
      (recommendation.bnlInteractionSignals ?? [])
        .map((item) => `BNL interaction signal: ${item}`)
        .join("\n"),
      (recommendation.representativeEvidence ?? [])
        .map((item) => `Representative evidence: ${item}`)
        .join("\n"),
      (recommendation.activityFrequencySummary ?? [])
        .map((item) => `Activity frequency: ${item}`)
        .join("\n"),
      (recommendation.topChannels ?? [])
        .map((item) => `Top channel: ${item}`)
        .join("\n"),
      (recommendation.topTopicDetails ?? [])
        .map((item) => `Main topic detail: ${item}`)
        .join("\n"),
      (recommendation.recentActivitySummary ?? [])
        .map((item) => `Recent activity: ${item}`)
        .join("\n"),
      (recommendation.authoredVsMentionedSummary ?? [])
        .map((item) => `Posted/mentioned balance: ${item}`)
        .join("\n"),
      (recommendation.publicUseCandidates ?? [])
        .map((item) => `Public-use candidate pending owner review: ${item}`)
        .join("\n"),
      (recommendation.reviewOnlyEvidence ?? [])
        .map((item) => `Review-only evidence: ${item}`)
        .join("\n"),
      recommendation.queueSubmissionStatus === "not_connected"
        ? "Queue/submission status: Queue/submission identity is not connected yet."
        : recommendation.queueSubmissionStatus
          ? `Queue/submission status: ${recommendation.queueSubmissionStatus}`
          : "",
      recommendation.queueSubmissionNote
        ? `Queue/submission note: ${recommendation.queueSubmissionNote}`
        : "",
      recommendation.recommendedAction
        ? `Recommended next action: ${recommendation.recommendedAction}`
        : "",
      recommendation.evidenceSummary,
    ]
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
    knownContext: recommendation.knownContext,
    usefulEvidence: recommendation.usefulEvidence,
    relationshipSignals: recommendation.relationshipSignals,
    publicSafePossibilities: recommendation.publicSafePossibilities,
    privateOnlyNotes: recommendation.privateOnlyNotes,
    notPublicYet: recommendation.notPublicYet,
    observedChannels: recommendation.observedChannels,
    conversationHighlights: recommendation.conversationHighlights,
    topicBreakdown: recommendation.topicBreakdown,
    bestEvidenceToReview: recommendation.bestEvidenceToReview,
    bnlInteractionSignals: recommendation.bnlInteractionSignals,
    musicSignals: recommendation.musicSignals,
    communitySignals: recommendation.communitySignals,
    sourceCoverage: recommendation.sourceCoverage,
    evidenceDetails: recommendation.evidenceDetails,
    representativeEvidence: recommendation.representativeEvidence,
    activityFrequencySummary: recommendation.activityFrequencySummary,
    topChannels: recommendation.topChannels,
    topTopicDetails: recommendation.topTopicDetails,
    recentActivitySummary: recommendation.recentActivitySummary,
    authoredVsMentionedSummary: recommendation.authoredVsMentionedSummary,
    publicUseCandidates: recommendation.publicUseCandidates,
    reviewOnlyEvidence: recommendation.reviewOnlyEvidence,
    queueSubmissionStatus: recommendation.queueSubmissionStatus,
    queueSubmissionNote: recommendation.queueSubmissionNote,
    recommendedAction: recommendation.recommendedAction,
    sourceAuthority: recommendation.sourceAuthority,
    rawProvenance: recommendation.rawProvenance,
    evidenceSummary: recommendation.evidenceSummary,
    reason: recommendation.reason,
    subjectName: recommendation.subjectName,
  });
}
