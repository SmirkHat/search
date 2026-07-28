import { describe, expect, it } from "vitest";
import { inflateBangs } from "../shared/bang-compact";
import { HOT_BANGS } from "../shared/bangs-hot.generated";
import { searxSearchTemplate } from "../shared/searx";
import {
  buildBangMap,
  ensureEssentialBangs,
  matchBang,
  resolveBangRedirectUrl,
} from "./redirect";

describe("!g with searx as default", () => {
  const map = ensureEssentialBangs(
    buildBangMap(inflateBangs([...HOT_BANGS])),
  );
  for (const t of ["searx", "searxng"] as const) {
    map.set(t, {
      t,
      d: "search.rhscz.eu",
      u: searxSearchTemplate("search.rhscz.eu"),
      s: "SearxNG",
    });
  }

  it("matches bang g", () => {
    expect(matchBang("!g", map)?.trigger).toBe("g");
    expect(matchBang("!g hello", map)?.trigger).toBe("g");
    expect(matchBang("hello !g", map)?.trigger).toBe("g");
  });

  it("redirects !g to Google, not Searx", () => {
    expect(resolveBangRedirectUrl("!g", map, "searx")).toBe(
      "https://www.google.com",
    );
    expect(resolveBangRedirectUrl("!g kočky", map, "searx")).toBe(
      "https://www.google.com/search?q=ko%C4%8Dky",
    );
    expect(resolveBangRedirectUrl("kočky !g", map, "searx")).toBe(
      "https://www.google.com/search?q=ko%C4%8Dky",
    );
  });

  it("plain query still uses searx default", () => {
    expect(resolveBangRedirectUrl("kočky", map, "searx")).toBe(
      "https://search.rhscz.eu/search?q=ko%C4%8Dky",
    );
  });

  it("restores !g when catalog lost the g bang", () => {
    const broken = new Map(map);
    broken.delete("g");
    const fixed = ensureEssentialBangs(broken);
    expect(resolveBangRedirectUrl("!g hello", fixed, "searx")).toBe(
      "https://www.google.com/search?q=hello",
    );
  });
});
