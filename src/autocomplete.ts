import {
  providerForBang,
  SUGGEST_PROVIDER_LABEL,
  type SuggestProvider,
} from "../shared/suggest";
import { getDefaultBangTrigger } from "./redirect";
import { getSearxInstanceHost } from "./searx-instances";

export type SuggestionsResponse = [string, string[]];
export { SUGGEST_PROVIDER_LABEL };

const AC_ENDPOINT = "/ac";
const SUGGEST_COOKIE = "suggest-engine";

export function suggestionSeed(query: string): string {
  return query.replace(/^!\S+\s*/i, "").trim();
}

export function bangPrefix(query: string): string {
  const match = query.match(/^(!\S+\s*)/i);
  return match?.[1] ?? "";
}

export function currentSuggestProvider(
  bangTrigger = getDefaultBangTrigger(),
): SuggestProvider {
  return providerForBang(bangTrigger);
}

/** Keep omnibox /ac cookie in sync with the selected default bang. */
export function syncSuggestEngineCookie(bangTrigger: string): void {
  const provider = providerForBang(bangTrigger);
  document.cookie = `${SUGGEST_COOKIE}=${provider}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export async function fetchSuggestions(
  query: string,
  signal?: AbortSignal,
  bangTrigger = getDefaultBangTrigger(),
): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed || !suggestionSeed(trimmed)) return [];

  const engine = providerForBang(bangTrigger);
  const params = new URLSearchParams({
    q: trimmed,
    engine,
  });
  if (engine === "searx") {
    params.set("searx", getSearxInstanceHost());
  }
  const res = await fetch(`${AC_ENDPOINT}?${params}`, {
    signal,
    headers: { Accept: "application/x-suggestions+json, application/json" },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as SuggestionsResponse;
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return data[1].filter((item): item is string => typeof item === "string");
}

export function applySuggestion(query: string, suggestion: string): string {
  return `${bangPrefix(query)}${suggestion}`;
}
