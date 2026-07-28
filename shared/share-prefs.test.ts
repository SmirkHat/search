import { describe, expect, it } from "vitest";
import {
  buildShareHash,
  decodeSharePayload,
  encodeSharePayload,
  extractShareFromHash,
  normalizeBangPrefix,
  sharePrefsEqual,
  summarizeSharePrefs,
} from "./share-prefs";

describe("share prefs", () => {
  it("roundtrips", () => {
    const encoded = encodeSharePayload({
      defaultBang: "ddg",
      customBangs: [
        { t: "smht", u: "https://smht.eu?q={{{s}}}", d: "smht.eu", s: "SmirkHat" },
      ],
      customSearxUrl: "search.rhscz.eu",
      bangPrefix: "$",
    });
    const decoded = decodeSharePayload(encoded);
    expect(decoded).toEqual({
      v: 1,
      defaultBang: "ddg",
      customBangs: [
        { t: "smht", u: "https://smht.eu?q={{{s}}}", d: "smht.eu", s: "SmirkHat" },
      ],
      customSearxUrl: "search.rhscz.eu",
      bangPrefix: "$",
    });
    expect(extractShareFromHash(buildShareHash(encoded))).toBe(encoded);
  });

  it("summarizes and compares", () => {
    const a = decodeSharePayload(
      encodeSharePayload({
        defaultBang: "g",
        customBangs: [{ t: "a", u: "https://a.test?q={{{s}}}", d: "a.test" }],
        customSearxUrl: "",
        bangPrefix: "!",
      }),
    )!;
    const b = decodeSharePayload(
      encodeSharePayload({
        defaultBang: "g",
        customBangs: [{ t: "a", u: "https://a.test?q={{{s}}}", d: "a.test" }],
        customSearxUrl: "",
        bangPrefix: "!",
      }),
    )!;
    const c = decodeSharePayload(
      encodeSharePayload({
        defaultBang: "ddg",
        customBangs: [],
        customSearxUrl: "",
        bangPrefix: "!",
      }),
    )!;
    expect(sharePrefsEqual(a, b)).toBe(true);
    expect(sharePrefsEqual(a, c)).toBe(false);
    expect(summarizeSharePrefs(a)).toContain("!g");
    expect(summarizeSharePrefs(a)).toContain("1 vlastní bang");
  });

  it("rejects @ and \\ prefixes", () => {
    expect(normalizeBangPrefix("@")).toBeNull();
    expect(normalizeBangPrefix("\\")).toBeNull();
    expect(normalizeBangPrefix("!")).toBe("!");
    expect(normalizeBangPrefix("$")).toBe("$");
  });
});
