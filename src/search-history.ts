export type HistoryEntry = {
  q: string;
  at: number;
};

const KEY = "search-history";
const ENABLED_KEY = "history-enabled";
const MAX_ENTRIES = 30;

export function isHistoryEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHistoryEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  if (!enabled) clearHistory();
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: HistoryEntry[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const q = String((item as HistoryEntry).q ?? "").trim();
      const at = Number((item as HistoryEntry).at);
      if (!q || !Number.isFinite(at)) continue;
      out.push({ q, at });
    }
    return out.slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}

export function pushHistory(query: string): HistoryEntry[] {
  const q = query.trim();
  if (!q || !isHistoryEnabled()) return loadHistory();
  const next = [
    { q, at: Date.now() },
    ...loadHistory().filter((e) => e.q !== q),
  ].slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
