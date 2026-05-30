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

function normalizePayload(value: unknown): CreateDossierRecommendationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid payload");
  }
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).length === 0) throw new Error("Invalid payload");

  const sourceLanesInput = payload.sourceLanes;
  let sourceLanes: DossierRecommendationSourceLane[];
  if (sourceLanesInput === undefined) {
    sourceLanes = ["unknown"];
  } else {
    if (!Array.isArray(sourceLanesInput)) throw new Error("Invalid source lane");
    sourceLanes = sourceLanesInput.map((lane) =>
      enumValue(lane, SOURCE_LANES, "source lane"),
    ) as DossierRecommendationSourceLane[];
    sourceLanes = sourceLanes.filter(Boolean);
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
  const reason = text(payload.reason, 2000);
  if (!subjectName) throw new Error("subjectName is required");
  if (!reason) throw new Error("reason is required");

  return {
    type: enumValue(payload.type ?? "new_subject", RECOMMENDATION_TYPES, "type") ?? "new_subject",
    subjectName,
    subjectKey: text(payload.subjectKey, 200),
    targetCandidateId: text(payload.targetCandidateId, 200),
    targetDossierId,
    reason,
    evidenceSummary: text(payload.evidenceSummary, 2000),
    confidence: enumValue(payload.confidence, CONFIDENCES, "confidence"),
    sourceLanes,
    suggestedAction: text(payload.suggestedAction, 500),
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
    createdBy: text(payload.createdBy, 200) ?? "bnl",
    ingestKey: text(payload.ingestKey, 300),
    ingestedAt: new Date().toISOString(),
    ingestSource: "bnl",
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
