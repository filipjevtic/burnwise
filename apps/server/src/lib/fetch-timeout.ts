/**
 * fetch() with a hard timeout (#11). External issue-tracker APIs (GitHub, Jira,
 * GitLab) otherwise use fetch's default (effectively unbounded) timeout, so a
 * slow or unresponsive provider can hang a sync — and the request handler —
 * indefinitely. This wraps fetch with an AbortController deadline and surfaces a
 * clear, provider-agnostic error on timeout.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // SSRF is mitigated upstream: every caller's base URL is validated by
    // assertSafeIntegrationUrl (rejects private/link-local/loopback hosts,
    // DNS-rebinding-aware) before any request, and GitHub/GitLab pagination is
    // pinned to the configured origin. The host is a user-configured SaaS
    // endpoint by design, so no static allowlist is possible.
    // codeql[js/request-forgery]
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
