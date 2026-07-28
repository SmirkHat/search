import type { Bang } from "../src/redirect";

/**
 * Compact on-disk / generated bang rows store only trigger + URL template.
 * Domain is derived at inflate time for snaps / bare-bang homepages.
 */

export type CompactBang = {
  t: string;
  u: string;
  d?: string;
};

const DDG_ORIGIN = "https://duckduckgo.com";

export function domainFromBangUrl(url: string): string {
  try {
    let absolute = url.trim();
    if (absolute.startsWith("//")) absolute = `https:${absolute}`;
    else if (absolute.startsWith("/")) absolute = `${DDG_ORIGIN}${absolute}`;
    if (!(absolute.startsWith("http://") || absolute.startsWith("https://"))) {
      return "";
    }
    const probe = absolute.replace(/\{\{\{s\}\}\}/gi, "x");
    return new URL(probe).hostname;
  } catch {
    return "";
  }
}

export function inflateBang(row: CompactBang): Bang {
  const t = String(row.t ?? "")
    .trim()
    .toLowerCase();
  const u = String(row.u ?? "").trim();
  const d = (row.d ?? "").trim() || domainFromBangUrl(u);
  return { t, u, d };
}

export function inflateBangs(rows: CompactBang[]): Bang[] {
  const out: Bang[] = [];
  for (const row of rows) {
    const bang = inflateBang(row);
    if (bang.t && bang.u) out.push(bang);
  }
  return out;
}

/** Compact for storage: drop redundant domain. */
export function compactBang(bang: Pick<Bang, "t" | "u" | "d">): CompactBang {
  return { t: bang.t, u: bang.u };
}
