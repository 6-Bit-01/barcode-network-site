export const QUEUE_PRODUCTION_ENV = "BARCODE_QUEUE_PRODUCTION_ENABLED";
export const QUEUE_OPERATIONAL_UNAVAILABLE_CODE = "queue_production_disabled";
export const QUEUE_OPERATIONAL_UNAVAILABLE_MESSAGE = "The native BARCODE Radio queue is not available.";

export type QueueOperationalAuthority = "production" | "admin" | "rehearsal" | null;

export type QueueOperationalAccess = {
  authorized: boolean;
  authority: QueueOperationalAuthority;
  productionEnabled: boolean;
  isAdmin: boolean;
  hasRehearsalAccess: boolean;
};

export function isQueueProductionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[QUEUE_PRODUCTION_ENV] === "true";
}

export function resolveQueueOperationalAccess(
  authorities: { isAdmin?: boolean; hasRehearsalAccess?: boolean } = {},
  env: NodeJS.ProcessEnv = process.env,
): QueueOperationalAccess {
  const productionEnabled = isQueueProductionEnabled(env);
  const isAdmin = authorities.isAdmin === true;
  const hasRehearsalAccess = authorities.hasRehearsalAccess === true;
  const authority: QueueOperationalAuthority = isAdmin
    ? "admin"
    : hasRehearsalAccess
      ? "rehearsal"
      : productionEnabled
        ? "production"
        : null;

  return {
    authorized: authority !== null,
    authority,
    productionEnabled,
    isAdmin,
    hasRehearsalAccess,
  };
}

export function queueProductionCapability(env: NodeJS.ProcessEnv = process.env) {
  return {
    queueProduction: isQueueProductionEnabled(env),
  };
}
