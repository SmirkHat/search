# Plan 004: Never leave a blank page on failed redirect

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/main.ts src/redirect.ts src/redirect.test.ts`
> Requires plan 001.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-extract-redirect-and-tests.md
- **Category**: bug
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

When redirect resolution returns `null` but the user had a `q` param (e.g. invalid `default-bang` in `localStorage` and no `!bang` in the query), `doRedirect` returns without rendering the landing page — the user sees an empty `#app`. Separately, bang-only visits with empty `d` (e.g. `!bang`) currently produce `https://`, which is a broken navigation. Both should degrade to a safe UX: show the landing page (and never navigate to `https://`).

## Current state

Original `src/main.ts:80-84`:

```ts
function doRedirect() {
  const searchUrl = getBangredirectUrl();
  if (!searchUrl) return;
  window.location.replace(searchUrl);
}
```

And bang-only branch:

```ts
if (cleanQuery === "")
  return selectedBang ? `https://${selectedBang.d}` : null;
```

When `selectedBang.d === ""`, this returns `"https://"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:
- `src/redirect.ts` — treat empty/`whitespace` `d` as unresolved for bang-only; never return `"https://"` or `"https://"`-only
- `src/main.ts` — if resolve returns `null`, always call `noSearchDefaultPageRender()` (whether or not `q` was present)
- `src/redirect.test.ts` — update `!bang` bang-only expectation from `https://` to `null`; add invalid-default case already expecting `null`

**Out of scope**:
- Building a separate error page with messaging (landing is enough)
- Changing how `default-bang` is configured (plan 006)
- Relative URL absolutizing (plan 003) — if both merge, keep helpers orthogonal

## Git workflow

- Branch: `advisor/004-no-blank-page-on-failed-redirect`
- Commit message example: `Show landing page when bang redirect fails`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Harden bang-only URL construction

In `resolveBangRedirectUrl`:

```ts
if (cleanQuery === "") {
  const domain = selectedBang?.d?.trim();
  if (!domain) return null;
  return `https://${domain}`;
}
```

**Verify**: test `!bang` with empty query → `null`.

### Step 2: Always render landing on null

In `main.ts`, structure like:

```ts
function doRedirect() {
  const url = new URL(window.location.href);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const defaultTrigger = localStorage.getItem("default-bang") ?? "g";

  if (!query) {
    noSearchDefaultPageRender();
    return;
  }

  const searchUrl = resolveBangRedirectUrl(query, bangs, defaultTrigger);
  if (!searchUrl) {
    noSearchDefaultPageRender();
    return;
  }
  window.location.replace(searchUrl);
}
```

Avoid calling the landing renderer twice in a confusing way; once is enough. If plan 003 wrapped the return with `absolutizeBangUrl`, keep that on the success path only.

**Verify**: `pnpm build` → exit 0.

### Step 3: Tests

- `!bang` (bang only) → `null`
- `hello` with default `"missing"` → `null`
- Valid `!gh` bang only → still `https://github.com`

**Verify**: `pnpm test` → exit 0.

### Step 4: Update index

Mark 004 DONE in `plans/README.md`.

## Test plan

- Pure function tests as above (DOM landing render is not unit-tested unless you add a tiny jsdom test — **not required**; main.ts wiring is simple).
- Manual smoke (optional): set `localStorage.default-bang = "nope"` and visit `?q=test` → landing visible.

## Done criteria

- [ ] `resolveBangRedirectUrl` never returns a string matching `/^https:\/\/$/`
- [ ] `main.ts` calls `noSearchDefaultPageRender()` whenever there is no redirect URL
- [ ] `pnpm test` and `pnpm build` exit 0
- [ ] Scope respected
- [ ] `plans/README.md` row 004 → DONE

## STOP conditions

- Landing render was moved/renamed and calling it from the failure path is unclear — stop rather than inventing a new page.
- Plan 001 missing.

## Maintenance notes

- Plan 006 should validate default bang against the Map so invalid LS values are less common; keep this fallback anyway.
- Reviewers: ensure success path still does not flash the landing page before redirect (only call render on failure / no query).
