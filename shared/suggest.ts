import { DEFAULT_SEARX_HOST, normalizeSearxHost } from "./searx";

export const SUGGEST_PROVIDERS = [
  "ddg",
  "google",
  "brave",
  "bing",
  "yahoo",
  "ecosia",
  "qwant",
  "startpage",
  "seznam",
  "searx",
  "yandex",
  "kagi",
  "swisscows",
  "tiago",
] as const;

export type SuggestProvider = (typeof SUGGEST_PROVIDERS)[number];

export const SUGGEST_PROVIDER_LABEL: Record<SuggestProvider, string> = {
  ddg: "DuckDuckGo",
  google: "Google",
  brave: "Brave",
  bing: "Bing",
  yahoo: "Yahoo",
  ecosia: "Ecosia",
  qwant: "Qwant",
  startpage: "Startpage",
  seznam: "Seznam",
  searx: "SearxNG",
  yandex: "Yandex",
  kagi: "Kagi",
  swisscows: "Swisscows",
  tiago: "Tiago",
};

/** Bang trigger → autocomplete provider */
export function providerForBang(trigger: string): SuggestProvider {
  switch (trigger.toLowerCase()) {
    case "g":
    case "gweb":
    case "google":
      return "google";
    case "ddg":
      return "ddg";
    case "brave":
      return "brave";
    case "b":
    case "bing":
      return "bing";
    case "y":
    case "yahoo":
      return "yahoo";
    case "ecosia":
      return "ecosia";
    case "qwant":
      return "qwant";
    case "sp":
    case "startpage":
      return "startpage";
    case "seznam":
    case "szn":
      return "seznam";
    case "searx":
    case "searxng":
      return "searx";
    case "yandex":
    case "yandexen":
      return "yandex";
    case "kagi":
      return "kagi";
    case "swisscows":
      return "swisscows";
    case "tiago":
      return "tiago";
    default:
      return "ddg";
  }
}

export function parseProvider(
  value: string | null | undefined,
): SuggestProvider | null {
  if (!value) return null;
  return (SUGGEST_PROVIDERS as readonly string[]).includes(value)
    ? (value as SuggestProvider)
    : null;
}

