import { describe, expect, it } from "vitest";
import {
  bumpFrecency,
  formatBangSuggestions,
  parseFrecencyCookie,
  serializeFrecencyCookie,
  suggestBangTriggers,
} from "./bang-suggest";

describe("suggestBangTriggers", () => {
  const catalog = ["g", "gh", "gweb", "yt", "ya", "yandex"];

  it("returns [] without bang prefix", () => {
    expect(suggestBangTriggers("praha", catalog)).toEqual([]);
  });

  it("filters by prefix", () => {
    expect(suggestBangTriggers("!y", catalog)).toEqual(
      expect.arrayContaining(["ya", "yandex", "yt"]),
    );
  });

  it("ranks by frecency", () => {
    const got = suggestBangTriggers("!y", catalog, { yt: 50, ya: 1 }, 3);
    expect(got[0]).toBe("yt");
  });

  it("formats with bang marker", () => {
    expect(formatBangSuggestions(["yt", "ya"])).toEqual(["!yt", "!ya"]);
    expect(formatBangSuggestions(["yt"], "$")).toEqual(["$yt"]);
  });
});

describe("frecency cookie", () => {
  it("roundtrips", () => {
    const map = bumpFrecency(bumpFrecency({}, "g"), "yt", 3);
    const raw = serializeFrecencyCookie(map);
    expect(parseFrecencyCookie(`bang-frecency=${encodeURIComponent(raw)}`)).toEqual(
      map,
    );
  });
});
