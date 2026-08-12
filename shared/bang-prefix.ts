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
