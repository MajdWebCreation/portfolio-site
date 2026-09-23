import { ProviderError } from "@/lib/analytics-admin/types";

/**
 * One request to a provider, bounded in time.
 *
 * The request and the reading of its body share one `AbortSignal.timeout`,
 * so a server that sends headers and then stalls is cut off as surely as
 * one that never answers. A timeout becomes `ProviderError("timeout")`,
 * any other failure to get an answer `ProviderError("network")`; the
 * caller classes the status and parses the text. Nothing about the request
 * (its URL can hold an API key) or the answer ends up in the error.
 *
 * Ten seconds per request: well under the cron's sixty, generous for
 * report APIs that usually answer within one or two.
 */
export const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;

export type ProviderResponse = { ok: boolean; status: number; text: string };

export async function fetchWithTimeout(
  doFetch: typeof fetch,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number = PROVIDER_REQUEST_TIMEOUT_MS,
): Promise<ProviderResponse> {
  const signal = AbortSignal.timeout(timeoutMs);
  /* The race also holds for a fetch that ignores the signal. */
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new ProviderError("timeout")), { once: true });
  });
  const work = (async () => {
    const response = await doFetch(input, { ...init, signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  })();
  work.catch(() => undefined);
  timedOut.catch(() => undefined);

  try {
    return await Promise.race([work, timedOut]);
  } catch {
    throw new ProviderError(signal.aborted ? "timeout" : "network");
  }
}

/** The body as JSON, or `invalid_response`. */
export function parseJson<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError("invalid_response");
  }
}
