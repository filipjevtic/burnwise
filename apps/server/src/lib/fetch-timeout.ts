/**
 * fetch() with a hard timeout (#11). External issue-tracker APIs (GitHub, Jira,
 * GitLab) otherwise use fetch's default (effectively unbounded) timeout, so a
 * slow or unresponsive provider can hang a sync — and the request handler —
 * indefinitely. This wraps fetch with an AbortController deadline and surfaces a
 * clear, provider-agnostic error on timeout.
 */

import { config } from "../config.js";

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

export class LocalOnlyError extends Error {
  constructor() {
    super("Outbound request blocked: LOCAL_ONLY mode is enabled");
    this.name = "LocalOnlyError";
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  // Local-only mode (#23): no external egress. Every integration sync and
  // outbound webhook delivery routes through here, so this one guard blocks
  // them all.
  if (config.localOnly) {
    throw new LocalOnlyError();
  }
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
