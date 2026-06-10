const PRODUCTION_SITE_ORIGIN = "https://barcode-network.com";

const CONFIGURED_SITE_ORIGIN_ENV_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "PUBLIC_SITE_URL",
  "BARCODE_SITE_URL",
];

const CONFIGURED_ALLOWLIST_ENV_KEYS = [
  "TRUSTED_SITE_ORIGINS",
  "SITE_CALLBACK_BASE_URL_ALLOWLIST",
  "SOURCE_FILE_CALLBACK_BASE_URL_ALLOWLIST",
];

const VERCEL_URL_ENV_KEYS = [
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
];

function normalizeOrigin(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function originHost(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function splitEnvList(value: string | undefined): string[] {
  return value
    ? value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function configuredTrustedOrigins(): Set<string> {
  const origins = new Set<string>([PRODUCTION_SITE_ORIGIN]);
  for (const key of CONFIGURED_SITE_ORIGIN_ENV_KEYS) {
    const origin = normalizeOrigin(process.env[key]);
    if (origin) origins.add(origin);
  }
  for (const key of CONFIGURED_ALLOWLIST_ENV_KEYS) {
    for (const value of splitEnvList(process.env[key])) {
      const origin = normalizeOrigin(value);
      if (origin) origins.add(origin);
    }
  }
  return origins;
}

function configuredVercelHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const key of VERCEL_URL_ENV_KEYS) {
    const host = originHost(normalizeOrigin(process.env[key]));
    if (host) hosts.add(host);
  }
  return hosts;
}

function originFromForwardedHeaders(req: Request): string | undefined {
  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  if (!forwardedHost) return undefined;
  const forwardedProto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
}

function requestUrlOrigin(req: Request): string | undefined {
  try {
    return normalizeOrigin(new URL(req.url).origin);
  } catch {
    return undefined;
  }
}

function isTrustedOrigin(origin: string): boolean {
  const trustedOrigins = configuredTrustedOrigins();
  if (trustedOrigins.has(origin)) return true;

  const host = originHost(origin);
  if (!host) return false;
  return configuredVercelHosts().has(host);
}

export function trustedRequestingSiteOrigin(req: Request): string | undefined {
  const candidates = [originFromForwardedHeaders(req), requestUrlOrigin(req)];
  return candidates.find((origin): origin is string =>
    Boolean(origin && isTrustedOrigin(origin)),
  );
}

export function safeOriginHost(origin: string | undefined): string | undefined {
  return originHost(origin);
}
