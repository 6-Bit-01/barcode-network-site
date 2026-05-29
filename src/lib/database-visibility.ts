import type { BnlReadModelExposure, ClearanceMeaning, PublicPageVisibility, databasePage } from "@/content";

export type DatabaseVisibilityEntry = (typeof databasePage.entries)[number] & {
  publicPageVisibility?: PublicPageVisibility;
  bnlReadModelExposure?: BnlReadModelExposure;
  clearanceMeaning?: ClearanceMeaning;
};

export const DEFAULT_PUBLIC_PAGE_VISIBILITY: PublicPageVisibility = "listed_publicly";
export const DEFAULT_BNL_READ_MODEL_EXPOSURE: BnlReadModelExposure = "public_summary";
export const DEFAULT_CLEARANCE_MEANING: ClearanceMeaning = "public_lore_label";

export function getPublicPageVisibility(entry: DatabaseVisibilityEntry): PublicPageVisibility {
  return entry.publicPageVisibility ?? DEFAULT_PUBLIC_PAGE_VISIBILITY;
}

export function getBnlReadModelExposure(entry: DatabaseVisibilityEntry): BnlReadModelExposure {
  if (entry.bnlReadModelExposure) return entry.bnlReadModelExposure;
  return isPublicDatabasePageVisible(entry) ? DEFAULT_BNL_READ_MODEL_EXPOSURE : "hidden";
}

export function getClearanceMeaning(entry: DatabaseVisibilityEntry): ClearanceMeaning {
  return entry.clearanceMeaning ?? DEFAULT_CLEARANCE_MEANING;
}

export function isPublicDatabasePageVisible(entry: DatabaseVisibilityEntry): boolean {
  return getPublicPageVisibility(entry) === "listed_publicly";
}

export function isBnlReadModelDossierVisible(entry: DatabaseVisibilityEntry): boolean {
  return isPublicDatabasePageVisible(entry) && getBnlReadModelExposure(entry) === "public_summary";
}

export function isBnlAggregateOnly(entry: DatabaseVisibilityEntry): boolean {
  return getBnlReadModelExposure(entry) === "aggregate_only";
}

export function isHiddenFromBnl(entry: DatabaseVisibilityEntry): boolean {
  return getBnlReadModelExposure(entry) === "hidden";
}
