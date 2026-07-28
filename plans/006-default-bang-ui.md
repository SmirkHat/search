# Plan 006: Landing-page UI to set default bang

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/main.ts src/global.css src/redirect.ts`
> Requires 001; strongly prefers 005 (`Map` for validation).

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-extract-redirect-and-tests.md, plans/005-bang-map-lookup.md
- **Category**: direction
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

`main.ts` already reads `localStorage["default-bang"]` (fallback `"g"`) but nothing in the UI writes it. Users who want DuckDuckGo / Bing / something else as the no-bang default must hand-edit DevTools. A small control on the existing landing page completes the feature the code already half-implements.

## Current state

```ts
const LS_DEFAULT_BANG = localStorage.getItem("default-bang") ?? "g";
```

Landing markup is an `innerHTML` string in `noSearchDefaultPageRender()` (`src/main.ts`) with Czech copy, URL `https://unduck.smht.eu?q=%s`, and a copy button. Styles live in `src/global.css` (dark theme `#131313`, `.content-container`, `.url-input`, `.copy-button`, `.footer`).

There is no React — keep vanilla DOM.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Dev | `pnpm dev` | server starts |
| Build | `pnpm build` | exit 0 |
| Tests | `pnpm test` | exit 0 |

## Scope

**In scope**:
- `src/main.ts` — landing UI for viewing/setting default bang; persist to `localStorage` key `default-bang`
- `src/global.css` — minimal styles matching existing inputs/buttons (no new design system, no cards-for-decoration)
- Optional tiny helper in `src/redirect.ts` only if validation belongs next to bang types (e.g. `isKnownBangTrigger(map, t)`)

**Out of scope**:
- Custom bang CRUD (plan 011)
- Redesigning the whole landing page / changing fonts
- i18n framework
- Changing the storage key name (`default-bang` must stay)

## Git workflow

- Branch: `advisor/006-default-bang-ui`
- Commit message example: `Add UI to set default bang`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Add UI controls to the landing render

Below the URL copy row (still inside `.content-container`), add a compact control group:

- Label in Czech, e.g. `Výchozí bang (bez !v dotazu):`
- Text input (or short input) showing the current trigger without `!` (e.g. `g`)
- Button `Uložit` (or save on Enter)
- Status line for success / unknown bang

Behavior:

1. On render, read `localStorage.getItem("default-bang") ?? "g"` into the input.
2. On save: normalize to lowercase trim; reject empty; if trigger not in `bangMap`, show error in Czech (`Neznámý bang`) and do not write.
3. On success: `localStorage.setItem("default-bang", trigger)` and brief confirmation (`Uloženo`).
4. Do not use `alert()`.

Match existing DOM patterns (querySelector after innerHTML, addEventListener). Reuse `.url-input` / button styles where possible; add a BEM-ish or flat class like `.default-bang-row` in `global.css` consistent with current CSS (no purple gradients, keep dark theme).

**Verify**: `pnpm build` → exit 0.

### Step 2: Keep redirect path using the stored value

Ensure `doRedirect` still reads LS at redirect time (not a stale const from first paint only — if the user never redirects in the same session it’s fine; for consistency, read LS inside `doRedirect` each time).

**Verify**: `pnpm test` → exit 0 (redirect unit tests unchanged).

### Step 3: Manual smoke checklist (document in commit body or leave as done-criteria)

- Visit `/` → see control with `g`
- Save `ddg` or whatever exists in catalog for DuckDuckGo search — confirm LS
- Visit `?q=test` → redirects using new default
- Save `not-a-real-bang-xyz` → error, LS unchanged

### Step 4: Update index

Mark 006 DONE in `plans/README.md`.

## Test plan

- Prefer extracting `normalizeDefaultBangTrigger(raw: string): string` and testing normalization if non-trivial.
- Full DOM test optional; not required if wiring stays in `main.ts`.
- Do not import full `bang.ts` into unit tests.

## Done criteria

- [ ] Landing page can set `localStorage["default-bang"]` to a known trigger
- [ ] Unknown triggers are rejected
- [ ] Existing dark styling preserved; layout still usable on narrow viewports
- [ ] `pnpm build` and `pnpm test` exit 0
- [ ] Scope respected
- [ ] `plans/README.md` row 006 → DONE

## STOP conditions

- Bang map unavailable because 005 not merged — STOP and do 005 first (do not reintroduce O(n) find solely for this UI without noting it).
- Product owner wants English-only copy — report; default to Czech to match the page.

## Maintenance notes

- Plan 011 may place custom bangs in the same Map — validation should use the same map the redirect uses.
- Reviewer: clipboard handler already lacks try/catch; do not expand scope to fix it unless it blocks you.
