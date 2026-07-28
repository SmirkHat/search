import type { Bang } from "../src/redirect";

export type FrecencyMap = Record<string, number>;

/** Parse compact cookie `g:12,yt:5` → map. */
export function parseFrecencyCookie(
  cookieHeader: string | null | undefined,
  cookieName = "bang-frecency",
): FrecencyMap {
  if (!cookieHeader) return {};
  const match = cookieHeader.match(
    new RegExp(`(?:^|; )${cookieName}=([^;]+)`),
  );
  if (!match?.[1]) return {};
  try {
    const raw = decodeURIComponent(match[1]);
    const out: FrecencyMap = {};
    for (const part of raw.split(",")) {
      const [t, n] = part.split(":");
      if (!t) continue;
      const count = Number(n);
      if (Number.isFinite(count) && count > 0) out[t.toLowerCase()] = count;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeFrecencyCookie(
  frecency: FrecencyMap,
  limit = 40,
): string {
  return Object.entries(frecency)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t, n]) => `${t}:${Math.min(9999, Math.round(n))}`)
    .join(",");
}

export const FRECENCY_COOKIE = "bang-frecency";

/** `Set-Cookie` header value for frecency (usable from Service Worker redirects). */
export function frecencySetCookieHeader(frecency: FrecencyMap): string {
  const raw = serializeFrecencyCookie(frecency);
  return `${FRECENCY_COOKIE}=${encodeURIComponent(raw)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function bumpFrecency(
  frecency: FrecencyMap,
  trigger: string,
  amount = 1,
): FrecencyMap {
  const t = trigger.toLowerCase();
  return { ...frecency, [t]: (frecency[t] ?? 0) + amount };
}

/**
 * Suggest bang triggers for omnibox when query starts with bang prefix.
 * Returns bare triggers without prefix — caller formats OpenSearch strings.
 */
export function suggestBangTriggers(
  query: string,
  catalog: Iterable<Pick<Bang, "t"> | string>,
  frecency: FrecencyMap = {},
  limit = 8,
  bangPrefix = "!",
): string[] {
  const trimmed = query.trim();
  if (!trimmed.startsWith(bangPrefix)) return [];

  const partial = trimmed.slice(bangPrefix.length).split(/\s+/)[0]?.toLowerCase() ?? "";
  // If user already typed `!gh something`, don't bang-suggest
  if (/\s/.test(trimmed.trim())) return [];

  const triggers = new Set<string>();
  for (const item of catalog) {
    const t = typeof item === "string" ? item : item.t;
    if (t) triggers.add(t.toLowerCase());
  }

  const scored: { t: string; score: number }[] = [];
  for (const t of triggers) {
    if (partial && !t.startsWith(partial)) continue;
    if (!partial && !(t in frecency) && scored.length > 80) continue;
    const freq = frecency[t] ?? 0;
    // shorter + higher frecency first; exact prefix boost
    const score = freq * 1000 + (partial ? 100 - Math.min(t.length, 99) : 0);
    scored.push({ t, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.t.length - b.t.length || a.t.localeCompare(b.t),
  );

  const out: string[] = [];
  for (const row of scored) {
    if (out.length >= limit) break;
    out.push(row.t);
  }
  return out;
}

export function formatBangSuggestions(
  triggers: string[],
  bangPrefix = "!",
): string[] {
  return triggers.map((t) => `${bangPrefix}${t}`);
}
