import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  databasePage,
  type DossierEcosystemLane,
  type DossierIdentityAuthority,
  type PublicDossierKind,
} from "@/content";
import {
  type CreateDossierRecommendationInput,
  type DossierCategory,
  type DossierRecommendationSourceLane,
  type DossierRecommendationType,
} from "@/lib/dossier-workflow";
import {
  createDossierRecommendationIdempotent,
  DossierWorkflowInputError,
} from "@/lib/dossier-workflow-store";

export const dynamic = "force-dynamic";

const RECOMMENDATION_TYPES = [
  "new_subject",
  "modify_existing_dossier",
  "identity_link",
  "possible_connection_review",
  "population_recommendation",
] as const satisfies readonly DossierRecommendationType[];
const SOURCE_LANES = [
  "public_discord",
  "rd_context",
  "broadcast_memory",
  "queue_context",
  "website_dossier",
  "admin_manual",
  "mod_manual",
  "owner_manual",
  "unknown",
] as const satisfies readonly DossierRecommendationSourceLane[];
const CATEGORIES = [
  "Entity",
  "Personnel",
  "Sponsor",
  "Interface",
  "Production",
] as const satisfies readonly DossierCategory[];
const KINDS = [
  "program",
  "interface",
  "platform",
  "system",
  "entity",
  "artist",
  "sponsor_character",
  "story_arc",
  "technical_component",
  "archive_record",
  "core_entity",
  "network_operator",
  "network_staff",
  "moderator",
  "collaborator",
  "community_member",
  "radio_regular",
  "radio_entity",
] as const satisfies readonly PublicDossierKind[];
const ECOSYSTEM_LANES = [
  "core_team",
  "network_operator",
  "network_staff",
  "community_mod",
  "radio_support",
  "technical_operator",
  "collaborator",
  "community_member",
  "radio_regular",
  "sponsor",
  "radio_entity",
  "infrastructure",
  "production",
  "unknown",
] as const satisfies readonly DossierEcosystemLane[];
const IDENTITY_AUTHORITIES = [
  "barcode_controlled",
  "community_owned",
  "external_system",
  "sponsor_controlled",
  "mixed_or_unclear",
] as const satisfies readonly DossierIdentityAuthority[];
const CONFIDENCES = ["low", "medium", "high"] as const;
const QUEUE_SUBMISSION_STATUSES = [
  "not_connected",
  "connected",
  "confirmed_submission",
  "no_submission_found",
  "review_needed",
  "unknown",
] as const;

function text(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Expected text field");
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new Error("Text field is too long");
  return trimmed;
}

function stringList(value: unknown, maxItemLength = 500): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected a list of strings");
  if (value.length > 25) throw new Error("List field has too many items");
  const items = value.map((item) => text(item, maxItemLength)).filter(Boolean);
  return items.length ? (items as string[]) : [];
}

function packetStringList(
  value: unknown,
  maxItemLength = 1000,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const item = text(value, maxItemLength);
    return item ? [item] : [];
  }
  if (!Array.isArray(value)) {
    throw new Error("Expected text or a list of strings");
  }
  if (value.length > 25) throw new Error("Packet field has too many items");
  const items = value.map((item) => text(item, maxItemLength)).filter(Boolean);
  return items.length ? (items as string[]) : [];
}

function coverageText(value: unknown, maxLength: number): string | undefined {
  const clean = text(value, maxLength);
  if (!clean) return undefined;
  if (/[{}\[\]<>]/.test(clean) || /[\\/]/.test(clean)) {
    throw new Error("sourceCoverage contains unsupported raw metadata");
  }
  if (/\b(?:candidate|target|dossier|source_file|recommendation|rec|bnl)_[a-z0-9][a-z0-9_-]{8,}\b/i.test(clean)) {
    throw new Error("sourceCoverage contains a raw identifier");
  }
  return clean;
}

