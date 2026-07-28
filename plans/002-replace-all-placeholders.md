# Plan 002: Replace all `{{{s}}}` placeholders in bang URLs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/redirect.ts src/redirect.test.ts src/main.ts`
> If plan 001 has landed, expect those files to exist/change — compare against
> **post-001** code, not the original `main.ts` excerpt. If `src/redirect.ts`
> is missing, STOP (001 not done).

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-extract-redirect-and-tests.md
- **Category**: bug
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

Bang URL templates can contain multiple `{{{s}}}` placeholders (72 entries in the catalog). `String.prototype.replace` with a string pattern replaces only the first match, so sites like `!abcya` leave a literal `{{{s}}}` in the URL and break search. Fixing this is a one-line behavioral change with clear tests.

## Current state

After plan 001, replacement lives in `src/redirect.ts` inside `resolveBangRedirectUrl`, roughly:

```ts
const searchUrl = selectedBang?.u.replace(
  "{{{s}}}",
  encodeBangQuery(cleanQuery),
);
```

Characterization test (from 001) currently expects the buggy partial replacement for `!abcya cats`.

At the original commit, the same bug was in `src/main.ts:70-74`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:
- `src/redirect.ts` — use global replacement for `{{{s}}}`
- `src/redirect.test.ts` — update multi-placeholder expectation; add 1–2 cases

**Out of scope**:
- Editing entries in `src/bang.ts`
- Relative URL handling (plan 003)
- Blank-page handling (plan 004)
- `Map` lookup (plan 005)

## Git workflow

- Branch: `advisor/002-replace-all-placeholders`
- Commit message example: `Replace all {{{s}}} placeholders in bang URLs`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Update the replacement

In `resolveBangRedirectUrl`, replace the single `.replace("{{{s}}}", …)` with a global replace. Prefer:

```ts
selectedBang.u.replaceAll("{{{s}}}", encodeBangQuery(cleanQuery))
```

If targeting environments without `replaceAll`, use:

```ts
selectedBang.u.replace(/\{\{\{s\}\}\}/g, encodeBangQuery(cleanQuery))
```

Repo `tsconfig` targets ES2020; `replaceAll` is fine in modern browsers this app targets. Either form is acceptable; prefer `replaceAll` for readability.

**Verify**: `pnpm exec tsc --noEmit` or `pnpm build` → exit 0.

### Step 2: Fix tests

Update the multi-placeholder case:

- Input: `!abcya cats`, default `g`
- Expected: `https://www.abcya.com/search/?term=cats&type=cats` (both placeholders filled)

Add a second fixture with two placeholders in different positions if useful (optional).

Remove any comment that says “current bug” for this case.

**Verify**: `pnpm test` → exit 0.

### Step 3: Update index

Mark 002 DONE in `plans/README.md`.

## Test plan

- Update existing `!abcya` characterization test to assert full replacement.
- Keep other cases unchanged.

## Done criteria

- [ ] No `.replace("{{{s}}}",` single-replace left in `src/redirect.ts` / `src/main.ts`
- [ ] `pnpm test` passes with both placeholders filled for multi-`{{{s}}}` fixtures
- [ ] `pnpm build` exits 0
- [ ] Scope respected
- [ ] `plans/README.md` row 002 → DONE

## STOP conditions

- `src/redirect.ts` does not exist (001 incomplete).
- Replacement logic was already global — report and mark DONE / REJECTED as appropriate after confirming tests assert full replacement.

## Maintenance notes

- Reviewers: ensure encoding still runs through `encodeBangQuery` (keeps `/` behavior).
- Catalog entries with zero placeholders are unaffected.
