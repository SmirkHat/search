import { describe, expect, it } from "vitest";
import { isAllowedBangPrefix, normalizeBangPrefix } from "./bang-prefix";

describe("bang prefix", () => {
  it("accepts allowed single-char markers", () => {
    expect(normalizeBangPrefix("!")).toBe("!");
    expect(normalizeBangPrefix("$")).toBe("$");
    expect(normalizeBangPrefix("/")).toBe("/");
    expect(isAllowedBangPrefix("#")).toBe(true);
  });

  it("rejects snap marker and invalid values", () => {
    expect(normalizeBangPrefix("@")).toBeNull();
    expect(normalizeBangPrefix("\\")).toBeNull();
    expect(normalizeBangPrefix("!!")).toBeNull();
    expect(normalizeBangPrefix("")).toBeNull();
    expect(isAllowedBangPrefix("@")).toBe(false);
  });
});