export function upstreamSuggestUrl(
  provider: SuggestProvider,
  query: string,
  options: { searxHost?: string } = {},
): string {
  const q = encodeURIComponent(query);
  switch (provider) {
    case "google":
      // firefox client + hl=cs → OpenSearch JSON; charset still varies by UA
      return `https://www.google.com/complete/search?client=firefox&hl=cs&q=${q}`;
    case "ddg":
      return `https://ac.duckduckgo.com/ac/?q=${q}&type=list`;
    case "brave":
      return `https://search.brave.com/api/suggest?q=${q}`;
    case "bing":
      return `https://www.bing.com/osjson.aspx?query=${q}`;
    case "yahoo":
      return `https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=fxjson&command=${q}`;
    case "ecosia":
      return `https://ac.ecosia.org/autocomplete?q=${q}&type=list`;
    case "qwant":
      return `https://api.qwant.com/api/suggest/?q=${q}&client=opensearch`;
    case "startpage":
      return `https://www.startpage.com/osuggestions?q=${q}`;
    case "seznam":
      return `https://suggest.seznam.cz/fulltext/cs?phrase=${q}&cursorPosition=${query.length}&format=json-2&highlight=1&count=8`;
    case "searx": {
      const host = normalizeSearxHost(options.searxHost);
      return `https://${host}/autocompleter?q=${q}`;
    }
    case "yandex":
      // yandex.com suggest (uil=cs → EN/CS-friendly, not RU-only)
      return `https://suggest.yandex.com/suggest-ff.cgi?part=${q}&uil=cs`;
    case "kagi":
      return `https://kagi.com/api/autosuggest?q=${q}`;
    case "swisscows":
      return `https://api.swisscows.com/suggest?Query=${q}`;
    case "tiago":
      return `https://search.tiago.zip/suggest?q=${q}`;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** Parse charset from Content-Type (Google often sends ISO-8859-1/2). */
export function charsetFromContentType(
  contentType: string | null,
): string {
  const match = /charset=([^;]+)/i.exec(contentType ?? "");
  const raw = (match?.[1] ?? "utf-8").trim().replace(/["']/g, "").toLowerCase();
  // TextDecoder labels
  if (raw === "utf8") return "utf-8";
  if (raw === "latin1" || raw === "latin-1" || raw === "iso-8859-1") {
    return "iso-8859-1";
  }
  return raw;
}

export function decodeSuggestBody(
  buffer: ArrayBuffer,
  contentType: string | null,
): string {
  const charset = charsetFromContentType(contentType);
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

/** OpenSearch-style: ["query", ["s1", "s2", ...]] */
export function parseOpenSearchSuggestions(data: unknown): string[] {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return data[1].filter((item): item is string => typeof item === "string");
}

function parseSeznamSuggestions(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const result = (data as { result?: unknown }).result;
  if (!Array.isArray(result)) return [];

  return result
    .filter(
      (item): item is { itemType?: string; text?: { text?: string }[] } =>
        !!item &&
        typeof item === "object" &&
        (item as { itemType?: string }).itemType === "ItemType.TEXT",
    )
    .map((item) =>
      Array.isArray(item.text)
        ? item.text.map((part) => part?.text ?? "").join("")
        : "",
    )
    .map((text) => text.trim())
    .filter(Boolean);
}

function parseSearxSuggestions(data: unknown): string[] {
  // Some instances return OpenSearch ["q", ["s1", …]], others a flat string[].
  const openSearch = parseOpenSearchSuggestions(data);
  if (openSearch.length) return openSearch;
  return parseFlatStringSuggestions(data);
}

/** Flat list: ["s1", "s2", …] (Swisscows, some Searx instances). */
function parseFlatStringSuggestions(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is string => typeof item === "string");
}

function parseTiagoSuggestions(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const suggestions = (data as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .filter(
      (item): item is { query: string } =>
        !!item && typeof item === "object" && typeof (item as { query?: string }).query === "string",
    )
    .map((item) => item.query)
    .filter(Boolean);
}

export function parseSuggestions(
  provider: SuggestProvider,
  data: unknown,
): string[] {
  if (provider === "seznam") return parseSeznamSuggestions(data);
  if (provider === "searx") return parseSearxSuggestions(data);
  if (provider === "swisscows") return parseFlatStringSuggestions(data);
  if (provider === "tiago") return parseTiagoSuggestions(data);
  return parseOpenSearchSuggestions(data);
}

export async function fetchUpstreamSuggestions(
  provider: SuggestProvider,
  query: string,
  options: { searxHost?: string } = {},
): Promise<string[]> {
  const primary = await fetchSuggestionsOnce(provider, query, options);
  if (primary.length) return primary;

  // SearxNG only: custom/broken instance → best curated host, then DDG
  if (provider === "searx") {
    const bestSearx = DEFAULT_SEARX_HOST;
    if (normalizeSearxHost(options.searxHost) !== bestSearx) {
      const fromSearx = await fetchSuggestionsOnce("searx", query, {
        searxHost: bestSearx,
      });
      if (fromSearx.length) return fromSearx;
    }
  }

  if (provider !== "ddg") {
    return fetchSuggestionsOnce("ddg", query);
  }
  return [];
}

async function fetchSuggestionsOnce(
  provider: SuggestProvider,
  query: string,
  options: { searxHost?: string } = {},
): Promise<string[]> {
  try {
    const upstream = await fetch(upstreamSuggestUrl(provider, query, options), {
      headers: {
        Accept: "application/json, text/javascript, */*",
        "Accept-Language": "cs,en;q=0.8",
        // Browser-like UA → Google prefers UTF-8; still decode via Content-Type.
        "User-Agent":
          "Mozilla/5.0 (compatible; SmirkHatSearchAutocomplete/1.0)",
      },
    });
    if (!upstream.ok) return [];
    const text = decodeSuggestBody(
      await upstream.arrayBuffer(),
      upstream.headers.get("content-type"),
    );
    const data = JSON.parse(text) as unknown;
    return parseSuggestions(provider, data);
  } catch {
    return [];
  }
}
