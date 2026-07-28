# Plan 001: Extract redirect logic and add Vitest characterization suite

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/main.ts package.json tsconfig.json vite.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

All bang redirect behavior lives inline in `src/main.ts` with zero tests. Later plans fix real bugs (partial `{{{s}}}` replacement, relative URLs, blank-page failures) and change lookup/loading. Without a pure function and a characterization suite, those changes are unverifiable and easy to regress. This plan establishes the verification baseline every other plan depends on.

## Current state

- `src/main.ts` — entire app: landing page render + redirect logic (86 lines).
- `src/bang.ts` — exported `bangs` array (~13 569 entries); each entry has at least `{ t, u, d, ... }`.
- `package.json` — scripts: `dev`, `build` (`tsc && vite build`), `preview`. No `test`, no Vitest.
- `tsconfig.json` — `"include": ["src"]` only; `noEmit: true`, strict mode on.

Redirect logic today (`src/main.ts:45-86`):

```ts
const LS_DEFAULT_BANG = localStorage.getItem("default-bang") ?? "g";
const defaultBang = bangs.find((b) => b.t === LS_DEFAULT_BANG);

function getBangredirectUrl() {
  const url = new URL(window.location.href);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    noSearchDefaultPageRender();
    return null;
  }

  const match = query.match(/!(\S+)/i);
  const bangCandidate = match?.[1]?.toLowerCase();
  const selectedBang = bangs.find((b) => b.t === bangCandidate) ?? defaultBang;
  const cleanQuery = query.replace(/!\S+\s*/i, "").trim();

  if (cleanQuery === "")
    return selectedBang ? `https://${selectedBang.d}` : null;

  const searchUrl = selectedBang?.u.replace(
    "{{{s}}}",
    encodeURIComponent(cleanQuery).replace(/%2F/g, "/"),
  );
  if (!searchUrl) return null;
  return searchUrl;
}

function doRedirect() {
  const searchUrl = getBangredirectUrl();
  if (!searchUrl) return;
  window.location.replace(searchUrl);
}
doRedirect();
```

Conventions: vanilla TypeScript + Vite, no framework; Czech UI copy; keep changes minimal and match existing style (short functions, no new abstraction layers beyond what this plan requires).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Typecheck / build | `pnpm build` | exit 0 |
| Tests | `pnpm test` | exit 0, all pass |
| Run one file | `pnpm exec vitest run src/redirect.test.ts` | exit 0 |

## Scope

**In scope**:
- `package.json` (add vitest + `test` script)
- `vite.config.ts` or new `vitest.config.ts` (test config only)
- `tsconfig.json` (only if needed so Vitest/types resolve; prefer vitest config over broadening app include)
- `src/redirect.ts` (create — pure redirect helpers)
- `src/redirect.test.ts` (create)
- `src/main.ts` (thin wrapper calling extracted helpers; behavior preserved)
- `src/bang.ts` — **read-only** except if you must export a `Bang` type; prefer defining the type in `src/redirect.ts` from a minimal interface

**Out of scope**:
- Fixing bugs in redirect behavior (plans 002–004)
- Switching to `Map` (plan 005)
- UI for default bang (plan 006)
- Changing `bang.ts` data contents
- CI / ESLint (plan 008)

## Git workflow

- Branch: `advisor/001-extract-redirect-and-tests`
- Commit style (match repo): short imperative / descriptive, e.g. `Extract redirect logic and add vitest`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Add Vitest

1. `pnpm add -D vitest`
2. Add script `"test": "vitest run"` (and optionally `"test:watch": "vitest"`).
3. Configure Vitest with Vite. Prefer extending the existing Vite config:

```ts
/// in vite.config.ts
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [ /* existing VitePWA */ ],
  test: {
    environment: "node",
  },
});
```

Add a triple-slash or `/// <reference types="vitest/config" />` / ensure `vitest/config` types work so `test` is accepted. If TypeScript complains about `test` on the Vite config, create `vitest.config.ts` instead with `defineConfig` from `vitest/config` and `environment: "node"`.

**Verify**: `pnpm exec vitest --version` → prints a version; `pnpm test` → exits 1 or 0 with “no test files” / similar (no crash).

### Step 2: Create `src/redirect.ts` with pure helpers

Move the **pure** parts out of `main.ts`. Required exports (names may vary slightly but must be stable for later plans):

```ts
export type Bang = {
  t: string; // trigger
  u: string; // url template with {{{s}}}
  d: string; // domain for empty-query bang-only visits
};

export function encodeBangQuery(cleanQuery: string): string {
  return encodeURIComponent(cleanQuery).replace(/%2F/g, "/");
}

/**
 * Resolve the redirect URL for a search query string (the `q` param value).
 * Returns null when no redirect should happen.
 *
 * Characterization: preserve CURRENT behavior exactly (including known bugs).
 */
export function resolveBangRedirectUrl(
  query: string,
  bangs: Bang[],
  defaultBangTrigger: string,
): string | null {
  // Port logic from getBangredirectUrl, but:
  // - take `query` as argument (already trimmed by caller or trim here once)
  // - look up default via bangs.find(b => b.t === defaultBangTrigger)
  // - do NOT touch DOM / localStorage / window.location
}
```

