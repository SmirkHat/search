import { describe, expect, it } from "vitest";
import {
  charsetFromContentType,
  decodeSuggestBody,
  parseOpenSearchSuggestions,
  parseSuggestions,
  providerForBang,
  upstreamSuggestUrl,
} from "./suggest";

describe("charsetFromContentType", () => {
  it("defaults to utf-8", () => {
    expect(charsetFromContentType(null)).toBe("utf-8");
    expect(charsetFromContentType("application/json")).toBe("utf-8");
  });

  it("reads google latin charsets", () => {
    expect(
      charsetFromContentType("text/javascript; charset=ISO-8859-2"),
    ).toBe("iso-8859-2");
    expect(
      charsetFromContentType('text/javascript; charset="ISO-8859-1"'),
    ).toBe("iso-8859-1");
  });
});

describe("decodeSuggestBody", () => {
  it("decodes ISO-8859-2 Czech diacritics from Google-style bytes", () => {
    // "míchá" in ISO-8859-2: m í(0xed) ch á(0xe1)
    const bytes = Uint8Array.from(
      Array.from('["q",["jak se míchá"]]', (ch) => {
        if (ch === "í") return 0xed;
        if (ch === "á") return 0xe1;
        return ch.charCodeAt(0);
      }),
    );
    const text = decodeSuggestBody(
      bytes.buffer,
      "text/javascript; charset=ISO-8859-2",
    );
    const data = JSON.parse(text) as unknown;
    expect(parseOpenSearchSuggestions(data)).toEqual(["jak se míchá"]);
  });
});

describe("swisscows suggest", () => {
  it("maps bang and builds Query URL", () => {
    expect(providerForBang("swisscows")).toBe("swisscows");
    expect(upstreamSuggestUrl("swisscows", "praha")).toBe(
      "https://api.swisscows.com/suggest?Query=praha",
    );
  });

  it("parses flat string array", () => {
    expect(
      parseSuggestions("swisscows", ["praha", "praha 4", "prahaar movie"]),
    ).toEqual(["praha", "praha 4", "prahaar movie"]);
  });
});

describe("suggest fallback chain", () => {
  it("uses DEFAULT_SEARX_HOST for searx URLs", async () => {
    const { DEFAULT_SEARX_HOST } = await import("./searx");
    expect(upstreamSuggestUrl("searx", "praha")).toBe(
      `https://${DEFAULT_SEARX_HOST}/autocompleter?q=praha`,
    );
    expect(upstreamSuggestUrl("searx", "x", { searxHost: "bad" })).toContain(
      DEFAULT_SEARX_HOST,
    );
  });
});
