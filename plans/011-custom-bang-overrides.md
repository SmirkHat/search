# Plan 011: Support user-defined custom bang overrides

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/main.ts src/redirect.ts src/global.css`
> Requires 005 (Map) and 006 (landing settings UI patterns). Prefer 009 if catalog is async — merge custom bangs **after** load.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/005-bang-map-lookup.md, plans/006-default-bang-ui.md
- **Category**: direction
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

Power users commonly want personal shortcuts (`!work`, `!pr`) or overrides of stock bangs. The app already uses `localStorage` for `default-bang`; extending that to a small JSON list of custom `{ t, u, d }` entries overlays cleanly onto the Map built in plan 005 — high product leverage for a static client-side tool.

## Current state

- Redirect resolves via `Map<string, Bang>` (`t` → bang).
- Landing page (after 006) can edit `default-bang`.
- No custom bang storage yet.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |
| Dev | `pnpm dev` | manual UI check |

## Scope

**In scope**:
- Storage key e.g. `custom-bangs` in `localStorage` — JSON array of `{ t, u, d }`
- Pure helpers: `parseCustomBangs(raw)`, `applyCustomBangs(base: Map, custom: Bang[]): Map` (custom wins on same `t`)
- Landing UI: add / list / delete custom bangs (vanilla DOM, Czech copy, match dark styles)
- Wire boot path to apply customs before redirect / default-bang validation
- Unit tests for parse/merge/validation

**Out of scope**:
- Syncing custom bangs across devices / accounts
- Import/export file UI (nice-to-have; skip unless trivial)
- Server persistence
- Allowing `javascript:` or other dangerous URL schemes

## Git workflow

- Branch: `advisor/011-custom-bang-overrides`
- Commit message example: `Add localStorage custom bang overrides`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Pure merge/validation helpers

Create `src/custom-bangs.ts` (name flexible):

```ts
export const CUSTOM_BANGS_KEY = "custom-bangs";

export function parseCustomBangs(raw: string | null): Bang[] { /* JSON.parse, filter valid */ }

export function validateBangInput(b: { t: string; u: string; d: string }): string | null {
  // return Czech error message or null if ok
  // rules:
  // - t: non-empty, no whitespace, stored lowercased, no leading !
  // - u: must be absolute http(s) OR start with / (DDG-relative, still OK with plan 003)
  // - reject javascript: data: blob: etc.
  // - d: optional string (may be empty only if you also support bang-only via 004 rules)
}

export function applyCustomBangs(
  base: Map<string, Bang>,
  custom: Bang[],
): Map<string, Bang> {
  const map = new Map(base);
  for (const b of custom) map.set(b.t, b);
  return map;
}
```

**Verify**: `src/custom-bangs.test.ts` covers valid parse, invalid JSON → `[]`, override same `t`, reject `javascript:` URLs.

### Step 2: Wire into boot

After base map is available (sync import or `loadBangMap()` from 009):

```ts
const custom = parseCustomBangs(localStorage.getItem(CUSTOM_BANGS_KEY));
const bangMap = applyCustomBangs(baseMap, custom);
```

Use `bangMap` for redirect and for default-bang validation.

**Verify**: `pnpm test` ; `pnpm build`.

### Step 3: Landing UI

Extend the landing page (same visual language as 006):

- Section title e.g. `Vlastní bangy`
- Fields: trigger, URL template (must include `{{{s}}}` **or** allow bang-only domain-only entries — pick one rule and document in UI helper text; recommended: require `{{{s}}}` in `u` OR non-empty `d` for bang-only)
- Add button; list existing customs with delete
- Persist full array to `localStorage` on each change

Do not use alert(); inline status text only.

**Verify**: manual smoke — add `!hw` → `https://example.com/search?q={{{s}}}`, visit `/?q=!hw+test` → example.com; delete works after reload.

### Step 4: Update index

Mark 011 DONE in `plans/README.md`.

## Test plan

- `custom-bangs.test.ts` as above.
- Optional: resolveBangRedirectUrl with a map that includes a custom entry.

## Done criteria

- [ ] Users can add/override/delete bangs persisted in `localStorage`
- [ ] Dangerous schemes rejected
- [ ] Custom entries affect redirect and can be chosen as default bang if 006 validates against merged map
- [ ] `pnpm test` and `pnpm build` exit 0
- [ ] Scope respected
- [ ] `plans/README.md` row 011 → DONE

## STOP conditions

- Plan 005/006 missing — STOP.
- You believe UI scope is ballooning into a settings SPA — STOP and ship helpers + minimal add/list/delete only.

## Maintenance notes

- Reviewers: custom bangs are attacker-controlled only by the same browser user (XSS into LS would already be game over); still block non-http(s)/relative schemes.
- Plan 003’s `absolutizeBangUrl` should still run on custom relative `/…` URLs for consistency.
- Export/import can be a future follow-up.
