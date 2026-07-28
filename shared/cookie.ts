/**
 * Fast cookie helpers — avoid allocating a RegExp per lookup on the redirect hot path.
 */

export function cookieValue(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) return null;
  const needle = `${name}=`;
  let start = 0;
  while (start < header.length) {
    const at = header.indexOf(needle, start);
    if (at === -1) return null;
    if (at !== 0 && header.charCodeAt(at - 1) !== 32 /* space */ && header.charCodeAt(at - 1) !== 59 /* ; */) {
      start = at + 1;
      continue;
    }
    const valueStart = at + needle.length;
    const valueEnd = header.indexOf(";", valueStart);
    const raw =
      valueEnd === -1 ? header.slice(valueStart) : header.slice(valueStart, valueEnd);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
