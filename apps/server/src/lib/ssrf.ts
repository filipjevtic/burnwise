import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config.js";

/**
 * Guards against SSRF on user-supplied integration URLs (Jira/GitLab baseUrl and
 * paginated "next" links). An authenticated project admin could otherwise point
 * baseUrl at internal services or the cloud metadata endpoint
 * (169.254.169.254) and have the server forward the integration credentials
 * there. We require http(s) and reject loopback / link-local / private targets.
 *
 * Private-range targets are blocked by default so a stock deployment is safe;
 * operators running self-hosted Jira/GitLab on an internal network can opt in
 * with INTEGRATION_ALLOW_PRIVATE_HOSTS=true.
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function inCidr(ipInt: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** Always-blocked IPv4 ranges (loopback, link-local/metadata, unspecified, etc.). */
function isAlwaysBlockedV4(ipInt: number): boolean {
  return (
    inCidr(ipInt, "0.0.0.0", 8) ||       // "this" network / unspecified
    inCidr(ipInt, "127.0.0.0", 8) ||     // loopback
    inCidr(ipInt, "169.254.0.0", 16) ||  // link-local (cloud metadata)
    inCidr(ipInt, "100.64.0.0", 10) ||   // CGNAT
    inCidr(ipInt, "224.0.0.0", 4) ||     // multicast
    inCidr(ipInt, "240.0.0.0", 4)        // reserved
  );
}

/** Private (RFC 1918) IPv4 ranges — blocked unless explicitly allowed. */
function isPrivateV4(ipInt: number): boolean {
  return (
    inCidr(ipInt, "10.0.0.0", 8) ||
    inCidr(ipInt, "172.16.0.0", 12) ||
    inCidr(ipInt, "192.168.0.0", 16)
  );
}

function assertAddressAllowed(address: string): void {
  const allowPrivate = config.integrationAllowPrivateHosts;

  let v4: string | null = null;
  if (isIP(address) === 4) {
    v4 = address;
  } else if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    // Reject IPv6 loopback / unspecified / link-local / unique-local outright.
    if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      throw new SsrfError("Integration host resolves to a disallowed address");
    }
    // Unwrap IPv4-mapped IPv6 and check as IPv4. The WHATWG URL parser may emit
    // either dotted (::ffff:127.0.0.1) or hex-compressed (::ffff:7f00:1) form.
    const dotted = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    const hex = lower.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (dotted) {
      v4 = dotted[1];
    } else if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    } else {
      return; // a routable global IPv6 address
    }
  } else {
    return; // not an IP literal (shouldn't happen post-resolution)
  }

  if (!v4) return;
  const ipInt = ipv4ToInt(v4);
  if (isAlwaysBlockedV4(ipInt)) {
    throw new SsrfError("Integration host resolves to a loopback/link-local address");
  }
  if (!allowPrivate && isPrivateV4(ipInt)) {
    throw new SsrfError(
      "Integration host resolves to a private address. Set INTEGRATION_ALLOW_PRIVATE_HOSTS=true to allow self-hosted internal targets."
    );
  }
}

/**
 * Validate a user-supplied integration URL: http(s) scheme only, and its host
 * must not resolve to a blocked address. Throws SsrfError on violation.
 */
export async function assertSafeIntegrationUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid integration URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError("Integration URL must use http or https");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // If the host is an IP literal, check it directly; otherwise resolve all A/AAAA
  // records and check each (a host is only safe if none of its addresses are).
  if (isIP(hostname)) {
    assertAddressAllowed(hostname);
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new SsrfError("Could not resolve integration host");
  }
  if (addresses.length === 0) {
    throw new SsrfError("Integration host did not resolve");
  }
  for (const { address } of addresses) {
    assertAddressAllowed(address);
  }
}

/** True when `candidate` has the same origin (protocol+host+port) as `base`. */
export function sameOrigin(candidate: string, base: string): boolean {
  try {
    return new URL(candidate).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
