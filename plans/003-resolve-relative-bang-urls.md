# Plan 003: Resolve DDG-relative bang URLs against duckduckgo.com

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/redirect.ts src/redirect.test.ts`
> Requires plan 001. If `src/redirect.ts` is missing, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/001-extract-redirect-and-tests.md
- **Category**: bug
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

DuckDuckGo’s bang catalog includes **site-relative** URLs (17 entries), e.g. `!bang` → `/bang?q={{{s}}}`, `!xkcd` → `/?q={{{s}}}+site:xkcd.com`. On unduck, `location.replace("/?q=…")` hits the unduck origin, not DDG. Some paths double-hop through the default bang and look “sort of OK”; others 404 or drop DDG-only params (`kp` for `!safe`). Resolving these against `https://duckduckgo.com` restores intended behavior.

## Current state

After placeholder fill, `resolveBangRedirectUrl` returns `selectedBang.u` (post-replace) as-is. Relative examples from the catalog:

| Trigger | `u` (template) |
|---------|----------------|
| `bang` | `/bang?q={{{s}}}` |
| `xkcd` | `/?q={{{s}}}+site:xkcd.com` |
| `safe` | `/?q={{{s}}}&kp=1` |
| `nbang` | `/newbang` (no placeholder) |

Also: bang-only visit uses `https://${selectedBang.d}`. For `!bang`, `d` is `""` → `https://` (plan 004 hardens empty `d`; this plan still must make **non-empty query** relative URLs correct).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:
- `src/redirect.ts` — absolute-ize relative bang URLs after template fill (and for bang-only domain navigation when applicable)
- `src/redirect.test.ts` — update relative-URL expectations; add cases for `!safe`, `!bang` with query

**Out of scope**:
- Rewriting `src/bang.ts` entries to absolute URLs by hand
- Blank-page / empty-domain bang-only hardening beyond what’s needed for relative `u` (coordinate with 004 if both touch the same return paths — prefer small helpers both can call)
- Changing default search engine

## Git workflow

- Branch: `advisor/003-resolve-relative-bang-urls`
- Commit message example: `Resolve relative bang URLs against duckduckgo.com`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Add a URL normalizer

In `src/redirect.ts`:

```ts
const DDG_ORIGIN = "https://duckduckgo.com";

export function absolutizeBangUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${DDG_ORIGIN}${url}`;
  // Defensive: protocol-relative
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}
```

Apply `absolutizeBangUrl` to every successful redirect string before return:

1. After building the search URL from `u` + placeholders.
2. After building the bang-only `https://${d}` URL — **only** if you also handle the case where some bangs might store relative forms in `u` for empty query; for bang-only, keep using `d` as today (004 may change empty `d`). Do **not** invent a domain for empty `d` here unless you also implement the 004 fallback in the same change set — if 004 is not done, leave bang-only `!bang` as-is (`https://`) and only fix paths that come from `u`.

**Verify**: unit-test `absolutizeBangUrl` directly + `pnpm test` after step 2.

### Step 2: Update tests

Change / add:

| Case | Expected |
|------|----------|
| `!xkcd birds` | `https://duckduckgo.com/?q=birds+site:xkcd.com` |
| `!bang github` | `https://duckduckgo.com/bang?q=github` |
| `!safe query` (add fixture) | `https://duckduckgo.com/?q=query&kp=1` |
| Absolute Google `hello` | unchanged `https://www.google.com/...` |

**Verify**: `pnpm test` → exit 0; `pnpm build` → exit 0.

### Step 3: Update index

Mark 003 DONE in `plans/README.md`.

## Test plan

- Direct tests for `absolutizeBangUrl`.
- Integration via `resolveBangRedirectUrl` for relative fixtures.
- Regression: absolute `https://` templates must not be prefixed again.

## Done criteria

- [ ] Relative `/…` bang results start with `https://duckduckgo.com/`
- [ ] Absolute bangs unchanged
- [ ] `pnpm test` and `pnpm build` exit 0
- [ ] Scope respected
- [ ] `plans/README.md` row 003 → DONE

## STOP conditions

- You find relative URLs that are clearly not DDG-shaped (e.g. meant for another host) — stop and report the triggers before guessing another origin.
- Plan 001 missing.

## Maintenance notes

- If plan 010 regenerates the catalog and DDG changes relative URL conventions, keep `absolutizeBangUrl` as the single chokepoint.
- Reviewers: confirm no double-prefix (`https://duckduckgo.comhttps://…`).
