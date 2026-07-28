/// <reference lib="webworker" />
/**
 * Service Worker: bang redirect via HTTP 302 before the document renders.
 * Hot bangs are inlined — redirect hot path avoids catalog fetch/IDB.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

import { inflateBangs } from "../shared/bang-compact";
import {
  bumpFrecency,
  frecencySetCookieHeader,
  parseFrecencyCookie,
} from "../shared/bang-suggest";
import { HOT_BANGS } from "../shared/bangs-hot.generated";
import { searxSearchTemplate } from "../shared/searx";
import {
  DEFAULT_PREFS,
  idbGetCatalog,
  idbGetPrefs,
  idbSetPrefs,
  type SearchPrefs,
} from "./bang-idb";
import { normalizeBangPrefix } from "../shared/share-prefs";
import {
  buildBangMap,
  ensureEssentialBangs,
  extractBangTrigger,
  extractSnapTriggers,
  matchBang,
  resolveBangRedirectUrl,
  type Bang,
} from "./redirect";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();
void self.skipWaiting();

const HOT_CACHE = "bangs-hot";
const FULL_CACHE = "bangs-full";
const INLINE_HOT = ensureEssentialBangs(
  buildBangMap(inflateBangs([...HOT_BANGS])),
);

registerRoute(
  ({ url }) => url.pathname === "/bangs-hot.json",
  new StaleWhileRevalidate({
    cacheName: HOT_CACHE,
    plugins: [
      new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

registerRoute(
  ({ url }) => url.pathname === "/bangs.json",
  new StaleWhileRevalidate({
    cacheName: FULL_CACHE,
    plugins: [
      new ExpirationPlugin({ maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 14 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

registerRoute(
  ({ url }) => url.pathname === "/ac",
  new NetworkFirst({
    cacheName: "suggest-ac",
    networkTimeoutSeconds: 2,
    plugins: [
      new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function prefsFromCookies(request: Request): SearchPrefs {
  const cookie = request.headers.get("cookie");
  let customBangs: Bang[] = [];
  const rawCustom = cookieValue(cookie, "custom-bangs");
  if (rawCustom) {
    try {
      const data = JSON.parse(rawCustom) as unknown;
      if (Array.isArray(data)) {
        customBangs = inflateBangs(
          data.slice(0, 40).map((item) => ({
            t: String((item as Bang)?.t ?? ""),
            u: String((item as Bang)?.u ?? ""),
            d: String((item as Bang)?.d ?? ""),
          })),
        );
      }
    } catch {
      customBangs = [];
    }
  }

  return {
    defaultBang: (cookieValue(cookie, "default-bang") ?? "g").toLowerCase(),
    bangPrefix:
      normalizeBangPrefix(cookieValue(cookie, "bang-prefix") ?? "!") ?? "!",
    customSearxUrl: cookieValue(cookie, "searx-instance") ?? "",
    customBangs,
    frecency: parseFrecencyCookie(cookie),
  };
}

function isBangArray(data: unknown): data is Bang[] {
  return Array.isArray(data);
}

async function bangsFromCache(
  cacheName: string,
  path: string,
): Promise<Bang[] | null> {
  try {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(path);
    const res =
      hit ??
      (await (async () => {
        for (const req of await cache.keys()) {
          if (new URL(req.url).pathname === path) {
            return cache.match(req);
          }
        }
        return undefined;
      })());
    if (!res) return null;
    const data: unknown = await res.clone().json();
    if (!isBangArray(data)) {
      // Compact {t,u} rows
      return inflateBangs(data as { t: string; u: string }[]);
    }
    return inflateBangs(data);
  } catch {
    return null;
  }
}

function applyPrefsOverlays(
  base: Map<string, Bang>,
  prefs: SearchPrefs,
): Map<string, Bang> {
  const map = ensureEssentialBangs(new Map(base));
  for (const bang of prefs.customBangs ?? []) map.set(bang.t, bang);
  const host = prefs.customSearxUrl?.trim();
  if (host) {
    for (const t of ["searx", "searxng"]) {
      map.set(t, {
        t,
        d: host,
        u: searxSearchTemplate(host),
        s: "SearxNG",
      });
    }
  }
  return map;
}

async function loadFullIfNeeded(
  query: string,
  bangPrefix: string,
  map: Map<string, Bang>,
  prefs: SearchPrefs,
): Promise<Map<string, Bang>> {
  const hint = extractBangTrigger(query, bangPrefix);
  if (!hint) return map;
  if (matchBang(query, map, bangPrefix)) return map;

  const full =
    (await bangsFromCache(FULL_CACHE, "/bangs.json")) ??
    (await idbGetCatalog("full"))?.bangs ??
    null;
  if (!full?.length) return map;
  return applyPrefsOverlays(buildBangMap(inflateBangs(full)), prefs);
}

function usageTrigger(
  query: string,
  defaultBang: string,
  bangPrefix: string,
  map: Map<string, Bang>,
): string {
  const snaps = extractSnapTriggers(query);
  if (snaps?.length) return snaps[0]!;
  return matchBang(query, map, bangPrefix)?.trigger ?? defaultBang;
}

async function tryBangRedirect(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/") return null;
  const q = url.searchParams.get("q")?.trim();
  if (!q) return null;

  // Cookies first (sync) — do not block redirect on IDB.
  const cookiePrefs = prefsFromCookies(request);
  let map = applyPrefsOverlays(INLINE_HOT, cookiePrefs);
  map = await loadFullIfNeeded(q, cookiePrefs.bangPrefix || "!", map, cookiePrefs);

  const target = resolveBangRedirectUrl(
    q,
    map,
    cookiePrefs.defaultBang || "g",
    { bangPrefix: cookiePrefs.bangPrefix || "!" },
  );
  if (!target) return null;

  const trigger = usageTrigger(
    q,
    cookiePrefs.defaultBang || "g",
    cookiePrefs.bangPrefix || "!",
    map,
  );
  const nextFrecency = bumpFrecency(cookiePrefs.frecency, trigger);

  void (async () => {
    try {
      const prefs = await idbGetPrefs().catch(() => ({
        ...DEFAULT_PREFS,
        ...cookiePrefs,
      }));
      await idbSetPrefs({
        ...prefs,
        ...cookiePrefs,
        frecency: bumpFrecency(
          { ...prefs.frecency, ...cookiePrefs.frecency },
          trigger,
        ),
        customBangs: cookiePrefs.customBangs.length
          ? cookiePrefs.customBangs
          : prefs.customBangs,
      });
    } catch {
      // ignore
    }
  })();

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Set-Cookie": frecencySetCookieHeader(nextFrecency),
      "Cache-Control": "no-store",
    },
  });
}

const navigationHandler = async (params: {
  event: ExtendableEvent;
  request: Request;
}): Promise<Response> => {
  const redirected = await tryBangRedirect(params.request);
  if (redirected) return redirected;

  try {
    return await fetch(params.request);
  } catch {
    const cached = await caches.match(params.request);
    if (cached) return cached;
    const fallback = await caches.match("/");
    if (fallback) return fallback;
    return Response.error();
  }
};

registerRoute(
  new NavigationRoute(navigationHandler, {
    allowlist: [/^\/$/],
  }),
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