function coverageLabel(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function finiteCoverageNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid sourceCoverage ${field}`);
  }
  if (Math.abs(value) > 1_000_000_000) {
    throw new Error(`sourceCoverage ${field} is too large`);
  }
  return value;
}


const REVIEW_EVIDENCE_ALLOWED_KEYS = new Set([
  "summary",
  "label",
  "detail",
  "topic",
  "channel",
  "channels",
  "context",
  "status",
  "kind",
  "type",
  "activityType",
  "relationship",
  "visibility",
  "window",
  "recency",
  "frequency",
  "count",
  "counts",
  "postedCount",
  "mentionedCount",
  "publicCount",
  "recentCount",
  "firstSeen",
  "lastSeen",
]);

function reviewEvidenceText(value: unknown, field: string, maxLength = 1000): string | undefined {
  const clean = text(value, maxLength);
  if (!clean) return undefined;
  if (clean === "[object Object]" || /\[object Object\]/i.test(clean)) {
    throw new Error(`${field} contains object text`);
  }
  const classificationLike = /\b(?:BNL\/source-file|source-file\/dossier(?:-related)?|music\/track|help\/support)\b/i.test(clean);
  if (
    /[{}<>]/.test(clean) ||
    /(?:^|\s)(?:[A-Za-z]:)?[\\/][\w./-]+/.test(clean) ||
    (!classificationLike && /\b[\w.-]+(?:[\\/][\w.-]+){2,}\b/.test(clean))
  ) {
    throw new Error(`${field} contains unsupported raw metadata`);
  }
  if (/\b(?:candidate|target|dossier|source_file|recommendation|rec|bnl|user|message|channel)_[a-z0-9][a-z0-9_-]{8,}\b/i.test(clean)) {
    throw new Error(`${field} contains a raw identifier`);
  }
  return clean;
}

function reviewEvidenceNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} count must be a number`);
  }
  if (Math.abs(value) > 1_000_000) throw new Error(`${field} count is too large`);
  return value;
}


function evidenceLooksLikeClassification(value?: string) {
  return /\b(?:automated topic|topic label|classified|classification|evidence categor(?:y|ies)|topic breakdown|topic detail|source-file|dossier|BNL\/source-file|BNL source-file|BNL\/source file|source file\/dossier)\b/i.test(value ?? "");
}

function evidenceClassificationCopy(value?: string) {
  const clean = reviewEvidenceText(value, "classification", 240)
    ?.replace(/\bauthored\b/gi, "")
    .replace(/\bposted\b/gi, "")
    .replace(/\bCrow\s+(?:discussed|posted about|talked about|authored)\b/gi, "")
    .replace(/\bdiscussed\b/gi, "related to")
    .replace(/\bhandling\b/gi, "context")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:;,\s]+|[-:;,\s]+$/g, "");
  if (!clean) return undefined;
  if (/\bclassified\b/i.test(clean) || /\bautomated topic/i.test(clean)) return clean;
  return `Automated topic label: ${clean}. Needs human review before this becomes a subject claim.`;
}

