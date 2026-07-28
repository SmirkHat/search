import { afterEach, describe, expect, it, vi } from "vitest";

const hot = [
  { t: "g", u: "https://google.com?q={{{s}}}", d: "google.com" },
  { t: "gh", u: "https://github.com?q={{{s}}}", d: "github.com" },
];
const full = [
  ...hot,
  { t: "obscure", u: "https://example.com?q={{{s}}}", d: "example.com" },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("bangs-hot") ? hot : full;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

describe("loadBangMapForTrigger", () => {
  it("uses hot catalog when bang is popular", async () => {
    stubFetch();
    const { loadBangMapForTrigger } = await import("./bangs-loader");
    const map = await loadBangMapForTrigger("gh");
    expect(map.has("gh")).toBe(true);
    expect(map.has("obscure")).toBe(false);
  });

  it("loads full catalog when bang is missing from hot", async () => {
    stubFetch();
    const { loadBangMapForTrigger } = await import("./bangs-loader");
    const map = await loadBangMapForTrigger("obscure");
    expect(map.has("obscure")).toBe(true);
  });

  it("keeps hot map for custom extra triggers", async () => {
    stubFetch();
    const { loadBangMapForTrigger } = await import("./bangs-loader");
    const map = await loadBangMapForTrigger("mycustom", ["mycustom"]);
    expect(map.has("g")).toBe(true);
    expect(map.has("obscure")).toBe(false);
  });
});

describe("loadHotBangMap", () => {
  it("fetches bangs-hot.json", async () => {
    stubFetch();
    const { loadHotBangMap } = await import("./bangs-loader");
    const map = await loadHotBangMap();
    expect(map.get("g")?.d).toBe("google.com");
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("bangs-hot.json");
  });
});
