import { describe, expect, it } from "vitest";
import {
  applyCustomBangs,
  displayBangTemplate,
  normalizeBangTemplate,
  parseCustomBangs,
  previewBangRedirect,
  validateBangInput,
} from "./custom-bangs";
import { buildBangMap, type Bang } from "./redirect";

describe("bang template helpers", () => {
  it("normalizes %s to {{{s}}}", () => {
    expect(normalizeBangTemplate("https://ex.com?q=%s")).toBe(
      "https://ex.com?q={{{s}}}",
    );
    expect(displayBangTemplate("https://ex.com?q={{{s}}}")).toBe(
      "https://ex.com?q=%s",
    );
  });

  it("previews a sample redirect", () => {
    expect(previewBangRedirect("https://ex.com?q=%s", "kočky")).toBe(
      "https://ex.com?q=ko%C4%8Dky",
    );
  });
});

describe("validateBangInput", () => {
  it("accepts https template with %s", () => {
    expect(
      validateBangInput({
        t: "hw",
        u: "https://example.com/search?q=%s",
        d: "example.com",
      }),
    ).toBeNull();
  });

  it("accepts https template with {{{s}}}", () => {
    expect(
      validateBangInput({
        t: "hw",
        u: "https://example.com/search?q={{{s}}}",
        d: "example.com",
      }),
    ).toBeNull();
  });

  it("rejects javascript:", () => {
    expect(
      validateBangInput({ t: "x", u: "javascript:alert(1)", d: "" }),
    ).toMatch(/povolen/);
  });
});

describe("parseCustomBangs", () => {
  it("returns [] for invalid JSON", () => {
    expect(parseCustomBangs("{nope")).toEqual([]);
  });

  it("parses valid entries and normalizes %s", () => {
    const raw = JSON.stringify([
      { t: "!HW", u: "https://example.com?q=%s", d: "example.com", s: "HW" },
    ]);
    expect(parseCustomBangs(raw)).toEqual([
      {
        t: "hw",
        u: "https://example.com?q={{{s}}}",
        d: "example.com",
        s: "HW",
      },
    ]);
  });
});

describe("applyCustomBangs", () => {
  it("overrides same trigger", () => {
    const base = buildBangMap([
      { t: "g", u: "https://google.com?q={{{s}}}", d: "google.com" },
    ]);
    const custom: Bang[] = [
      { t: "g", u: "https://example.com?q={{{s}}}", d: "example.com", s: "Ex" },
    ];
    expect(applyCustomBangs(base, custom).get("g")?.u).toContain("example.com");
  });
});
