/**
 * Vercel Edge: cold-start bang redirect before the SPA loads.
 * Hot bangs are inlined — no network fetch on the redirect hot path.
 */

import { inflateBangs } from "../shared/bang-compact";
import { cookieValue } from "../shared/cookie";
import { INLINE_HOT_MAP, withPrefsOverlays } from "../shared/hot-redirect";
import { normalizeBangPrefix } from "../shared/bang-prefix";
import { resolveBangRedirectUrl, type Bang } from "../src/redirect";

export const config = {
  runtime: "edge",
};

function parseCustomBangs(raw: string | null): Bang[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return inflateBangs(
      data.slice(0, 40).map((item) => {
        if (!item || typeof item !== "object") return { t: "", u: "" };
        return {
          t: String((item as Bang).t ?? ""),
          u: String((item as Bang).u ?? ""),
          d: String((item as Bang).d ?? ""),
        };
      }),
    );
  } catch {
    return [];
  }
}

async function serveSpa(request: Request): Promise<Response> {
  const index = new URL("/index.html", request.url);
  const res = await fetch(index.href, {
    headers: { Accept: "text/html" },
  });
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return serveSpa(request);

  const cookie = request.headers.get("cookie");
  const defaultBang = (cookieValue(cookie, "default-bang") ?? "brave").toLowerCase();
  const bangPrefix =
    normalizeBangPrefix(cookieValue(cookie, "bang-prefix") ?? "!") ?? "!";
  const searxHost = cookieValue(cookie, "searx-instance") ?? "";
  const custom = parseCustomBangs(cookieValue(cookie, "custom-bangs"));

  const map = withPrefsOverlays(INLINE_HOT_MAP, {
    customBangs: custom,
    customSearxUrl: searxHost,
  });

  const target = resolveBangRedirectUrl(q, map, defaultBang, { bangPrefix });
  if (!target) return serveSpa(request);

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
    },
  });
}
