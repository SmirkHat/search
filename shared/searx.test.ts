import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARX_HOST,
  isKnownSearxHost,
  isValidSearxHost,
  normalizeSearxHost,
  parseSearxHostFromCookie,
  parseSearxHostInput,
  searxInstanceLabel,
  SEARX_INSTANCES,
} from "./searx";

describe("searx hosts", () => {
  it("keeps a curated default that is in the list", () => {
    expect(SEARX_INSTANCES.some((i) => i.host === DEFAULT_SEARX_HOST)).toBe(
      true,
    );
    expect(SEARX_INSTANCES.some((i) => i.host === "searxng.cz")).toBe(false);
    expect(SEARX_INSTANCES.some((i) => i.host === "searx.linxx.net")).toBe(
      false,
    );
  });

  it("validates hostnames", () => {
    expect(isValidSearxHost("search.rhscz.eu")).toBe(true);
    expect(isValidSearxHost("searx.example.com:8080")).toBe(true);
    expect(isValidSearxHost("localhost")).toBe(false);
    expect(isValidSearxHost("127.0.0.1")).toBe(false);
    expect(isValidSearxHost("searx")).toBe(false);
  });

  it("parses pasted URLs", () => {
    expect(parseSearxHostInput("https://Searx.Example.com/search")).toBe(
      "searx.example.com",
    );
    expect(parseSearxHostInput("https://searx.example.com/search?q=x")).toBe(
      "searx.example.com",
    );
    expect(parseSearxHostInput("searx.example.com/foo/bar")).toBe(
      "searx.example.com",
    );
    expect(parseSearxHostInput("searx.example.com:8443/search")).toBe(
      "searx.example.com:8443",
    );
    expect(parseSearxHostInput("searx.example.com:8443")).toBe(
      "searx.example.com:8443",
    );
    expect(parseSearxHostInput("not a host")).toBe(null);
  });

  it("normalizes unknown/invalid to default, keeps custom", () => {
    expect(normalizeSearxHost("searxng.cz")).toBe(DEFAULT_SEARX_HOST);
    expect(normalizeSearxHost("localhost")).toBe(DEFAULT_SEARX_HOST);
    expect(normalizeSearxHost("my-searx.example.org")).toBe(
      "my-searx.example.org",
    );
    expect(isKnownSearxHost("my-searx.example.org")).toBe(false);
    expect(searxInstanceLabel("my-searx.example.org")).toBe(
      "my-searx.example.org",
    );
    expect(searxInstanceLabel(DEFAULT_SEARX_HOST)).toBe(
      `NL · ${DEFAULT_SEARX_HOST}`,
    );
  });

  it("reads custom host from cookie", () => {
    expect(
      parseSearxHostFromCookie("searx-instance=my-searx.example.org; Path=/"),
    ).toBe("my-searx.example.org");
  });
});
