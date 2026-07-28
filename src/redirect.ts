import { domainFromBangUrl } from "../shared/bang-compact";

export type Bang = {
  t: string;
  u: string;
  d: string;
  s?: string;
};

export type ResolveOptions = {
  /** Bang marker, default `!` */
  bangPrefix?: string;
  /** Snap marker, default `@` */
  snapPrefix?: string;
};

export type BangMatch = {
  trigger: string;
  cleanQuery: string;
  kind: "prefix" | "suffix" | "mid" | "nospace";
};

const DDG_ORIGIN = "https://duckduckgo.com";
const DEFAULT_BANG_PREFIX = "!";
const DEFAULT_SNAP_PREFIX = "@";

export function encodeBangQuery(cleanQuery: string): string {
  return encodeURIComponent(cleanQuery).replace(/%2F/g, "/");
}

export function buildBangMap(bangs: Bang[]): Map<string, Bang> {
  return new Map(bangs.map((b) => [b.t, b]));
}

/** Always-available engine bangs — fills gaps in stale/incomplete catalogs (IDB). */
export const ESSENTIAL_BANGS: readonly Bang[] = [
  {
    t: "g",
    d: "www.google.com",
    u: "https://www.google.com/search?q={{{s}}}",
  },
  {
    t: "google",
    d: "www.google.com",
    u: "https://www.google.com/search?q={{{s}}}",
  },
  {
    t: "ddg",
    d: "duckduckgo.com",
    u: "https://duckduckgo.com/?q={{{s}}}",
  },
  {
    t: "b",
    d: "www.bing.com",
    u: "https://www.bing.com/search?q={{{s}}}",
  },
  {
    t: "searx",
    d: "search.rhscz.eu",
    u: "https://search.rhscz.eu/search?q={{{s}}}",
  },
  {
    t: "searxng",
    d: "search.rhscz.eu",
    u: "https://search.rhscz.eu/search?q={{{s}}}",
  },
];

