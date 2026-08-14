export const BARCODE_WORLD_OWNER_PREVIEW_BRANCH =
  "agent/barcode-world-card-battle-v0-1";

export function isBarcodeWorldOwnerPreview(environment = process.env) {
  return (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF === BARCODE_WORLD_OWNER_PREVIEW_BRANCH
  );
}

export function canServeBarcodeWorldPlaytest(environment = process.env) {
  return (
    environment.NODE_ENV === "development" ||
    isBarcodeWorldOwnerPreview(environment)
  );
}

export function shouldHideBarcodeWorldPlaytest(environment = process.env) {
  return !canServeBarcodeWorldPlaytest(environment);
}