function reviewEvidenceObjectItem(value: Record<string, unknown>, field: string, maxLength = 1000): string | undefined {
  const parts: string[] = [];
  for (const key of Object.keys(value)) {
    if (!REVIEW_EVIDENCE_ALLOWED_KEYS.has(key)) {
      throw new Error(`${field} contains unsupported metadata`);
    }
  }
  const rawSummary = reviewEvidenceText(value.summary ?? value.detail ?? value.label, field, 500);
  const topic = reviewEvidenceText(value.topic, field, 120);
  const classificationCopy = evidenceLooksLikeClassification(topic) || evidenceLooksLikeClassification(rawSummary)
    ? evidenceClassificationCopy(rawSummary) ?? evidenceClassificationCopy(topic)
    : undefined;
  if (classificationCopy) parts.push(classificationCopy);
  else if (rawSummary) parts.push(rawSummary);
  const channel = reviewEvidenceText(value.channel, field, 120);
  const context = reviewEvidenceText(value.context, field, 180);
  let activityType = reviewEvidenceText(value.activityType ?? value.type ?? value.kind, field, 80);
  if (/^authored$/i.test(activityType ?? "")) activityType = classificationCopy ? undefined : "posted";
  const status = reviewEvidenceText(value.status ?? value.visibility, field, 80);
  const relationship = reviewEvidenceText(value.relationship, field, 80);
  const window = reviewEvidenceText(value.window ?? value.recency ?? value.frequency, field, 160);
  const firstSeen = reviewEvidenceText(value.firstSeen, field, 80);
  const lastSeen = reviewEvidenceText(value.lastSeen, field, 80);
  const count = reviewEvidenceNumber(value.count, field);
  const postedCount = reviewEvidenceNumber(value.postedCount, field);
  const mentionedCount = reviewEvidenceNumber(value.mentionedCount, field);
  const publicCount = reviewEvidenceNumber(value.publicCount, field);
  const recentCount = reviewEvidenceNumber(value.recentCount, field);
  const channels = Array.isArray(value.channels)
    ? value.channels.slice(0, 6).map((item) => reviewEvidenceText(item, field, 80)).filter((item): item is string => Boolean(item))
    : value.channels === undefined
      ? []
      : (() => { throw new Error(`${field} channels must be a list`); })();
  const countParts: string[] = [];
  if (count !== undefined) countParts.push(`${count} item${count === 1 ? "" : "s"}`);
  if (postedCount !== undefined) countParts.push(`${postedCount} posted item${postedCount === 1 ? "" : "s"}`);
  if (mentionedCount !== undefined) countParts.push(`${mentionedCount} mention${mentionedCount === 1 ? "" : "s"}`);
  if (publicCount !== undefined) countParts.push(`${publicCount} approved public item${publicCount === 1 ? "" : "s"}`);
  if (recentCount !== undefined) countParts.push(`${recentCount} recent item${recentCount === 1 ? "" : "s"}`);
  if (value.counts !== undefined) {
    if (!value.counts || typeof value.counts !== "object" || Array.isArray(value.counts)) {
      throw new Error(`${field} counts must be an object`);
    }
    const entries = Object.entries(value.counts as Record<string, unknown>);
    if (entries.length > 12) throw new Error(`${field} counts has too many keys`);
    for (const [key, rawCount] of entries) {
      const cleanKey = reviewEvidenceText(key, field, 80);
      const cleanCount = reviewEvidenceNumber(rawCount, field);
      if (cleanKey && cleanCount !== undefined) {
        countParts.push(`${coverageLabel(cleanKey)} ${cleanCount}`);
      }
    }
  }
  const detailParts = [
    activityType && coverageLabel(activityType),
    topic && (classificationCopy ? `automated topic label ${coverageLabel(topic)}` : `about ${coverageLabel(topic)}`),
    channel && `in ${channel.startsWith("#") ? channel : `#${coverageLabel(channel)}`}`,
    channels.length ? `in ${channels.map((item) => item.startsWith("#") ? item : `#${coverageLabel(item)}`).join(", ")}` : undefined,
    context && coverageLabel(context),
    relationship && coverageLabel(relationship),
    countParts.length ? countParts.join(", ") : undefined,
    window && coverageLabel(window),
    firstSeen && `first seen ${firstSeen}`,
    lastSeen && `last seen ${lastSeen}`,
    status && coverageLabel(status),
  ].filter(Boolean);
  if (detailParts.length) parts.push(detailParts.join("; "));
  return reviewEvidenceText(parts.join(" — "), field, maxLength);
}

