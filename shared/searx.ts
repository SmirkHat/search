/** Curated public SearxNG instances (working search + autocomplete). */

export type SearxInstance = {
  host: string;
  /** ISO country / region code shown in the picker. */
  region: string;
};

export const SEARX_INSTANCES: SearxInstance[] = [
  { host: "search.rhscz.eu", region: "NL" },
  { host: "searx.rhscz.eu", region: "CZ" },
  { host: "searx.linxx.net", region: "DE" },
  { host: "searxng.deggo.fyi", region: "NL" },
  { host: "searxng.website", region: "DE" },
  { host: "searx.oloke.xyz", region: "PL" },
  { host: "searx.tiekoetter.com", region: "DE" },
  { host: "search.im-in.space", region: "DE" },
  { host: "xka.cz", region: "FI" },
  { host: "searx.ononoki.org", region: "US" },
];

export const DEFAULT_SEARX_HOST = SEARX_INSTANCES[0]!.host;
export const SEARX_COOKIE = "searx-instance";

/** Former curated hosts we no longer recommend — migrate to default. */
const RETIRED_SEARX_HOSTS = new Set([
  "searxng.cz",
  "searx.namejeff.xyz",
]);

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/** Hostname (optional :port) suitable for a SearxNG instance URL. */
export function isValidSearxHost(host: string): boolean {
  const raw = host.trim().toLowerCase();
  if (!raw || raw.length > 262) return false;

  let name = raw;
  let port: string | undefined;
  const colon = raw.lastIndexOf(":");
  if (colon !== -1 && raw.indexOf(":") === colon && !raw.includes("]")) {
    name = raw.slice(0, colon);
    port = raw.slice(colon + 1);
    if (!/^\d{1,5}$/.test(port)) return false;
    const n = Number(port);
    if (n < 1 || n > 65535) return false;
  }

  if (!name || name === "localhost" || name.endsWith(".localhost")) {
    return false;
  }
  // No raw IPs (reduces SSRF via the /ac proxy).
  if (IPV4_RE.test(name) || name.includes(":")) return false;

  const labels = name.split(".");
  if (labels.length < 2) return false;
  return labels.every((label) =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
  );
}

export function isKnownSearxHost(host: string): boolean {
  return SEARX_INSTANCES.some((i) => i.host === host.trim().toLowerCase());
}

/** Accept `host`, `host:port`, or full `https://host/...` → hostname[:port]. */
export function parseSearxHostInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      candidate = url.host; // hostname + optional port
    } catch {
      return null;
    }
  } else {
    candidate = trimmed
      .split("/")[0]!
      .split("?")[0]!
      .split("#")[0]!
      .trim();
  }

  const normalized = candidate.toLowerCase();
  if (RETIRED_SEARX_HOSTS.has(normalized.split(":")[0]!)) return null;
  return isValidSearxHost(normalized) ? normalized : null;
}

export function normalizeSearxHost(
  host: string | null | undefined,
): string {
  const parsed = parseSearxHostInput(host ?? "");
  return parsed ?? DEFAULT_SEARX_HOST;
}

/** Compact picker label: `CZ · searx.rhscz.eu` (or bare host for custom). */
export function searxInstanceLabel(host: string): string {
  const normalized = normalizeSearxHost(host);
  const known = SEARX_INSTANCES.find((i) => i.host === normalized);
  if (known) return `${known.region} · ${known.host}`;
  return normalized;
}

export function searxSearchTemplate(host: string): string {
  return `https://${normalizeSearxHost(host)}/search?q={{{s}}}`;
}

export function parseSearxHostFromCookie(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${SEARX_COOKIE}=([^;]+)`),
  );
  const host = match?.[1] ? decodeURIComponent(match[1].trim()) : "";
  return parseSearxHostInput(host);
}
