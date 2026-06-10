import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { CreateDossierSourceFileArchiveInput } from "@/lib/dossier-workflow";
import {
  DossierWorkflowInputError,
  ingestDossierSourceFileArchive,
} from "@/lib/dossier-workflow-store";

export const dynamic = "force-dynamic";

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") || "";
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? (token ?? "") : "";
}

function tokenMatches(actual: string): boolean {
  const expected =
    process.env.BNL_SOURCE_FILE_ARCHIVE_TOKEN ||
    process.env.BNL_DOSSIER_INGEST_TOKEN ||
    "";
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

function text(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Expected text field");
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.slice(0, maxLength);
}

function stringList(
  value: unknown,
  maxItems = 10,
  maxItemLength = 1000,
): string[] | undefined {
  const input = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : [];
  const items = input
    .map((item) => text(item, maxItemLength))
    .filter((item): item is string => Boolean(item));
  return items.length
    ? Array.from(new Set(items)).slice(0, maxItems)
    : undefined;
}

function normalizePayload(value: unknown): CreateDossierSourceFileArchiveInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  const subjectName = text(payload.subjectName, 200);
  const sourcePackage =
    payload.sourcePackage ??
    payload.archive ??
    payload.sourceArchive ??
    payload.fullSourcePackage;
  if (!subjectName) throw new Error("subjectName is required");
  if (sourcePackage === undefined || sourcePackage === null) {
    throw new Error("sourcePackage is required");
  }
  return {
    candidateId: text(payload.candidateId, 200),
    subjectName,
    subjectKey: text(payload.subjectKey, 200),
    ingestKey: text(payload.ingestKey, 300),
    ingestSource: "bnl_source_file_enrichment",
    sourcePackage,
    compactSummary: text(payload.compactSummary, 1600),
    publicSafePossibilities: stringList(payload.publicSafePossibilities),
    missingInfo: stringList(payload.missingInfo),
    publicSafetyNotes: stringList(payload.publicSafetyNotes),
    doNotSay: stringList(payload.doNotSay),
    evidenceReceiptSummary: stringList(
      payload.evidenceReceiptSummary,
      10,
      1000,
    ),
    sourceFileCaseReportV1: payload.sourceFileCaseReportV1 as CreateDossierSourceFileArchiveInput["sourceFileCaseReportV1"],
    sourceFileBriefV2: payload.sourceFileBriefV2 as CreateDossierSourceFileArchiveInput["sourceFileBriefV2"],
    archivePayload: payload.archivePayload,
    archive: payload.archive,
    payload: payload.payload,
    sourceFileArchive: payload.sourceFileArchive,
  };
}

export async function POST(req: Request) {
  if (!tokenMatches(bearerToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input: CreateDossierSourceFileArchiveInput;
  try {
    input = normalizePayload(await req.json().catch(() => null));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const result = await ingestDossierSourceFileArchive(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof DossierWorkflowInputError) {
      return NextResponse.json(
        { error: error.message, code: error.code, ...error.details },
        { status: error.status },
      );
    }
    throw error;
  }
}