function reviewEvidenceItem(value: unknown, field: string): string | undefined {
  if (typeof value === "string") return reviewEvidenceText(value, field);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} item must be text or a supported object`);
  }
  return reviewEvidenceObjectItem(value as Record<string, unknown>, field);
}

function reviewEvidenceList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  const rawItems = Array.isArray(value) ? value : [value];
  if (rawItems.length > 25) throw new Error(`${field} has too many items`);
  const items = rawItems.map((item) => reviewEvidenceItem(item, field)).filter(Boolean);
  return items.length ? (items as string[]) : [];
}

function sourceCoverageItem(value: unknown): string | undefined {
  if (typeof value === "string") return coverageText(value, 1000);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected sourceCoverage item to be text or an object");
  }
  const item = value as Record<string, unknown>;
  const allowedKeys = new Set(["source", "count", "counts", "status"]);
  for (const key of Object.keys(item)) {
    if (!allowedKeys.has(key)) {
      throw new Error("sourceCoverage contains unsupported metadata");
    }
  }
  const source = coverageText(item.source, 120);
  const status = coverageText(item.status, 80);
  const count = finiteCoverageNumber(item.count, "count");
  const countParts: string[] = [];
  if (item.counts !== undefined) {
    if (!item.counts || typeof item.counts !== "object" || Array.isArray(item.counts)) {
      throw new Error("sourceCoverage counts must be an object");
    }
    const counts = item.counts as Record<string, unknown>;
    const entries = Object.entries(counts);
    if (entries.length > 20) throw new Error("sourceCoverage counts has too many keys");
    for (const [key, rawCount] of entries) {
      const cleanKey = coverageText(key, 80);
      const cleanCount = finiteCoverageNumber(rawCount, "counts value");
      if (cleanKey && cleanCount !== undefined) {
        countParts.push(`${coverageLabel(cleanKey)} ${cleanCount}`);
      }
    }
  }
  const label = source ? coverageLabel(source) : "Source coverage";
  const pieces = countParts.length
    ? [`${label}: ${countParts.join(", ")}`]
    : count !== undefined
      ? [`${label}: ${count} source row(s)`]
      : [label];
  if (status) pieces.push(coverageLabel(status));
  return pieces.join(" ").trim();
}

function sourceCoverageList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  const rawItems = Array.isArray(value) ? value : [value];
  if (rawItems.length > 25) throw new Error("sourceCoverage has too many items");
  const items = rawItems.map(sourceCoverageItem).filter(Boolean);
  return items.length ? (items as string[]) : [];
}

function rawJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  if (json === undefined) {
    throw new Error("rawProvenance must be JSON serializable");
  }
  if (json.length > 20000) throw new Error("rawProvenance is too large");
  return JSON.parse(json);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`Invalid ${field}`);
  }
  return value as T;
}

function bearerToken(req: Request): string {
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return req.headers.get("x-bnl-ingest-token")?.trim() ?? "";
}

function tokenMatches(providedToken: string): boolean {
  const expectedToken = process.env.BNL_DOSSIER_INGEST_TOKEN?.trim() ?? "";
  if (!expectedToken || !providedToken) return false;
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

function supportedIngestSource(value: unknown): CreateDossierRecommendationInput["ingestSource"] {
  const normalized = text(value, 80);
  if (
    normalized === "bnl_dynamic_candidate_discovery" ||
    normalized === "bnl_source_knowledge_bridge" ||
    normalized === "bnl_source_file_enrichment" ||
    normalized === "bnl_population_recommender"
  ) {
    return normalized;
  }
  return "bnl";
}

function normalizeBnlSourceLane(value: unknown): {
  lane: DossierRecommendationSourceLane;
  original?: string;
} {
  if (typeof value !== "string") {
    throw new Error("Invalid source lane: sourceLanes entries must be strings");
  }
  if (SOURCE_LANES.includes(value as DossierRecommendationSourceLane)) {
    return { lane: value as DossierRecommendationSourceLane };
  }
  const original = value.trim();
  const normalized = original.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const mapped: Record<string, DossierRecommendationSourceLane> = {
    source_blind_memory_trace: "broadcast_memory",
    memory_trace: "broadcast_memory",
    broadcast_trace: "broadcast_memory",
    local_broadcast_memory: "broadcast_memory",
    rd_knowledge_store: "rd_context",
    r_d_knowledge_store: "rd_context",
    local_rd_context: "rd_context",
    website_read_model: "website_dossier",
    existing_dossier: "website_dossier",
    source_file: "admin_manual",
    source_files: "admin_manual",
    source_knowledge_bridge: "admin_manual",
    bnl_source_knowledge_bridge: "admin_manual",
    bnl_source_file_enrichment: "admin_manual",
    source_file_enrichment: "admin_manual",
    active_source_file: "admin_manual",
    candidate_intake: "admin_manual",
    existing_dossier_update: "website_dossier",
    local_knowledge_store: "admin_manual",
    operator_notes: "admin_manual",
    conversations: "public_discord",
    public_home: "public_discord",
    public_context: "public_discord",
    sealed_test: "admin_manual",
    user_memory_facts: "admin_manual",
    relationship_journal: "admin_manual",
    relationship_state: "admin_manual",
    broadcast_memory: "broadcast_memory",
    memory_tiers: "admin_manual",
    community_presence: "public_discord",
    entity_evidence_events: "admin_manual",
    needs_population_review: "admin_manual",
    public_dossier_update_signal: "website_dossier",
    already_represented: "admin_manual",
    not_population_subject: "admin_manual",
    broadcast_memory_note: "broadcast_memory",
    show_state_note: "broadcast_memory",
  };
  return { lane: mapped[normalized] ?? "unknown", original };
}

function normalizePayload(value: unknown): CreateDossierRecommendationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid payload");
  }
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).length === 0) throw new Error("Invalid payload");

  const ingestSource = supportedIngestSource(payload.ingestSource ?? (payload.createdBy === "bnl_population_recommender" ? "bnl_population_recommender" : undefined));
  const isBridgeIngest = ingestSource === "bnl_source_knowledge_bridge";
  const isPopulationIngest = ingestSource === "bnl_population_recommender" || payload.type === "population_recommendation";
  const isStructuredBnlSourceIngest =
    isBridgeIngest || ingestSource === "bnl_source_file_enrichment";
  const sourceLanesInput = payload.sourceLanes;
  let sourceLanes: DossierRecommendationSourceLane[];
  const normalizedSourceLaneDetails: string[] = [];
  if (sourceLanesInput === undefined) {
    sourceLanes = ["unknown"];
  } else {
    if (!Array.isArray(sourceLanesInput)) {
      throw new Error("Invalid source lane: sourceLanes must be a list");
    }
    if (sourceLanesInput.length > 25) {
      throw new Error("Invalid source lane: sourceLanes has too many entries");
    }
    if (sourceLanesInput.some((lane) => typeof lane !== "string")) {
      throw new Error("Invalid source lane: sourceLanes entries must be strings");
    }
    if (isStructuredBnlSourceIngest || isPopulationIngest) {
      const normalized = sourceLanesInput.map(normalizeBnlSourceLane);
      sourceLanes = normalized.map((item) => item.lane);
      normalizedSourceLaneDetails.push(
        ...normalized
          .filter((item) => item.original && item.original !== item.lane)
          .map((item) => `${item.original} -> ${item.lane}`),
      );
    } else {
      sourceLanes = sourceLanesInput.map((lane) =>
        enumValue(lane, SOURCE_LANES, "source lane"),
      ) as DossierRecommendationSourceLane[];
    }
    sourceLanes = Array.from(new Set(sourceLanes.filter(Boolean)));
    if (sourceLanes.length === 0) sourceLanes = ["unknown"];
  }

  const targetDossierId = text(payload.targetDossierId, 200);
  if (
    targetDossierId &&
    !databasePage.entries.some((entry) => entry.id === targetDossierId)
  ) {
    throw new Error("Invalid target dossier");
  }

  const subjectName = text(payload.subjectName, 200);
  const knownContext = packetStringList(payload.knownContext);
  const usefulEvidence = packetStringList(payload.usefulEvidence);
  const relationshipSignals = packetStringList(payload.relationshipSignals);
  const publicSafePossibilities = packetStringList(
    payload.publicSafePossibilities,
  );
  const privateOnlyNotes = packetStringList(payload.privateOnlyNotes);
  const notPublicYet = packetStringList(payload.notPublicYet);
  const observedChannels = packetStringList(payload.observedChannels);
  const conversationHighlights = packetStringList(payload.conversationHighlights);
  const topicBreakdown = packetStringList(payload.topicBreakdown);
  const bestEvidenceToReview = packetStringList(payload.bestEvidenceToReview);
  const bnlInteractionSignals = packetStringList(payload.bnlInteractionSignals);
  const musicSignals = packetStringList(payload.musicSignals);
  const communitySignals = packetStringList(payload.communitySignals);
  const sourceCoverage = sourceCoverageList(payload.sourceCoverage);
  const evidenceDetails = packetStringList(payload.evidenceDetails);
  const representativeEvidence = reviewEvidenceList(payload.representativeEvidence, "representativeEvidence");
  const activityFrequencySummary = reviewEvidenceList(payload.activityFrequencySummary, "activityFrequencySummary");
  const topChannels = reviewEvidenceList(payload.topChannels, "topChannels");
  const topTopicDetails = reviewEvidenceList(payload.topTopicDetails, "topTopicDetails");
  const recentActivitySummary = reviewEvidenceList(payload.recentActivitySummary, "recentActivitySummary");
  const authoredVsMentionedSummary = reviewEvidenceList(payload.authoredVsMentionedSummary, "authoredVsMentionedSummary");
  const publicUseCandidates = packetStringList(payload.publicUseCandidates);
  const reviewOnlyEvidence = packetStringList(payload.reviewOnlyEvidence);
  const queueSubmissionStatus = enumValue(
    payload.queueSubmissionStatus,
    QUEUE_SUBMISSION_STATUSES,
    "queue submission status",
  );
  const queueSubmissionNote = text(payload.queueSubmissionNote, 1000);
  const recommendedAction = text(payload.recommendedAction, 1000);
  const sourceAuthority = packetStringList(payload.sourceAuthority, 1000);
  const rawProvenance = rawJsonValue(payload.rawProvenance);
  const reason =
    text(payload.reason, 2000) ??
    knownContext?.[0] ??
    bestEvidenceToReview?.[0] ??
    usefulEvidence?.[0] ??
    conversationHighlights?.[0] ??
    text(payload.adminSummary, 1200) ??
    text(payload.recommendedNextStep, 1000) ??
    recommendedAction;
  const evidenceSummary =
    payload.evidenceSummary &&
    typeof payload.evidenceSummary === "object" &&
    !Array.isArray(payload.evidenceSummary)
      ? JSON.stringify(payload.evidenceSummary).slice(0, 2000)
      : text(payload.evidenceSummary, 2000);
  const bridgeEvidenceSummary =
    normalizedSourceLaneDetails.length && isStructuredBnlSourceIngest
      ? [
          evidenceSummary,
          `Bridge source lane mapping: ${normalizedSourceLaneDetails.join(", ")}`,
        ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 2000)
      : evidenceSummary;
  if (!subjectName) throw new Error("subjectName is required");
  if (!reason) {
    throw new Error("reason or structured source context is required");
  }

  return {
    type: enumValue(payload.type ?? (isPopulationIngest ? "population_recommendation" : "new_subject"), RECOMMENDATION_TYPES, "type") ?? (isPopulationIngest ? "population_recommendation" : "new_subject"),
    subjectName,
    subjectKey: text(payload.subjectKey, 200),
    targetCandidateId: text(payload.targetCandidateId, 200),
    targetDossierId,
    reason,
    evidenceSummary: bridgeEvidenceSummary,
    confidence: enumValue(payload.confidence, CONFIDENCES, "confidence"),
    sourceLanes,
    sourceTypes: stringList(payload.sourceTypes, 120),
    suggestedAction: text(payload.suggestedAction, 500),
    knownContext,
    usefulEvidence,
    relationshipSignals,
    publicSafePossibilities,
    privateOnlyNotes,
    notPublicYet,
    observedChannels,
    conversationHighlights,
    topicBreakdown,
    bestEvidenceToReview,
    bnlInteractionSignals,
    musicSignals,
    communitySignals,
    sourceCoverage,
    evidenceDetails,
    representativeEvidence,
    activityFrequencySummary,
    topChannels,
    topTopicDetails,
    recentActivitySummary,
    authoredVsMentionedSummary,
    publicUseCandidates,
    reviewOnlyEvidence,
    queueSubmissionStatus,
    queueSubmissionNote,
    recommendedAction,
    recommendedLane: text(payload.recommendedLane, 120) as CreateDossierRecommendationInput["recommendedLane"],
    matchedExistingCandidateId: text(payload.matchedExistingCandidateId, 200),
    matchedPublicDossierId: text(payload.matchedPublicDossierId, 200),
    matchedPublicDossierName: text(payload.matchedPublicDossierName, 200),
    matchedDossierUpdateCandidateId: text(payload.matchedDossierUpdateCandidateId, 200),
    possibleTargets: Array.isArray(payload.possibleTargets) ? payload.possibleTargets as CreateDossierRecommendationInput["possibleTargets"] : undefined,
    duplicateRisk: text(payload.duplicateRisk, 40) as CreateDossierRecommendationInput["duplicateRisk"],
    identityRisk: text(payload.identityRisk, 40) as CreateDossierRecommendationInput["identityRisk"],
    publicSafetyLevel: text(payload.publicSafetyLevel, 40) as CreateDossierRecommendationInput["publicSafetyLevel"],
    adminSummary: text(payload.adminSummary, 1200),
    recommendedNextStep: text(payload.recommendedNextStep, 1000),
    doNotPublishReason: text(payload.doNotPublishReason, 1000),
    rawEvidenceRefs: stringList(payload.rawEvidenceRefs, 500),
    inputHash: text(payload.inputHash, 300),
    stale: payload.stale === true,
    generatedAt: text(payload.generatedAt, 80),
    populationRecommendation: isPopulationIngest ? true : undefined,
    sourceAuthority,
    rawProvenance,
    normalizedSourceLaneDetails: normalizedSourceLaneDetails.length
      ? normalizedSourceLaneDetails
      : undefined,
    missingInfo: stringList(payload.missingInfo),
    publicSafetyNotes: stringList(payload.publicSafetyNotes),
    doNotSay: stringList(payload.doNotSay),
    recommendedTags: stringList(payload.recommendedTags, 80),
    recommendedCategory: enumValue(payload.recommendedCategory, CATEGORIES, "taxonomy"),
    recommendedKind: enumValue(payload.recommendedKind, KINDS, "taxonomy"),
    recommendedEcosystemLane: enumValue(
      payload.recommendedEcosystemLane,
      ECOSYSTEM_LANES,
      "taxonomy",
    ),
    recommendedIdentityAuthority: enumValue(
      payload.recommendedIdentityAuthority,
      IDENTITY_AUTHORITIES,
      "taxonomy",
    ),
    createdBy: text(payload.createdBy, 200) ?? (isPopulationIngest ? "bnl_population_recommender" : "bnl"),
    ingestKey: text(payload.ingestKey, 300) ?? (isPopulationIngest ? text(payload.recommendationId, 300) : undefined),
    ingestedAt: new Date().toISOString(),
    ingestSource,
  };
}

export async function POST(req: Request) {
  if (!tokenMatches(bearerToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input: CreateDossierRecommendationInput;
  try {
    input = normalizePayload(await req.json().catch(() => null));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await createDossierRecommendationIdempotent(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DossierWorkflowInputError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    throw error;
  }
}
