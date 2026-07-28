import { describe, expect, it } from "vitest";
import { cookieValue } from "./cookie";
import {
  canResolveWithMap,
  INLINE_HOT_MAP,
  withPrefsOverlays,
} from "./hot-redirect";

describe("cookieValue", () => {
  it("reads first and middle cookies", () => {
    expect(cookieValue("default-bang=g", "default-bang")).toBe("g");
    expect(
      cookieValue("a=1; default-bang=searx; b=2", "default-bang"),
    ).toBe("searx");
  });

  it("decodes URI components", () => {
    expect(cookieValue("x=%21", "x")).toBe("!");
  });

  it("avoids substring false positives", () => {
    expect(cookieValue("xdefault-bang=g", "default-bang")).toBeNull();
    expect(cookieValue("foo=default-bang=g", "default-bang")).toBeNull();
  });
});

describe("withPrefsOverlays", () => {
  it("returns the same Map when overlays are empty", () => {
    const base = new Map(INLINE_HOT_MAP);
    expect(withPrefsOverlays(base, {})).toBe(base);
    expect(withPrefsOverlays(INLINE_HOT_MAP, { customBangs: [] })).toBe(
      INLINE_HOT_MAP,
    );
  });

  it("clones when custom bangs are present", () => {
    const custom = [
      {
        t: "mycustom",
        u: "https://example.com/?q={{{s}}}",
        d: "example.com",
      },
    ];
    const next = withPrefsOverlays(INLINE_HOT_MAP, { customBangs: custom });
    expect(next).not.toBe(INLINE_HOT_MAP);
    expect(next.get("mycustom")?.d).toBe("example.com");
    expect(INLINE_HOT_MAP.has("mycustom")).toBe(false);
  });
});

describe("canResolveWithMap", () => {
  it("allows default searches and hot bangs", () => {
    expect(canResolveWithMap("kočky", INLINE_HOT_MAP)).toBe(true);
    expect(canResolveWithMap("!g cats", INLINE_HOT_MAP)).toBe(true);
    expect(canResolveWithMap("cats !g", INLINE_HOT_MAP)).toBe(true);
  });

  it("rejects rare bangs missing from hot", () => {
    expect(canResolveWithMap("!zzznomatchxyz hello", INLINE_HOT_MAP)).toBe(
      false,
    );
  });
});
