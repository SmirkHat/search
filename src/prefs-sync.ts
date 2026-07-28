import {
  bumpFrecency,
  FRECENCY_COOKIE,
  parseFrecencyCookie,
  serializeFrecencyCookie,
  type FrecencyMap,
} from "../shared/bang-suggest";
import { normalizeBangPrefix } from "../shared/share-prefs";
import { loadCustomBangs } from "./custom-bangs";
import { idbGetPrefs, idbSetPrefs, type SearchPrefs } from "./bang-idb";
import {
  getBangPrefix,
  getDefaultBangTrigger,
  setBangPrefix,
} from "./redirect";
import { getSearxInstanceHost } from "./searx-instances";

export { FRECENCY_COOKIE };
export const CUSTOM_TRIGGERS_COOKIE = "custom-bang-triggers";
export const DEFAULT_BANG_COOKIE = "default-bang";
export const BANG_PREFIX_COOKIE = "bang-prefix";
export const CUSTOM_BANGS_COOKIE = "custom-bangs";

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function readFrecencyFromDocument(): FrecencyMap {
  if (typeof document === "undefined") return {};
  return parseFrecencyCookie(document.cookie, FRECENCY_COOKIE);
}

export function writeFrecencyCookie(frecency: FrecencyMap): void {
  setCookie(FRECENCY_COOKIE, serializeFrecencyCookie(frecency));
}

/** Compact cookie so `/ac` can suggest custom bangs without IDB. */
export function writeCustomTriggersCookie(triggers: string[]): void {
  setCookie(
    CUSTOM_TRIGGERS_COOKIE,
    triggers
      .map((t) => t.toLowerCase())
      .filter(Boolean)
      .slice(0, 40)
      .join(","),
  );
}

/** Full custom bangs for Edge `/api/go` (size-capped). */
export function writeCustomBangsCookie(
  bangs: { t: string; u: string; d: string; s?: string }[],
): void {
  const slim = bangs.slice(0, 40).map((b) => ({
    t: b.t,
    u: b.u,
    d: b.d,
  }));
  let json = JSON.stringify(slim);
  while (json.length > 3500 && slim.length > 0) {
    slim.pop();
    json = JSON.stringify(slim);
  }
  setCookie(CUSTOM_BANGS_COOKIE, json);
}

export function writeDefaultBangCookie(trigger: string): void {
  setCookie(DEFAULT_BANG_COOKIE, trigger.toLowerCase());
}

export function writeBangPrefixCookie(prefix: string): void {
  const normalized = normalizeBangPrefix(prefix) ?? "!";
  setCookie(BANG_PREFIX_COOKIE, normalized);
}

export async function syncPrefsToIdb(
  patch: Partial<SearchPrefs> = {},
): Promise<SearchPrefs> {
  const current = await idbGetPrefs();
  const bangPrefix =
    normalizeBangPrefix(
      patch.bangPrefix ?? getBangPrefix() ?? current.bangPrefix,
    ) ?? "!";
  if (patch.bangPrefix) setBangPrefix(bangPrefix);

  const next: SearchPrefs = {
    defaultBang:
      patch.defaultBang ?? getDefaultBangTrigger() ?? current.defaultBang,
    customBangs: patch.customBangs ?? loadCustomBangs(),
    customSearxUrl: patch.customSearxUrl ?? getSearxInstanceHost(),
    frecency: patch.frecency ?? {
      ...current.frecency,
      ...readFrecencyFromDocument(),
    },
    bangPrefix,
  };
  await idbSetPrefs(next);
  writeFrecencyCookie(next.frecency);
  writeCustomTriggersCookie(next.customBangs.map((b) => b.t));
  writeCustomBangsCookie(next.customBangs);
  writeDefaultBangCookie(next.defaultBang);
  writeBangPrefixCookie(next.bangPrefix);
  return next;
}

export async function recordBangUsage(trigger: string): Promise<void> {
  const t = trigger.toLowerCase();
  if (!t) return;
  const prefs = await idbGetPrefs();
  const frecency = bumpFrecency(
    { ...prefs.frecency, ...readFrecencyFromDocument() },
    t,
  );
  await syncPrefsToIdb({ frecency });
}
