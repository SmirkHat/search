# Plan 005: Index bangs in a `Map` for O(1) lookup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/redirect.ts src/main.ts src/redirect.test.ts`
> Requires plan 001.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-extract-redirect-and-tests.md
- **Category**: perf
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

Redirect resolution uses `bangs.find(...)` over ~13 569 entries (twice: default + candidate). Microbenchmarks on this repo showed ~1 ms per linear scan vs ~0.0001 ms per `Map#get`. Cheap win, and later UI/custom-bang plans need a shared lookup structure.

## Current state

After 001, `resolveBangRedirectUrl(query, bangs: Bang[], defaultBangTrigger)` likely still uses `.find`. `main.ts` passes the `bangs` array imported from `./bang`.

Triggers (`t`) in the catalog are unique (verified at audit time: 13569 unique / 13569 total).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:
- `src/redirect.ts` — accept `Map<string, Bang>` (or build Map once from array at module boundary)
- `src/main.ts` — build `const bangMap = new Map(bangs.map(b => [b.t, b]))` once at startup (or export a helper `buildBangMap`)
- `src/redirect.test.ts` — build Map from fixtures

**Out of scope**:
- Changing catalog format / splitting load (plan 009)
- Custom bang merging (plan 011) — but keep API Map-friendly for it

## Git workflow

- Branch: `advisor/005-bang-map-lookup`
- Commit message example: `Use Map for bang trigger lookup`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Change the resolve API to Map

Preferred signature:

```ts
export function buildBangMap(bangs: Bang[]): Map<string, Bang> {
  return new Map(bangs.map((b) => [b.t, b]));
}

export function resolveBangRedirectUrl(
  query: string,
  bangMap: Map<string, Bang>,
  defaultBangTrigger: string,
): string | null {
  const defaultBang = bangMap.get(defaultBangTrigger);
  const match = query.match(/!(\S+)/i);
  const bangCandidate = match?.[1]?.toLowerCase();
  const selectedBang =
    (bangCandidate ? bangMap.get(bangCandidate) : undefined) ?? defaultBang;
  // ... rest unchanged (including 002–004 fixes if already merged)
}
```

Update all call sites and tests.

**Verify**: `pnpm test` → exit 0; `pnpm build` → exit 0.

### Step 2: Update index

Mark 005 DONE in `plans/README.md`.

## Test plan

- Existing redirect tests updated to use `buildBangMap(fixtures)`.
- Optional: assert `buildBangMap` size equals input length for fixtures.

## Done criteria

- [ ] No `bangs.find` in redirect hot path (`src/redirect.ts` / `src/main.ts` lookup)
- [ ] `pnpm test` and `pnpm build` exit 0
- [ ] Scope respected
- [ ] `plans/README.md` row 005 → DONE

## STOP conditions

- Duplicate triggers appear in `bang.ts` (Map would collapse them) — stop and report; do not silently drop without calling it out.
- Plan 001 missing.

## Maintenance notes

- Plan 011 will overlay custom bangs onto this Map — keep `buildBangMap` exported.
- Reviewers: Map must be built once per page load, not per redirect call.
