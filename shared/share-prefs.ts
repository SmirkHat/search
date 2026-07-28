/**
 * Compact shareable prefs payload (base64url JSON in URL hash `#share=…`).
 * Own MIT implementation — ideas only from bangs.fast / unduckified.
 */

export type ShareBang = {
  t: string;
  u: string;
  d: string;
  s?: string;
};

export type ShareablePrefs = {
  v: 1;
  defaultBang: string;
  customBangs: ShareBang[];
  customSearxUrl: string;
  bangPrefix: string;
};

const MAX_PAYLOAD_CHARS = 24_000;

export function encodeSharePayload(prefs: Omit<ShareablePrefs, "v">): string {
  const body: ShareablePrefs = {
    v: 1,
    defaultBang: prefs.defaultBang.trim().toLowerCase() || "g",
    customBangs: prefs.customBangs.slice(0, 80).map((b) => ({
      t: b.t,
      u: b.u,
      d: b.d,
      ...(b.s ? { s: b.s } : {}),
    })),
    customSearxUrl: prefs.customSearxUrl.trim(),
    bangPrefix: prefs.bangPrefix || "!",
  };
  const json = JSON.stringify(body);
  if (json.length > MAX_PAYLOAD_CHARS) {
    throw new Error("Nastavení je moc velké na sdílení.");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSharePayload(raw: string): ShareablePrefs | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (padded.length % 4)) % 4;
    const base64 = padded + "=".repeat(pad);
    const binary = atob(base64);
    if (binary.length > MAX_PAYLOAD_CHARS) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const data = JSON.parse(json) as Partial<ShareablePrefs>;
    if (data.v !== 1) return null;
    const defaultBang = String(data.defaultBang ?? "g")
      .trim()
      .toLowerCase();
    const bangPrefix = normalizeBangPrefix(String(data.bangPrefix ?? "!"));
    if (!bangPrefix) return null;
    const customBangs: ShareBang[] = [];
    if (Array.isArray(data.customBangs)) {
      for (const item of data.customBangs.slice(0, 80)) {
        if (!item || typeof item !== "object") continue;
        const t = String((item as ShareBang).t ?? "")
          .trim()
          .toLowerCase();
        const u = String((item as ShareBang).u ?? "").trim();
        const d = String((item as ShareBang).d ?? "").trim();
        const s = String((item as ShareBang).s ?? "").trim();
        if (!t || !u) continue;
        customBangs.push({ t, u, d, s: s || t });
      }
    }
    return {
      v: 1,
      defaultBang: defaultBang || "g",
      customBangs,
      customSearxUrl: String(data.customSearxUrl ?? "").trim(),
      bangPrefix,
    };
  } catch {
    return null;
  }
}

/** Extract payload from `#share=…` or `#share:…`. */
export function extractShareFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.startsWith("share=")) return raw.slice("share=".length);
  if (raw.startsWith("share:")) return raw.slice("share:".length);
  return null;
}

export function buildShareHash(payload: string): string {
  return `#share=${payload}`;
}

/** Compare two share payloads (order-insensitive for custom bangs). */
export function sharePrefsEqual(
  a: ShareablePrefs,
  b: ShareablePrefs,
): boolean {
  if (a.defaultBang !== b.defaultBang) return false;
  if (a.bangPrefix !== b.bangPrefix) return false;
  if (a.customSearxUrl !== b.customSearxUrl) return false;
  if (a.customBangs.length !== b.customBangs.length) return false;
  const key = (x: ShareBang) => `${x.t}\0${x.u}\0${x.d}\0${x.s ?? ""}`;
  const sa = [...a.customBangs].map(key).sort();
  const sb = [...b.customBangs].map(key).sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Short Czech summary for the import confirm UI. */
export function summarizeSharePrefs(prefs: ShareablePrefs): string {
  const bangs =
    prefs.customBangs.length === 0
      ? "bez vlastních bangů"
      : prefs.customBangs.length === 1
        ? "1 vlastní bang"
        : `${prefs.customBangs.length} vlastních bangů`;
  const searx = prefs.customSearxUrl
    ? ` · Searx ${prefs.customSearxUrl}`
    : "";
  return `Výchozí ${prefs.bangPrefix}${prefs.defaultBang} · ${bangs}${searx}`;
}

const ALLOWED_PREFIXES = new Set([
  "!",
  "$",
  "/",
  "#",
  "*",
  "~",
  ":",
  ";",
  ",",
  ".",
  "|",
  "+",
  "=",
  "?",
]);

/** Single-char bang marker; must not collide with snap `@`. */
export function normalizeBangPrefix(value: string): string | null {
  const t = value.trim();
  if (t.length !== 1) return null;
  if (t === "@" || t === "\\") return null;
  if (!ALLOWED_PREFIXES.has(t)) return null;
  return t;
}

export function isAllowedBangPrefix(value: string): boolean {
  return normalizeBangPrefix(value) !== null;
}
