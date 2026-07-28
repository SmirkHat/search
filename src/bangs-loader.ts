import { idbGetCatalog, idbSetCatalog, type CatalogKey } from "./bang-idb";
import { buildBangMap, ensureEssentialBangs, type Bang } from "./redirect";
import { inflateBangs, type CompactBang } from "../shared/bang-compact";

const HOT_URL = "/bangs-hot.json";
const FULL_URL = "/bangs.json";

let hotPromise: Promise<Map<string, Bang>> | null = null;
let fullPromise: Promise<Map<string, Bang>> | null = null;

function isCompactBangArray(data: unknown): data is CompactBang[] {
  return Array.isArray(data);
}

function parseCatalog(data: unknown): Bang[] {
  if (!isCompactBangArray(data)) {
    throw new Error("Invalid bang catalog");
  }
  return inflateBangs(data);
}

function toBangMap(bangs: Bang[]): Map<string, Bang> {
  return ensureEssentialBangs(buildBangMap(bangs));
}

async function fetchCatalog(
  key: CatalogKey,
  url: string,
  etag: string | null,
): Promise<{ bangs: Bang[]; etag: string | null } | null> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (etag) headers["If-None-Match"] = etag;

  const res = await fetch(url, { headers, credentials: "same-origin" });
  if (res.status === 304) return null;
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  const data: unknown = await res.json();
  const bangs = parseCatalog(data);
  const nextEtag = res.headers.get("ETag");
  await idbSetCatalog(key, bangs, nextEtag);
  return { bangs, etag: nextEtag };
}

/**
 * IndexedDB first (instant), then network revalidate into IDB + HTTP/SW cache.
 */
async function loadCatalog(
  key: CatalogKey,
  url: string,
): Promise<Map<string, Bang>> {
  const cached = await idbGetCatalog(key);

  const network = fetchCatalog(key, url, cached?.etag ?? null).catch(() => null);

  if (cached) {
    void network;
    return toBangMap(cached.bangs);
  }

  const fresh = await network;
  if (!fresh) {
    throw new Error(`Failed to load ${url}`);
  }
  return toBangMap(fresh.bangs);
}

/** Popular bangs (~top 500 by DDG rank) — small, loaded first. */
export function loadHotBangMap(): Promise<Map<string, Bang>> {
  hotPromise ??= loadCatalog("hot", HOT_URL);
  return hotPromise;
}

/** Full DDG catalog — loaded on miss / prefetched in background. */
export function loadFullBangMap(): Promise<Map<string, Bang>> {
  fullPromise ??= loadCatalog("full", FULL_URL);
  return fullPromise;
}

/** Kick off full catalog fetch without blocking (landing / after hot hit). */
export function prefetchFullBangMap(): void {
  void loadFullBangMap().catch(() => {
    fullPromise = null;
  });
}

/**
 * Hot map first; if `bangTrigger` is set and missing from hot (and extras),
 * load the full catalog. Full map replaces hot (it is a superset).
 *
 * For no-space bangs (`!ghunduck`) the greedy trigger may be longer than any
 * hot key — still try longest hot prefix before fetching full.
 */
export async function loadBangMapForTrigger(
  bangTrigger: string | null,
  extraTriggers: Iterable<string> = [],
): Promise<Map<string, Bang>> {
  const hot = await loadHotBangMap();
  const extras =
    extraTriggers instanceof Set ? extraTriggers : new Set(extraTriggers);
  if (!bangTrigger || hot.has(bangTrigger) || extras.has(bangTrigger)) {
    prefetchFullBangMap();
    return hot;
  }
  // No-space: greedy token longer than real trigger — accept if any hot prefix matches
  let acc = "";
  for (const ch of bangTrigger) {
    acc += ch;
    if (hot.has(acc) || extras.has(acc)) {
      prefetchFullBangMap();
      return hot;
    }
  }
  return loadFullBangMap();
}

/** @deprecated Prefer loadHotBangMap / loadBangMapForTrigger */
export async function loadBangMap(): Promise<Map<string, Bang>> {
  return loadFullBangMap();
}
