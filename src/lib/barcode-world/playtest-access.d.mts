export const BARCODE_WORLD_OWNER_PREVIEW_BRANCH: string;

type PlaytestEnvironment = Readonly<Record<string, string | undefined>>;

export function isBarcodeWorldOwnerPreview(
  environment?: PlaytestEnvironment,
): boolean;

export function canServeBarcodeWorldPlaytest(
  environment?: PlaytestEnvironment,
): boolean;

export function shouldHideBarcodeWorldPlaytest(
  environment?: PlaytestEnvironment,
): boolean;
