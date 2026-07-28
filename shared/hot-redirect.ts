/**
 * Shared redirect hot path: inlined top bangs + zero-copy overlays when possible.
 */
import { inflateBangs } from "./bang-compact";
import { HOT_BANGS } from "./bangs-hot.generated";
import { searxSearchTemplate } from "./searx";
import {
  buildBangMap,
  ensureEssentialBangs,
  extractBangTrigger,
  longestTriggerPrefix,
  type Bang,
} from "../src/redirect";

/** Built once at module load — never mutate. */
export const INLINE_HOT_MAP: ReadonlyMap<string, Bang> = ensureEssentialBangs(
  buildBangMap(inflateBangs([...HOT_BANGS])),
);

export type HotOverlayPrefs = {
  customBangs?: readonly Bang[];
  customSearxUrl?: string;
};

/**
 * Apply custom bangs / Searx host on top of a base map.
 * Returns the same Map instance when overlays are empty (zero clone).
 */
export function withPrefsOverlays(
  base: ReadonlyMap<string, Bang>,
  prefs: HotOverlayPrefs,
): Map<string, Bang> {
  const customs = prefs.customBangs;
  const host = prefs.customSearxUrl?.trim() ?? "";
  const hasCustoms = Boolean(customs && customs.length > 0);

  let needsSearx = false;
  if (host) {
    const template = searxSearchTemplate(host);
    const cur = base.get("searxng") ?? base.get("searx");
    needsSearx = !cur || cur.u !== template;
  }

  if (!hasCustoms && !needsSearx) {
    return base instanceof Map ? base : new Map(base);
  }

  const map = ensureEssentialBangs(new Map(base));
  if (customs) {
    for (const bang of customs) map.set(bang.t, bang);
  }
  if (needsSearx && host) {
    const u = searxSearchTemplate(host);
    for (const t of ["searx", "searxng"] as const) {
      map.set(t, { t, d: host, u, s: "SearxNG" });
    }
  }
  return map;
}

/**
 * True when `query` can be resolved correctly from `map` alone
 * (no need to await the full catalog for a rare bang).
 */
export function canResolveWithMap(
  query: string,
  map: ReadonlyMap<string, Bang>,
  bangPrefix = "!",
): boolean {
  const hint = extractBangTrigger(query, bangPrefix);
  if (!hint) return true;
  if (map.has(hint)) return true;
  if (longestTriggerPrefix(hint, map as Map<string, Bang>)) return true;
  return false;
}
