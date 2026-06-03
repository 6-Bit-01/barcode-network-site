const rawSourcePathPattern =
  /\b(?:user_profiles|relationship_journal|conversations|memory_tiers|rd_context|broadcast_memory|source_blind_memory_trace|local_knowledge_store)\s*\/\s*[a-z0-9_/-]+\b/i;

const rawBackendLabelPattern =
  /\b(?:local_profile_observed|local_relationship_trace|public_discord_observed|source lane mapping|bridge source lane mapping|source lanes?:\s*unknown|unknown\s*->\s*unknown|help_signal\s*:|EDGE_SESSI(?:ON)?|ingestKey|candidateId|recommendationId|targetId|sourceTypes|sourceCounts|memory_tiers|private_review_required|owner_review_required|public_use_not_allowed_until_review)\b/i;

const rawIdPattern =
  /\b(?:candidate|target|dossier|source_file|recommendation|rec|bnl|edge_session|ingest)[_:][a-z0-9][a-z0-9_-]{8,}\b/i;

const rawMappingOnlyPattern =
  /\b(?:source lane mapping|bridge source lane mapping|source lanes?:\s*unknown|unknown\s*->\s*unknown)\b/i;

const localProfilePattern =
  /\buser_profiles\s*\/\s*local_profile_observed\b|\blocal_profile_observed\b/i;
const relationshipTracePattern =
  /\brelationship_journal\s*\/\s*local_relationship_trace\b|\blocal_relationship_trace\b|\brelationship_journal\b/i;
const publicDiscordPattern =
  /\bconversations\s*\/\s*public_discord_observed\b|\bpublic_discord_observed\b/i;
const localKnowledgePattern =
  /\bBNL local knowledge stores?\b|\blocal_knowledge_store\b/i;

function compact(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function inferredSubject(value: string): string | undefined {
  return value.match(/local profile observed for ([A-Z][A-Za-z0-9 ._-]{1,80})/i)?.[1]
    ?.replace(/[.;:,].*$/, "")
    .trim();
}

function subjectCopy(subjectName?: string) {
  const clean = compact(subjectName);
  return clean ? ` for ${clean}` : " for this subject";
}

function unique(items: string[], limit = 5) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const clean = compact(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

export function isRawSourceMemoryDebugText(value?: string | null) {
  const clean = compact(value);
  if (!clean) return false;
  return (
    rawSourcePathPattern.test(clean) ||
    rawBackendLabelPattern.test(clean) ||
    rawIdPattern.test(clean)
  );
}

export function isRawSourceMappingOnly(value?: string | null) {
  return rawMappingOnlyPattern.test(compact(value));
}

export function sourceMemoryMeaningItems(
  value?: string | null,
  options: { subjectName?: string; includePublicDiscord?: boolean } = {},
) {
  const clean = compact(value);
  if (!clean) return [];

  if (/^\s*(?:bridge\s+)?source lane mapping\s*:/i.test(clean)) return [];

  const items: string[] = [];
  const subjectName = options.subjectName ?? inferredSubject(clean);
  const subject = subjectCopy(subjectName);

  if (localProfilePattern.test(clean)) {
    items.push(`BNL found an internal local profile match${subject}.`);
  }

  if (relationshipTracePattern.test(clean)) {
    items.push(
      subjectName
        ? `BNL found prior relationship/context notes connected to ${subjectName}.`
        : "BNL found prior relationship/context notes connected to this subject.",
    );
  }

  if (options.includePublicDiscord && publicDiscordPattern.test(clean)) {
    items.push(
      "BNL found approved public-side context connected to this subject, but owner review is still needed before public use.",
    );
  }

  if (localKnowledgePattern.test(clean)) {
    items.push(
      "Internal BNL memory references exist, but they need owner review before public use.",
    );
  }

  if (
    /\b(?:private_review_required|owner_review_required|public_use_not_allowed_until_review|internal_only)\b/i.test(
      clean,
    )
  ) {
    items.push("This needs internal review before public use.");
  }

  if (
    /\b(?:missing public-safe|public-safe display name|public link|role)\b/i.test(
      clean,
    )
  ) {
    items.push("Missing public-safe display name, role, and public link.");
  }

  if (items.length) return unique(items);
  if (isRawSourceMappingOnly(clean)) return [];
  if (isRawSourceMemoryDebugText(clean)) {
    return [
      "Internal BNL memory references exist, but they need owner review before public use.",
    ];
  }
  return [];
}

export function meaningFirstSourceText(
  value?: string | null,
  options: {
    subjectName?: string;
    fallback?: string;
    includePublicDiscord?: boolean;
  } = {},
) {
  const clean = compact(value);
  if (!clean) return options.fallback;
  const meaning = sourceMemoryMeaningItems(clean, options);
  if (meaning.length) return meaning.join(" ");
  if (isRawSourceMemoryDebugText(clean)) return options.fallback;
  return clean;
}

export function sourceFileReasonMeaning(
  value: string | undefined | null,
  subjectName: string,
) {
  const clean = compact(value);
  if (!clean || isRawSourceMemoryDebugText(clean)) {
    return `BNL found existing internal context for ${subjectName} and created this source file so an owner can decide whether it should become a usable dossier record.`;
  }
  return clean;
}

export function sourceFileWhyNowMeaning(value?: string | null) {
  const clean = compact(value);
  if (!clean || isRawSourceMemoryDebugText(clean)) {
    return "Needs owner review before any public dossier copy is drafted, published, merged, or linked to an identity.";
  }
  return clean;
}

export function sourceFileEvidenceClusterItems(
  values: Array<string | undefined | null>,
  options: { subjectName?: string } = {},
) {
  const joined = values.map(compact).filter(Boolean).join("\n");
  const items = sourceMemoryMeaningItems(joined, {
    subjectName: options.subjectName,
    includePublicDiscord: true,
  });
  if (isRawSourceMemoryDebugText(joined)) {
    items.push(
      "Public-safe identity is not confirmed.",
      "Owner review required before public use.",
      "More public-safe context needed before drafting.",
    );
  }
  return unique(items, 5);
}

export function sanitizeMeaningFirstItems(
  values: Array<string | undefined | null>,
  options: {
    subjectName?: string;
    fallback?: string;
    limit?: number;
    includePublicDiscord?: boolean;
  } = {},
) {
  const output: string[] = [];
  for (const value of values) {
    const clean = compact(value);
    if (!clean) continue;
    const meaning = sourceMemoryMeaningItems(clean, options);
    if (meaning.length) output.push(...meaning);
    else if (!isRawSourceMemoryDebugText(clean)) output.push(clean);
  }
  const result = unique(output, options.limit ?? 5);
  if (result.length) return result;
  return options.fallback ? [options.fallback] : [];
}
