import { describe, expect, it } from "vitest";
import {
  absolutizeBangUrl,
  buildBangMap,
  type Bang,
  encodeBangQuery,
  extractBangTrigger,
  extractSnapTriggers,
  resolveBangRedirectUrl,
} from "./redirect";

const fixtures: Bang[] = [
  {
    t: "g",
    d: "www.google.com",
    u: "https://www.google.com/search?q={{{s}}}",
  },
  {
    t: "gh",
    d: "github.com",
    u: "https://github.com/search?q={{{s}}}",
  },
  {
    t: "w",
    d: "en.wikipedia.org",
    u: "https://en.wikipedia.org/wiki/Special:Search?search={{{s}}}",
  },
  {
    t: "abcya",
    d: "www.abcya.com",
    u: "https://www.abcya.com/search/?term={{{s}}}&type={{{s}}}",
  },
  { t: "bang", d: "", u: "/bang?q={{{s}}}" },
  {
    t: "xkcd",
    d: "xkcd.com",
    u: "/?q={{{s}}}+site:xkcd.com",
  },
];

const map = buildBangMap(fixtures);

describe("extractBangTrigger", () => {
  it("returns lowercased prefix trigger", () => {
    expect(extractBangTrigger("!GH unduck")).toBe("gh");
  });

  it("returns suffix trigger", () => {
    expect(extractBangTrigger("unduck !gh")).toBe("gh");
  });

  it("prefix wins over suffix", () => {
    expect(extractBangTrigger("!g cats !gh")).toBe("g");
  });

  it("returns null without bang", () => {
    expect(extractBangTrigger("hello")).toBeNull();
  });
});

describe("extractSnapTriggers", () => {
  it("parses prefix snap", () => {
    expect(extractSnapTriggers("@w quantum")).toEqual(["w"]);
  });

  it("parses snap chain", () => {
    expect(extractSnapTriggers("@gh,w api")).toEqual(["gh", "w"]);
  });

  it("parses suffix snap", () => {
    expect(extractSnapTriggers("quantum @w")).toEqual(["w"]);
  });
});

describe("encodeBangQuery", () => {
  it("keeps slashes unencoded", () => {
    expect(encodeBangQuery("t3dotgg/unduck")).toBe("t3dotgg/unduck");
  });
});

describe("absolutizeBangUrl", () => {
  it("prefixes relative paths with duckduckgo.com", () => {
    expect(absolutizeBangUrl("/bang?q=x")).toBe(
      "https://duckduckgo.com/bang?q=x",
    );
  });

  it("leaves absolute https URLs alone", () => {
    expect(absolutizeBangUrl("https://example.com/q")).toBe(
      "https://example.com/q",
    );
  });
});

describe("resolveBangRedirectUrl", () => {
  it('empty "" / g → null', () => {
    expect(resolveBangRedirectUrl("", map, "g")).toBeNull();
  });

  it("hello / g → Google with hello", () => {
    expect(resolveBangRedirectUrl("hello", map, "g")).toBe(
      "https://www.google.com/search?q=hello",
    );
  });

  it("!gh unduck / g → GitHub search unduck", () => {
    expect(resolveBangRedirectUrl("!gh unduck", map, "g")).toBe(
      "https://github.com/search?q=unduck",
    );
  });

  it("unduck !gh → GitHub (suffix)", () => {
    expect(resolveBangRedirectUrl("unduck !gh", map, "g")).toBe(
      "https://github.com/search?q=unduck",
    );
  });

  it("!gh / g → https://github.com", () => {
    expect(resolveBangRedirectUrl("!gh", map, "g")).toBe("https://github.com");
  });

  it("!gh t3dotgg/unduck / g → keeps / not %2F", () => {
    expect(resolveBangRedirectUrl("!gh t3dotgg/unduck", map, "g")).toBe(
      "https://github.com/search?q=t3dotgg/unduck",
    );
  });

  it("!abcya cats / g → all {{{s}}} replaced", () => {
    expect(resolveBangRedirectUrl("!abcya cats", map, "g")).toBe(
      "https://www.abcya.com/search/?term=cats&type=cats",
    );
  });

  it("!xkcd birds / g → absolute DDG URL", () => {
    expect(resolveBangRedirectUrl("!xkcd birds", map, "g")).toBe(
      "https://duckduckgo.com/?q=birds+site:xkcd.com",
    );
  });

  it("!bang github / g → DDG bang search", () => {
    expect(resolveBangRedirectUrl("!bang github", map, "g")).toBe(
      "https://duckduckgo.com/bang?q=github",
    );
  });

  it("!bang / g → null (empty domain)", () => {
    expect(resolveBangRedirectUrl("!bang", map, "g")).toBeNull();
  });

  it("hello / missing → null", () => {
    expect(resolveBangRedirectUrl("hello", map, "missing")).toBeNull();
  });

  it("@w quantum → default engine + site:wikipedia", () => {
    expect(resolveBangRedirectUrl("@w quantum", map, "g")).toBe(
      "https://www.google.com/search?q=quantum%20site%3Aen.wikipedia.org",
    );
  });

  it("quantum @w → suffix snap", () => {
    expect(resolveBangRedirectUrl("quantum @w", map, "g")).toBe(
      "https://www.google.com/search?q=quantum%20site%3Aen.wikipedia.org",
    );
  });

  it("@gh,w api → chained site filters", () => {
    expect(resolveBangRedirectUrl("@gh,w api", map, "g")).toBe(
      "https://www.google.com/search?q=api%20site%3Agithub.com%20site%3Aen.wikipedia.org",
    );
  });

  it("@w → wikipedia homepage", () => {
    expect(resolveBangRedirectUrl("@w", map, "g")).toBe(
      "https://en.wikipedia.org",
    );
  });

  it("!ghunduck → no-space longest trigger", () => {
    expect(resolveBangRedirectUrl("!ghunduck", map, "g")).toBe(
      "https://github.com/search?q=unduck",
    );
  });

  it("unduck!gh → glued suffix", () => {
    expect(resolveBangRedirectUrl("unduck!gh", map, "g")).toBe(
      "https://github.com/search?q=unduck",
    );
  });

  it("foo !gh bar → mid-query bang", () => {
    expect(resolveBangRedirectUrl("foo !gh bar", map, "g")).toBe(
      "https://github.com/search?q=foo%20bar",
    );
  });
});
