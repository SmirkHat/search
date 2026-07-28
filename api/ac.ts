/**
 * Proxies search autocomplete → OpenSearch suggestions JSON.
 * GET /ac?q=%s&engine=<provider>&searx=<host>
 * Cookie `suggest-engine` / `searx-instance` used when omitted (browser omnibox).
 * Bang-aware: `?q=!y` → bang triggers from hot catalog + frecency cookie.
 */

import { resolveBangSuggestions } from "../shared/ac-bang";
import {
  DEFAULT_SEARX_HOST,
  normalizeSearxHost,
  parseSearxHostFromCookie,
} from "../shared/searx";
import {
  fetchUpstreamSuggestions,
  parseProvider,
  providerForBang,
  SUGGEST_PROVIDERS,
  type SuggestProvider,
} from "../shared/suggest";

export const config = {
  runtime: "edge",
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const COOKIE_RE = new RegExp(
  `(?:^|; )suggest-engine=(${SUGGEST_PROVIDERS.join("|")})(?:;|$)`,
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/x-suggestions+json; charset=utf-8",
      "Cache-Control": "public, max-age=120",
      ...corsHeaders,
    },
  });
}

function providerFromRequest(request: Request, url: URL): SuggestProvider {
  const fromQuery =
    parseProvider(url.searchParams.get("engine")) ??
    parseProvider(url.searchParams.get("src"));
  if (fromQuery) return fromQuery;

  const bang = url.searchParams.get("bang");
  if (bang) return providerForBang(bang);

  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(COOKIE_RE);
  if (match?.[1]) return match[1] as SuggestProvider;

  return "ddg";
}

function searxHostFromRequest(request: Request, url: URL): string {
  const fromQuery = url.searchParams.get("searx");
  if (fromQuery) return normalizeSearxHost(fromQuery);
  return (
    parseSearxHostFromCookie(request.headers.get("cookie")) ??
    DEFAULT_SEARX_HOST
  );
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return jsonResponse(["", []], 405);
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return jsonResponse(["", []]);
  }

  const cookie = request.headers.get("cookie");
  const bangSuggestions = await resolveBangSuggestions(q, url.origin, cookie);
  if (bangSuggestions) {
    return jsonResponse([q, bangSuggestions]);
  }

  const bangPrefix = (() => {
    const match = cookie?.match(/(?:^|; )bang-prefix=([^;]+)/);
    if (!match?.[1]) return "!";
    try {
      return decodeURIComponent(match[1]).slice(0, 1) || "!";
    } catch {
      return "!";
    }
  })();
  const prefixRe = new RegExp(
    `^${bangPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S+\\s*`,
    "i",
  );
  const suggestionSeed = q.replace(prefixRe, "").trim() || q;
  const provider = providerFromRequest(request, url);

  try {
    const suggestions = await fetchUpstreamSuggestions(
      provider,
      suggestionSeed,
      provider === "searx"
        ? { searxHost: searxHostFromRequest(request, url) }
        : {},
    );
    return jsonResponse([q, suggestions]);
  } catch {
    return jsonResponse([q, []], 502);
  }
}
