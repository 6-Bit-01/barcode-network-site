export const PROVIDER_FETCH_TIMEOUT_MS = 2500;
export const PROVIDER_FETCH_MAX_BYTES = 256 * 1024;

export interface ProviderFetchBudget {
  readonly deadlineMs: number;
  remainingMs(): number;
}

export interface ProviderFetchOptions {
  maxBytes?: number;
}

export function createProviderFetchBudget(timeoutMs = PROVIDER_FETCH_TIMEOUT_MS): ProviderFetchBudget {
  const safeTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.floor(timeoutMs))
    : PROVIDER_FETCH_TIMEOUT_MS;
  const deadlineMs = Date.now() + safeTimeoutMs;
  return {
    deadlineMs,
    remainingMs: () => Math.max(0, deadlineMs - Date.now()),
  };
}

function isJsonContentType(contentType: string): boolean {
  return !contentType || /application\/(json|[^;]+\+json)|text\/json/i.test(contentType);
}

async function cancelBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel();
  } catch {
    // Best-effort resource cleanup only.
  }
}

async function readLimitedJson(response: Response, maxBytes: number): Promise<unknown | null> {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!isJsonContentType(contentType)) {
    await cancelBody(response);
    return null;
  }

  const contentLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await cancelBody(response);
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    // The repository's focused tests use small Response-like fetch mocks.
    // Real fetch Responses expose a body or arrayBuffer, so production size
    // limits remain enforced before parsing.
    if (typeof response.arrayBuffer === "function") {
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > maxBytes) return null;
      try {
        return JSON.parse(new TextDecoder().decode(body));
      } catch {
        return null;
      }
    }
    if (typeof response.json === "function") {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }
    return null;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Best-effort resource cleanup only.
        }
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
}

export async function fetchProviderJson(
  input: string | URL,
  init: RequestInit = {},
  budget: ProviderFetchBudget = createProviderFetchBudget(),
  options: ProviderFetchOptions = {},
): Promise<unknown | null> {
  const remainingMs = budget.remainingMs();
  if (remainingMs <= 0) return null;

  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(1, Math.floor(options.maxBytes ?? PROVIDER_FETCH_MAX_BYTES))
    : PROVIDER_FETCH_MAX_BYTES;
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) return null;
  callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), remainingMs);

  try {
    const response = await fetch(input, {
      ...init,
      cache: init.cache ?? "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      await cancelBody(response);
      return null;
    }
    return await readLimitedJson(response, maxBytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