Port rules for **this** plan (characterization — keep bugs):

- Empty query → return `null` (caller renders landing).
- Bang match: first `!(\S+)`, trigger lowercased.
- `selectedBang = find(trigger) ?? find(defaultBangTrigger)` (same as today; if default missing, `selectedBang` may be undefined).
- Strip first bang with `query.replace(/!\S+\s*/i, "").trim()`.
- If `cleanQuery === ""`: return `selectedBang ? \`https://${selectedBang.d}\` : null` (yes, empty `d` yields `https://` — keep for now).
- Else: `selectedBang?.u.replace("{{{s}}}", encodeBangQuery(cleanQuery))` — **single** replace only (current bug).
- Return `null` if no URL.

**Verify**: `pnpm exec tsc --noEmit` → exit 0 (or `pnpm build` if preferred).

### Step 3: Wire `main.ts` to the helpers

`main.ts` should:

1. Read `localStorage.getItem("default-bang") ?? "g"`.
2. If no `q` (after trim), call `noSearchDefaultPageRender()` and return.
3. Else `const url = resolveBangRedirectUrl(query, bangs, defaultTrigger)`; if url, `location.replace(url)`; if null, keep today’s behavior (early return — blank page still possible; plan 004 fixes that).

Do not change landing HTML/CSS in this plan.

**Verify**: `pnpm build` → exit 0.

### Step 4: Write characterization tests

Create `src/redirect.test.ts`. Use a **tiny fixture array** (do not import the full `bang.ts` — it is 2.6 MB and slow). Example fixtures:

```ts
const fixtures: Bang[] = [
  { t: "g", d: "www.google.com", u: "https://www.google.com/search?q={{{s}}}" },
  { t: "gh", d: "github.com", u: "https://github.com/search?q={{{s}}}" },
  { t: "abcya", d: "www.abcya.com", u: "https://www.abcya.com/search/?term={{{s}}}&type={{{s}}}" },
  { t: "bang", d: "", u: "/bang?q={{{s}}}" },
  { t: "xkcd", d: "xkcd.com", u: "/?q={{{s}}}+site:xkcd.com" },
];
```

Cases that must pass and document **current** behavior:

| Case | Input `q` | default | Expected |
|------|-----------|---------|----------|
| empty | `""` | `g` | `null` |
| default search | `hello` | `g` | Google URL with encoded `hello` |
| bang + query | `!gh unduck` | `g` | GitHub search for `unduck` |
| bang only | `!gh` | `g` | `https://github.com` |
| slash keep | `!gh t3dotgg/unduck` | `g` | query encoding keeps `/` (not `%2F`) |
| multi placeholder (current bug) | `!abcya cats` | `g` | first `{{{s}}}` replaced, second left as `{{{s}}}` |
| relative url (current) | `!xkcd birds` | `g` | returns `/?q=birds+site:xkcd.com` unchanged |
| empty domain bang-only (current) | `!bang` | `g` | `https://` |
| unknown default, no bang | `hello` | `missing` | `null` |

**Verify**: `pnpm test` → all tests pass.

### Step 5: Update plan index

Set plan 001 status to DONE in `plans/README.md`.

**Verify**: `grep '001' plans/README.md` shows DONE.

## Test plan

- File: `src/redirect.test.ts` (new), modeled as plain Vitest `describe`/`it`/`expect`.
- Cover the table above; these are characterization tests for current behavior.
- Later plans 002–004 will change expectations for multi-placeholder, relative URLs, and failed-redirect handling — they update tests then.

## Done criteria

- [ ] `pnpm test` exits 0 with tests in `src/redirect.test.ts`
- [ ] `pnpm build` exits 0
- [ ] `src/redirect.ts` exports `resolveBangRedirectUrl` (and `Bang` / `encodeBangQuery`)
- [ ] `src/main.ts` no longer contains the inlined URL assembly logic (uses the helper)
- [ ] No files outside scope modified
- [ ] `plans/README.md` row 001 → DONE

## STOP conditions

- `src/main.ts` redirect logic no longer matches the excerpt (drift).
- Vitest cannot be configured without rewriting the PWA plugin setup in a breaking way — stop and report rather than removing PWA.
- You believe preserving a characterized bug requires changing production UX in this plan — do not; only extract + test.

## Maintenance notes

- Reviewers: ensure tests import fixtures, not full `bang.ts`.
- Plans 002–004 edit `resolveBangRedirectUrl` and the corresponding test expectations.
- Do not “fix” bugs here even if obvious — that breaks the dependency story for later plans.
