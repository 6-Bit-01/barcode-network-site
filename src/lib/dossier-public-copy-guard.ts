import type { DossierDraft } from "@/lib/dossier-workflow";

export type DossierDraftPublicFieldName =
  | "role"
  | "summary"
  | "notes"
  | "tags"
  | "proposedTags"
  | "primaryLinkLabel";

export type DossierDraftFieldWarning = {
  field: DossierDraftPublicFieldName;
  label: string;
  message: string;
};

const FIELD_LABELS: Record<DossierDraftPublicFieldName, string> = {
  role: "Role",
  summary: "Summary",
  notes: "Notes",
  tags: "Tags",
  proposedTags: "Proposed tags",
  primaryLinkLabel: "Primary Link label",
};

const SOURCE_LABELS = [
  "user_profiles/local_profile_observed",
  "conversations/public_discord_observed",
  "relationship_journal/local_relationship_trace",
  "memory_tiers",
  "local_profile_observed",
  "public_discord_observed",
  "local_relationship_trace",
];

const JUNK_PATTERNS = [
  /\buser_profiles\//i,
  /\bconversations\//i,
  /\brelationship_journal\b/i,
  /\bmemory_tiers\b/i,
  /\blocal_profile_observed\b/i,
  /\bpublic_discord_observed\b/i,
  /\blocal_relationship_trace\b/i,
  /\bsource lane mapping\b/i,
  /\bsource lanes?\b/i,
  /\bsource types?\b/i,
  /\bingest\s*key\b/i,
  /\bingestKey\b/i,
  /\bcandidateId\b/i,
  /\btargetId\b/i,
  /\brecommendationId\b/i,
  /\bworkflow record\b/i,
  /\bunknown\s*->\s*unknown\b/i,
  /\b[a-z][a-z0-9_]+\/[a-z0-9_/-]+\b/i,
  /\b(?:dossier_candidate|dossier_recommendation|source_file_note|recommendation|candidate|source|target)_[a-z0-9]+(?:_[a-z0-9]+)+\b/i,
  /\b(?:candidate|source|recommendation|target)[-_ ]?id\s*[:=]\s*[a-z0-9:_-]{8,}\b/i,
];

const BACKEND_TERMS = [
  "candidate",
  "candidateid",
  "conversations",
  "ingest",
  "ingestkey",
  "local_profile_observed",
  "local_relationship_trace",
  "mapping",
  "memory_tiers",
  "public_discord_observed",
  "recommendation",
  "recommendationid",
  "relationship_journal",
  "source",
  "targetid",
  "unknown",
  "user_profiles",
  "workflow",
];

function normalizedLines(value: string): string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasRepeatedLines(value: string): boolean {
  const seen = new Set<string>();
  for (const line of normalizedLines(value)) {
    const key = line.toLowerCase();
    if (key.length < 16) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function hasRepeatedSourceLabels(value: string): boolean {
  const lower = value.toLowerCase();
  return SOURCE_LABELS.some((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lower.match(new RegExp(escaped, "g"));
    return (matches?.length ?? 0) > 1;
  });
}

function isMostlyBackendTerms(value: string): boolean {
  const words = value
    .toLowerCase()
    .replace(/[\/:_-]+/g, " ")
    .match(/[a-z0-9]+/g);
  if (!words || words.length < 5) return false;
  const backendCount = words.filter((word) => BACKEND_TERMS.includes(word)).length;
  return backendCount >= 3 && backendCount / words.length >= 0.35;
}

export function containsDossierPublicCopyJunk(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    JUNK_PATTERNS.some((pattern) => pattern.test(trimmed)) ||
    hasRepeatedSourceLabels(trimmed) ||
    hasRepeatedLines(trimmed) ||
    isMostlyBackendTerms(trimmed)
  );
}

export function sanitizeDossierPublicCopy(value: string): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of normalizedLines(value)) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (containsDossierPublicCopyJunk(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

function warningForField(
  field: DossierDraftPublicFieldName,
  value: string | undefined,
): DossierDraftFieldWarning | null {
  if (!value || !containsDossierPublicCopyJunk(value)) return null;
  const label = FIELD_LABELS[field];
  return {
    field,
    label,
    message: `${label} contains internal source/debug text and needs clean public copy before owner review.`,
  };
}

export function validateDossierPublicDraftFields(
  fields: DossierDraft["fields"],
): DossierDraftFieldWarning[] {
  const warnings: DossierDraftFieldWarning[] = [];
  for (const [field, value] of [
    ["role", fields.role],
    ["summary", fields.summary],
    ["notes", fields.notes],
  ] as const) {
    const warning = warningForField(field, value);
    if (warning) warnings.push(warning);
  }
  if ((fields.tags ?? []).some((tag) => containsDossierPublicCopyJunk(tag))) {
    warnings.push({
      field: "tags",
      label: FIELD_LABELS.tags,
      message:
        "Tags contain raw source labels or backend identifiers and need clean public tags before owner review.",
    });
  }
  if (
    (fields.proposedTags ?? []).some((tag) => containsDossierPublicCopyJunk(tag))
  ) {
    warnings.push({
      field: "proposedTags",
      label: FIELD_LABELS.proposedTags,
      message:
        "Proposed tags contain raw source labels or backend identifiers and need clean review-only tag suggestions.",
    });
  }
  const primaryLinkWarning = warningForField(
    "primaryLinkLabel",
    fields.primaryLink?.label,
  );
  if (primaryLinkWarning) warnings.push(primaryLinkWarning);
  return warnings;
}

export function getDossierDraftSubstanceWarnings(
  fields: DossierDraft["fields"],
): string[] {
  return validateDossierPublicDraftFields(fields).map(
    (warning) => warning.message,
  );
}
