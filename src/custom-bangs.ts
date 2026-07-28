import type { Bang } from "./redirect";
import { encodeBangQuery } from "./redirect";

export const CUSTOM_BANGS_KEY = "custom-bangs";

/** Accept browser-style `%s` as well as DuckDuckGo `{{{s}}}`. */
export function normalizeBangTemplate(url: string): string {
  return url.trim().replace(/%s/gi, "{{{s}}}");
}

/** Show templates with familiar `%s` in the UI. */
export function displayBangTemplate(url: string): string {
  return url.replace(/\{\{\{s\}\}\}/g, "%s");
}

/** Build a sample redirect URL for the live preview. */
export function previewBangRedirect(
  template: string,
  sampleQuery = "kočky",
): string | null {
  const normalized = normalizeBangTemplate(template);
  if (!normalized.includes("{{{s}}}")) return null;
  const lower = normalized.toLowerCase();
  if (
    !(
      lower.startsWith("http://") ||
      lower.startsWith("https://") ||
      normalized.startsWith("/")
    )
  ) {
    return null;
  }
  return normalized.replace(/\{\{\{s\}\}\}/g, encodeBangQuery(sampleQuery));
}

export function parseCustomBangs(raw: string | null): Bang[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: Bang[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const t = String((item as Bang).t ?? "")
        .trim()
        .replace(/^!/, "")
        .toLowerCase();
      const u = normalizeBangTemplate(String((item as Bang).u ?? ""));
      const d = String((item as Bang).d ?? "").trim();
      const s = String((item as Bang).s ?? "").trim();
      if (!t || !u) continue;
      if (validateBangInput({ t, u, d })) continue;
      out.push({ t, u, d, s: s || t });
    }
    return out;
  } catch {
    return [];
  }
}

/** Returns Czech error message, or null if valid. */
export function validateBangInput(b: {
  t: string;
  u: string;
  d: string;
}): string | null {
  const t = b.t.trim().replace(/^!/, "").toLowerCase();
  if (!t || /\s/.test(t)) return "Zadej zkratku bez mezer.";
  const u = normalizeBangTemplate(b.u);
  if (!u) return "Zadej URL se zástupcem %s.";
  const lower = u.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("vbscript:")
  ) {
    return "Tento typ URL není povolen.";
  }
  const okAbsolute = lower.startsWith("http://") || lower.startsWith("https://");
  const okRelative = u.startsWith("/");
  if (!okAbsolute && !okRelative) {
    return "URL musí začínat https://, http:// nebo /.";
  }
  if (!u.includes("{{{s}}}") && !b.d.trim()) {
    return "URL musí obsahovat %s (místo hledaného výrazu).";
  }
  return null;
}

export function applyCustomBangs(
  base: Map<string, Bang>,
  custom: Bang[],
): Map<string, Bang> {
  const map = new Map(base);
  for (const bang of custom) {
    map.set(bang.t, bang);
  }
  return map;
}

export function saveCustomBangs(custom: Bang[]): void {
  localStorage.setItem(CUSTOM_BANGS_KEY, JSON.stringify(custom));
}

export function loadCustomBangs(): Bang[] {
  try {
    return parseCustomBangs(localStorage.getItem(CUSTOM_BANGS_KEY));
  } catch {
    return [];
  }
}
