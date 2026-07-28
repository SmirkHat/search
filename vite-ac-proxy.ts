import type { Connect, Plugin } from "vite";
import { resolveBangSuggestions } from "./shared/ac-bang";
import {
  DEFAULT_SEARX_HOST,
  normalizeSearxHost,
  parseSearxHostFromCookie,
} from "./shared/searx";
import {
  fetchUpstreamSuggestions,
  parseProvider,
  providerForBang,
  SUGGEST_PROVIDERS,
  type SuggestProvider,
} from "./shared/suggest";

const COOKIE_RE = new RegExp(
  `(?:^|; )suggest-engine=(${SUGGEST_PROVIDERS.join("|")})(?:;|$)`,
);

function providerFromUrl(url: URL, cookieHeader: string): SuggestProvider {
  const fromQuery =
    parseProvider(url.searchParams.get("engine")) ??
    parseProvider(url.searchParams.get("src"));
  if (fromQuery) return fromQuery;

  const bang = url.searchParams.get("bang");
  if (bang) return providerForBang(bang);

  const match = cookieHeader.match(COOKIE_RE);
  if (match?.[1]) return match[1] as SuggestProvider;

  return "ddg";
}

function searxHostFromUrl(url: URL, cookieHeader: string): string {
  const fromQuery = url.searchParams.get("searx");
  if (fromQuery) return normalizeSearxHost(fromQuery);
  return parseSearxHostFromCookie(cookieHeader) ?? DEFAULT_SEARX_HOST;
}

/** Dev/preview middleware: GET /ac?q=… → upstream suggestions JSON */
export function autocompleteProxyPlugin(): Plugin {
  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url || (req.method && req.method !== "GET")) {
      next();
      return;
    }

    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/ac") {
      next();
      return;
    }

    const q = url.searchParams.get("q")?.trim() ?? "";
    if (!q) {
      res.statusCode = 200;
      res.setHeader(
        "Content-Type",
        "application/x-suggestions+json; charset=utf-8",
      );
      res.end(JSON.stringify(["", []]));
      return;
    }

    const cookie = req.headers.cookie ?? "";
    const host = req.headers.host ?? "localhost";
    const proto = (req.headers["x-forwarded-proto"] as string) || "http";
    const origin = `${proto}://${host}`;

    try {
      const bangSuggestions = await resolveBangSuggestions(
        q,
        origin,
        cookie,
        // In Vite middleware, bangs-hot is served from the same server.
        (input, init) => fetch(input, init),
      );
      if (bangSuggestions) {
        res.statusCode = 200;
        res.setHeader(
          "Content-Type",
          "application/x-suggestions+json; charset=utf-8",
        );
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=120");
        res.end(JSON.stringify([q, bangSuggestions]));
        return;
      }

      const bangPrefix = (() => {
        const match = cookie.match(/(?:^|; )bang-prefix=([^;]+)/);
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
      const provider = providerFromUrl(url, cookie);
      const suggestions = await fetchUpstreamSuggestions(
        provider,
        suggestionSeed,
        provider === "searx"
          ? { searxHost: searxHostFromUrl(url, cookie) }
          : {},
      );
      res.statusCode = 200;
      res.setHeader(
        "Content-Type",
        "application/x-suggestions+json; charset=utf-8",
      );
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=120");
      res.end(JSON.stringify([q, suggestions]));
    } catch {
      res.statusCode = 502;
      res.setHeader(
        "Content-Type",
        "application/x-suggestions+json; charset=utf-8",
      );
      res.end(JSON.stringify([q, []]));
    }
  };

  return {
    name: "smirkhat-autocomplete-proxy",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
