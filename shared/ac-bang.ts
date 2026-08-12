/**
 * Shared helpers for bang-aware OpenSearch suggestions in /ac.
 */
import {
  formatBangSuggestions,
  parseFrecencyCookie,
  suggestBangTriggers,
  type FrecencyMap,
} from "./bang-suggest";
import { normalizeBangPrefix } from "./bang-prefix";

export type BangCatalogEntry = { t: string };

const hotCache = new Map<string, { at: number; triggers: string[] }>();
const HOT_TTL_MS = 60 * 60 * 1000;

export function bangPrefixFromCookie(
  cookieHeader: string | null | undefined,
): string {
  if (!cookieHeader) return "!";
  const match = cookieHeader.match(/(?:^|; )bang-prefix=([^;]+)/);
  if (!match?.[1]) return "!";
  try {
    return normalizeBangPrefix(decodeURIComponent(match[1])) ?? "!";
  } catch {
    return "!";
  }
}

export function isBangSuggestQuery(q: string, bangPrefix = "!"): boolean {
  const trimmed = q.trim();
  return trimmed.startsWith(bangPrefix) && !/\s/.test(trimmed);
}

export function parseCustomTriggersFromCookie(
  cookieHeader: string | null | undefined,
): string[] {
  if (!cookieHeader) return [];
  const match = cookieHeader.match(/(?:^|; )custom-bang-triggers=([^;]+)/);
  if (!match?.[1]) return [];
  try {
    return decodeURIComponent(match[1])
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function loadHotTriggers(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const cached = hotCache.get(origin);
  if (cached && Date.now() - cached.at < HOT_TTL_MS) {
    return cached.triggers;
  }

  try {
    const res = await fetchImpl(new URL("/bangs-hot.json", origin).href, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return cached?.triggers ?? [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return cached?.triggers ?? [];
    const triggers: string[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const t = String((item as BangCatalogEntry).t ?? "")
        .trim()
        .toLowerCase();
      if (t) triggers.push(t);
    }
    hotCache.set(origin, { at: Date.now(), triggers });
    return triggers;
  } catch {
    return cached?.triggers ?? [];
  }
}

export async function resolveBangSuggestions(
  q: string,
  origin: string,
  cookieHeader: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  const bangPrefix = bangPrefixFromCookie(cookieHeader);
  if (!isBangSuggestQuery(q, bangPrefix)) return null;

  const frecency: FrecencyMap = parseFrecencyCookie(cookieHeader);
  const custom = parseCustomTriggersFromCookie(cookieHeader);
  const hot = await loadHotTriggers(origin, fetchImpl);
  const catalog = [...custom, ...hot];
  const triggers = suggestBangTriggers(q, catalog, frecency, 8, bangPrefix);
  return formatBangSuggestions(triggers, bangPrefix);
}
