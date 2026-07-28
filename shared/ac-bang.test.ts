import { describe, expect, it } from "vitest";
import { isBangSuggestQuery } from "./ac-bang";
import {
  formatBangSuggestions,
  frecencySetCookieHeader,
} from "./bang-suggest";

describe("isBangSuggestQuery", () => {
  it("detects bang-only prefix", () => {
    expect(isBangSuggestQuery("!y")).toBe(true);
    expect(isBangSuggestQuery("!yt")).toBe(true);
  });

  it("rejects query with search terms", () => {
    expect(isBangSuggestQuery("!yt cats")).toBe(false);
    expect(isBangSuggestQuery("praha")).toBe(false);
  });
});

describe("frecencySetCookieHeader", () => {
  it("includes cookie name and path", () => {
    const header = frecencySetCookieHeader({ yt: 3 });
    expect(header).toContain("bang-frecency=");
    expect(header).toContain("Path=/");
    expect(header).toContain("yt%3A3");
  });
});

describe("formatBangSuggestions", () => {
  it("prefixes triggers", () => {
    expect(formatBangSuggestions(["yt", "ya"])).toEqual(["!yt", "!ya"]);
  });
});
