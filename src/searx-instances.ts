import {
  DEFAULT_SEARX_HOST,
  isValidSearxHost,
  normalizeSearxHost,
  parseSearxHostInput,
  SEARX_COOKIE,
  SEARX_INSTANCES,
  searxInstanceLabel,
  type SearxInstance,
} from "../shared/searx";

export {
  DEFAULT_SEARX_HOST,
  SEARX_COOKIE,
  SEARX_INSTANCES,
  searxInstanceLabel,
  type SearxInstance,
};

const STORAGE_KEY = "searx-instance";

export function getSearxInstanceHost(): string {
  try {
    return normalizeSearxHost(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SEARX_HOST;
  }
}

export function setSearxInstanceHost(host: string): boolean {
  const parsed = parseSearxHostInput(host);
  if (!parsed || !isValidSearxHost(parsed)) return false;
  localStorage.setItem(STORAGE_KEY, parsed);
  document.cookie = `${SEARX_COOKIE}=${encodeURIComponent(parsed)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  return true;
}

export function syncSearxInstanceCookie(host = getSearxInstanceHost()): void {
  const normalized = normalizeSearxHost(host);
  document.cookie = `${SEARX_COOKIE}=${encodeURIComponent(normalized)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
