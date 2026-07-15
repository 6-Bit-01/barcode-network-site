export const QUEUE_PRODUCTION_ENV = "BARCODE_QUEUE_PRODUCTION_ENABLED";

export function isQueueProductionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[QUEUE_PRODUCTION_ENV] === "true";
}

export function queueProductionCapability(env: NodeJS.ProcessEnv = process.env) {
  return {
    queueProduction: isQueueProductionEnabled(env),
  };
}