/** Ensure core triggers exist so `!g` never silently falls through to default. */
export function ensureEssentialBangs(map: Map<string, Bang>): Map<string, Bang> {
  const out = new Map(map);
  for (const bang of ESSENTIAL_BANGS) {
    if (!out.has(bang.t)) out.set(bang.t, bang);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bangDomain(bang: Bang): string {
  if (bang.d?.trim()) return bang.d.trim();
  // DDG-relative templates (`/bang?q=…`) have no meaningful homepage without `d`
  const u = bang.u.trim();
  if (u.startsWith("/") || u.startsWith("//")) return "";
  return domainFromBangUrl(u);
}

/** Longest trigger in `bangMap` that is a prefix of `token` (case-insensitive). */
export function longestTriggerPrefix(
  token: string,
  bangMap: Map<string, Bang>,
): string | null {
  const lower = token.toLowerCase();
  let best: string | null = null;
  let acc = "";
  for (const ch of lower) {
    if (ch === " " || ch === "\t") break;
    acc += ch;
    if (bangMap.has(acc)) best = acc;
  }
  return best;
}

/**
 * Greedy token for catalog loading (no map). Prefer space-delimited bang token.
 * Prefer prefix over suffix over mid.
 */
export function extractBangTrigger(
  query: string,
  bangPrefix = DEFAULT_BANG_PREFIX,
): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const marker = escapeRegExp(bangPrefix);
  const prefix = trimmed.match(new RegExp(`^${marker}(\\S+)`, "i"));
  if (prefix?.[1]) return prefix[1].toLowerCase();
  const suffix = trimmed.match(new RegExp(`(?:^|\\s)${marker}(\\S+)$`, "i"));
  if (suffix?.[1]) return suffix[1].toLowerCase();
  const nospaceSuffix = trimmed.match(
    new RegExp(`(\\S+)${marker}(\\S+)$`, "i"),
  );
  if (nospaceSuffix?.[2]) return nospaceSuffix[2].toLowerCase();
  const mid = trimmed.match(new RegExp(`(?:^|\\s)${marker}(\\S+)(?:\\s|$)`, "i"));
  return mid?.[1]?.toLowerCase() ?? null;
}

/**
 * Resolve bang trigger against a catalog (longest-prefix for no-space forms).
 * Priority: leading bang → trailing bang → mid-query bang.
 */
export function matchBang(
  query: string,
  bangMap: Map<string, Bang>,
  bangPrefix = DEFAULT_BANG_PREFIX,
): BangMatch | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const marker = escapeRegExp(bangPrefix);

  if (trimmed.startsWith(bangPrefix)) {
    const rest = trimmed.slice(bangPrefix.length);
    const parts = rest.match(/^(\S+)(\s*)([\s\S]*)$/);
    if (!parts) return null;
    const token = parts[1]!;
    const gap = parts[2] ?? "";
    const after = parts[3] ?? "";
    const lower = token.toLowerCase();
    if (bangMap.has(lower)) {
      return {
        trigger: lower,
        cleanQuery: after.trim(),
        kind: "prefix",
      };
    }
    const trigger = longestTriggerPrefix(token, bangMap);
    if (!trigger) return null;
    const remainder = token.slice(trigger.length);
    return {
      trigger,
      cleanQuery: `${remainder}${gap}${after}`.trim(),
      kind: "nospace",
    };
  }

  // Trailing ` !bang`
  const spacedSuffix = trimmed.match(
    new RegExp(`^(.*)\\s+${marker}(\\S+)$`, "i"),
  );
  if (spacedSuffix) {
    const raw = spacedSuffix[2]!.toLowerCase();
    const before = spacedSuffix[1]!.trim();
    if (bangMap.has(raw)) {
      return { trigger: raw, cleanQuery: before, kind: "suffix" };
    }
    const trigger = longestTriggerPrefix(raw, bangMap);
    if (trigger) {
      const extra = raw.slice(trigger.length);
      return {
        trigger,
        cleanQuery: `${before} ${extra}`.trim(),
        kind: "suffix",
      };
    }
  }

  // Trailing `query!bang` (no space)
  const glued = trimmed.match(new RegExp(`^(.+)${marker}(\\S+)$`, "i"));
  if (glued && glued[1] && !glued[1].endsWith(" ") && !glued[1].includes(` ${bangPrefix}`)) {
    // Avoid re-matching spaced forms; require no whitespace immediately before marker
    const beforeRaw = glued[1]!;
    if (!beforeRaw.endsWith(bangPrefix) && !/\s$/.test(beforeRaw)) {
      const raw = glued[2]!;
      const trigger = bangMap.has(raw.toLowerCase())
        ? raw.toLowerCase()
        : longestTriggerPrefix(raw, bangMap);
      if (trigger) {
        const extra = raw.slice(trigger.length);
        return {
          trigger,
          cleanQuery: `${beforeRaw}${extra}`.trim(),
          kind: "nospace",
        };
      }
    }
  }

  // Mid-query: first ` !bang ` whose trigger exists in map
  const midRe = new RegExp(`(\\s)${marker}(\\S+)(?=\\s|$)`, "ig");
  let midMatch: RegExpExecArray | null;
  while ((midMatch = midRe.exec(trimmed))) {
    const raw = midMatch[2]!;
    const lower = raw.toLowerCase();
    const trigger = bangMap.has(lower)
      ? lower
      : longestTriggerPrefix(raw, bangMap);
    if (!trigger) continue;
    const tokenStart = midMatch.index + 1; // skip the leading space
    const tokenEnd = tokenStart + bangPrefix.length + trigger.length;
    const before = trimmed.slice(0, tokenStart).trim();
    const after = trimmed.slice(tokenEnd).trim();
    return {
      trigger,
      cleanQuery: `${before} ${after}`.trim(),
      kind: "mid",
    };
  }

  return null;
}

/** `@w`, `@gh,so` — prefix or suffix. */
export function extractSnapTriggers(
  query: string,
  snapPrefix = DEFAULT_SNAP_PREFIX,
): string[] | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const marker = escapeRegExp(snapPrefix);
  const prefix = trimmed.match(new RegExp(`^${marker}([\\w.,-]+)\\s*`, "i"));
  const raw = prefix?.[1]
    ? prefix[1]
    : trimmed.match(new RegExp(`(?:^|\\s)${marker}([\\w.,-]+)$`, "i"))?.[1];
  if (!raw) return null;
  const triggers = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  return triggers.length ? triggers : null;
}

function stripSnapMarker(
  query: string,
  snapTriggers: string[] | null,
  snapPrefix: string,
): string {
  if (!snapTriggers?.length) return query.trim();
  const marker = escapeRegExp(snapPrefix);
  const joined = escapeRegExp(snapTriggers.join(","));
  return query
    .trim()
    .replace(new RegExp(`^${marker}${joined}\\s*`, "i"), "")
    .replace(new RegExp(`\\s*${marker}${joined}$`, "i"), "")
    .trim();
}

