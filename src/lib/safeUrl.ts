// SSRF guard for agent webhook URLs. An agent (or a sponsor) can name any
// URL, so the server must never call into its own network or cloud metadata.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** True when an IP address is one the server must never call out to. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedV4(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d): judge the embedded IPv4 address.
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedV4(mapped[1]);
    if (s === "::" || s === "::1") return true;
    const first = parseInt(s.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (s.startsWith("2001:db8:")) return true; // documentation
    return false;
  }
  return true; // not an IP: callers check hostnames separately
}

function isBlockedV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 0 || b === 168)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|localdomain)$/i;

/** Synchronous checks on the URL text itself. Returns a reason when refused. */
export function webhookUrlProblem(raw: string, opts: { allowInsecure?: boolean } = {}): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not a URL";
  }
  if (u.protocol !== "https:" && !(opts.allowInsecure && u.protocol === "http:")) return "webhook must use https";
  if (u.username || u.password) return "webhook URL must not contain credentials";
  if (u.port && u.port !== "443" && !opts.allowInsecure) return "webhook must use the default https port";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!opts.allowInsecure) {
    if (isIP(host)) return isBlockedIp(host) ? "webhook address is not public" : "webhook must use a hostname, not an IP";
    if (BLOCKED_HOSTS.test(host) || !host.includes(".")) return "webhook host is not public";
  }
  return null;
}

/**
 * Full check: syntax, then every address the hostname resolves to must be
 * public. Throws with a readable reason. Call at save time and again before
 * each webhook call (the DNS answer can change).
 */
export async function assertPublicWebhookUrl(raw: string): Promise<URL> {
  const insecure = process.env.ALLOW_INSECURE_WEBHOOKS === "1" && process.env.NODE_ENV !== "production";
  const problem = webhookUrlProblem(raw, { allowInsecure: insecure });
  if (problem) throw new Error(problem);
  const u = new URL(raw);
  if (insecure) return u;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return u; // already judged above
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("webhook host does not resolve");
  }
  if (addrs.length === 0 || addrs.some((a) => isBlockedIp(a.address))) throw new Error("webhook host resolves to a non-public address");
  return u;
}
