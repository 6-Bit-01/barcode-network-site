import type { DatabaseEntry } from "@/content";
import type { DossierDraft } from "@/lib/dossier-workflow";
import { getDossierPrimaryLink } from "@/lib/dossier-links";
import { getEntryImage } from "@/lib/placeholder";
import type { DossierPageViewModel } from "@/components/DossierPageView";

function draftValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function draftId(draft: Pick<DossierDraft, "id" | "fields">) {
  return draftValue(draft.fields.id, `DRAFT-${draft.id.slice(0, 8).toUpperCase()}`);
}

function draftPrimaryLink(draft: Pick<DossierDraft, "id" | "fields">) {
  const link = draft.fields.primaryLink;
  if (!link?.url || link.publicSafe === false) return null;
  return {
    label: link.label?.trim() || "Link",
    url: link.url,
    type: link.type || "website",
  };
}

export function databaseEntryToDossierPageViewModel(
  entry: DatabaseEntry,
): DossierPageViewModel {
  return {
    id: entry.id,
    name: entry.name,
    image: getEntryImage(entry),
    category: entry.category,
    status: entry.status,
    clearance: entry.clearance,
    role: entry.role,
    origin: entry.origin,
    summary: entry.summary,
    notes: entry.notes,
    tags: entry.tags,
    primaryLink: getDossierPrimaryLink(entry),
    links: entry.links,
    files: entry.files,
    backHref: "/database",
    backLabel: "Back to Database",
    showTerminalReadout: true,
  };
}

export function draftToDossierPreviewViewModel(
  draft: Pick<DossierDraft, "id" | "fields">,
): DossierPageViewModel {
  const id = draftId(draft);
  const category = draftValue(draft.fields.category, "Entity");
  const status = draftValue(draft.fields.status, "PENDING");
  const clearance = draftValue(draft.fields.clearance, "INTERNAL");
  const image = getEntryImage({
    id,
    image: "",
    clearance,
    category,
    status,
  });
  const primaryLink = draftPrimaryLink(draft);
  return {
    id,
    name: draftValue(draft.fields.name, "Untitled Proposed Dossier"),
    image,
    category,
    status,
    clearance,
    role: draftValue(draft.fields.role, "Role pending owner review."),
    origin: draftValue(draft.fields.origin, "UNVERIFIED"),
    summary: draftValue(draft.fields.summary, "Summary pending owner review."),
    notes: draft.fields.notes?.trim() ?? "",
    tags: [...(draft.fields.tags ?? []), ...(draft.fields.proposedTags ?? [])],
    primaryLink,
    links: primaryLink ? [primaryLink] : [],
    files: draft.fields.files ?? [],
    backHref: "/admin/dossiers",
    backLabel: "Back to Dossier Dashboard",
    previewMode: true,
    unpublishedLabel: "UNPUBLISHED PREVIEW",
    showTerminalReadout: true,
  };
}