export function absolutizeBangUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${DDG_ORIGIN}${url}`;
  return url;
}

function applyBangTemplate(bang: Bang, cleanQuery: string): string | null {
  if (cleanQuery === "") {
    const domain = bangDomain(bang);
    if (!domain) return null;
    return `https://${domain}`;
  }
  if (!bang.u) return null;
  const searchUrl = bang.u.replace(
    /\{\{\{s\}\}\}/g,
    encodeBangQuery(cleanQuery),
  );
  if (!searchUrl) return null;
  return absolutizeBangUrl(searchUrl);
}

function snapSiteFilters(
  triggers: string[],
  bangMap: Map<string, Bang>,
): string[] {
  const filters: string[] = [];
  for (const t of triggers) {
    const bang = bangMap.get(t);
    if (!bang) continue;
    const domain = bangDomain(bang);
    if (domain) filters.push(`site:${domain}`);
  }
  return filters;
}

/**
 * Resolve a search query to a redirect URL.
 * Priority: snaps → bang (prefix/suffix/mid/nospace) → default.
 */
export function resolveBangRedirectUrl(
  query: string,
  bangMap: Map<string, Bang>,
  defaultBangTrigger: string,
  options: ResolveOptions = {},
): string | null {
  const bangPrefix = options.bangPrefix ?? DEFAULT_BANG_PREFIX;
  const snapPrefix = options.snapPrefix ?? DEFAULT_SNAP_PREFIX;
  const trimmed = query.trim();
  if (!trimmed) return null;

  const snapTriggers = extractSnapTriggers(trimmed, snapPrefix);
  if (snapTriggers) {
    const cleanQuery = stripSnapMarker(trimmed, snapTriggers, snapPrefix);
    const filters = snapSiteFilters(snapTriggers, bangMap);
    const defaultBang = bangMap.get(defaultBangTrigger);

    if (!cleanQuery) {
      const first = bangMap.get(snapTriggers[0]!);
      const domain = first ? bangDomain(first) : "";
      return domain ? `https://${domain}` : null;
    }

    if (!filters.length || !defaultBang?.u) {
      return applyBangTemplate(
        defaultBang ?? { t: "", u: "", d: "" },
        cleanQuery,
      );
    }

    const snapQuery = `${cleanQuery} ${filters.join(" ")}`;
    return applyBangTemplate(defaultBang, snapQuery);
  }

  const matched = matchBang(trimmed, bangMap, bangPrefix);
  if (matched) {
    const selected = bangMap.get(matched.trigger);
    if (selected) {
      return applyBangTemplate(selected, matched.cleanQuery);
    }
  }

  const defaultBang = bangMap.get(defaultBangTrigger);
  if (!defaultBang) return null;

  // Explicit bang syntax present but trigger missing from catalog:
  // never search the default engine for the raw "!g …" string (looks like
  // "bang opened my default Searx"). Strip the bang token instead.
  const dangling = extractBangTrigger(trimmed, bangPrefix);
  if (dangling && !bangMap.has(dangling)) {
    const cleaned = stripDanglingBang(trimmed, dangling, bangPrefix);
    return applyBangTemplate(defaultBang, cleaned);
  }

  return applyBangTemplate(defaultBang, trimmed);
}

/** Remove an unresolved `!trigger` (prefix / suffix / glued) from the query. */
function stripDanglingBang(
  query: string,
  trigger: string,
  bangPrefix: string,
): string {
  const marker = escapeRegExp(bangPrefix);
  const t = escapeRegExp(trigger);
  return query
    .trim()
    .replace(new RegExp(`^${marker}${t}\\s*`, "i"), "")
    .replace(new RegExp(`\\s*${marker}${t}$`, "i"), "")
    .replace(new RegExp(`^(.+)${marker}${t}$`, "i"), "$1")
    .trim();
}

export function getDefaultBangTrigger(): string {
  return localStorage.getItem("default-bang") ?? "g";
}

export function setDefaultBangTrigger(trigger: string): void {
  localStorage.setItem("default-bang", trigger);
}

const BANG_PREFIX_KEY = "bang-prefix";

export function getBangPrefix(): string {
  try {
    const raw = localStorage.getItem(BANG_PREFIX_KEY) ?? "!";
    return raw.length === 1 && raw !== "@" && raw !== "\\" ? raw : "!";
  } catch {
    return "!";
  }
}

export function setBangPrefix(prefix: string): void {
  localStorage.setItem(BANG_PREFIX_KEY, prefix);
}
