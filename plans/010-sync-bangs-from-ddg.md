# Plan 010: Automate bang catalog sync from DuckDuckGo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- scripts/ public/bangs.json src/bang.ts package.json`
> Prefer plan 009 done (JSON catalog). If 009 is not done, this plan may regenerate `src/bang.ts` instead — see STOP/alternate path.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/009-async-bang-catalog.md (preferred)
- **Category**: direction
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

`src/bang.ts` begins with “ripped from https://duckduckgo.com/bang.js” — a frozen snapshot. New/changed bangs upstream never reach users until someone manually pastes data. A small sync script + documented command (optional CI cron later) keeps the fork maintainable.

## Current state

- Catalog comment: `// This file was (mostly) ripped from https://duckduckgo.com/bang.js`
- No `scripts/` sync tooling.
- After 009: runtime reads `public/bangs.json` with `{ t, u, d }` (expected).
- This plan is a **tooling/design** delivery: working generator + README section; not a guarantee of a scheduled GitHub cron (optional stretch).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Sync (to add) | `pnpm bangs:sync` | writes catalog artifact; exit 0 |
| Build | `pnpm build` | exit 0 |
| Test | `pnpm test` | exit 0 |

## Scope

**In scope**:
- `scripts/sync-bangs.mjs` (or `.ts`) — fetch DDG bang data, normalize to the repo’s catalog shape, write output
- `package.json` script `bangs:sync`
- Short README section: how to refresh bangs
- Output path: `public/bangs.json` if 009 landed; else `src/bang.ts` with the existing export shape

**Out of scope**:
- Automatically committing on a schedule in production without operator approval
- Editing redirect logic
- Guaranteeing HTTPS upgrades for all `http://` bangs
- Shipping network fetch of DDG **in the browser at runtime** (sync is maintainer-side)

## Git workflow

- Branch: `advisor/010-sync-bangs-from-ddg`
- Commit message example: `Add script to sync bangs from DuckDuckGo`
- Do NOT push or open a PR unless asked.
- Do **not** commit a huge catalog churn unless the operator wants a refresh in the same PR; prefer committing the script + a note. If you do refresh data, keep it in a separate commit from the script.

## Steps

### Step 1: Discover the upstream format

Fetch `https://duckduckgo.com/bang.js` (or the current public bang export DDG provides). Inspect structure. Historically this is a JS file assigning/exporting an array of objects with fields including `t`, `u`, `d`, etc.

**Verify**: script can parse ≥1000 bangs locally. If the URL 404s or format changed radically, STOP and report the new URL/format findings — do not scrape HTML guessing.

### Step 2: Implement `pnpm bangs:sync`

Requirements:

1. Node script runnable via pnpm.
2. Download upstream.
3. Map each entry → `{ t, u, d }` (and if still writing `bang.ts`, keep fuller fields only if required by current runtime).
4. Preserve any **local additions** that must not be wiped — today the file starts with a custom `t3` bang for T3 Chat. Implement an explicit `LOCAL_BANGS` array in the script that is merged **after** upstream (local overrides same `t`).
5. Stable sort by `t` for deterministic diffs.
6. Write JSON (preferred) with trailing newline.

**Verify**: `pnpm bangs:sync` → exit 0; output parseable; includes `t: "g"` and local `t: "t3"` if that override remains desired.

### Step 3: Document

In `README.md`, add a short “Updating bangs” section:

```markdown
## Updating bangs

pnpm bangs:sync
pnpm build
```

**Verify**: section exists; commands match `package.json`.

### Step 4: (Optional stretch) CI workflow_dispatch

Add a workflow with `workflow_dispatch` that runs sync and opens a PR — **only** if it is straightforward. If not, skip; do not block DONE on cron automation.

### Step 5: Update index

Mark 010 DONE in `plans/README.md`.

## Test plan

- Prefer a pure `normalizeBang(entry)` unit test with a fixture snippet (no live network in `pnpm test`).
- Optionally gate network sync behind the script only.

## Done criteria

- [ ] `pnpm bangs:sync` exists and produces the artifact the app loads
- [ ] Local overrides (at least document/support `t3`) are not lost on sync
- [ ] README documents the command
- [ ] `pnpm test` / `pnpm build` still pass without requiring network
- [ ] `plans/README.md` row 010 → DONE

## STOP conditions

- Upstream bang export is unavailable or not machine-parseable — STOP with findings.
- Sync would delete fork-specific behavior with no override mechanism — do not ship until `LOCAL_BANGS` exists.
- Plan 009 not done and writing 122k-line `bang.ts` is the only option — allowed, but report that diffs will be huge; ask before committing regenerated data.

## Maintenance notes

- Reviewers: check deterministic ordering and override rules.
- Runtime must never depend on duckduckgo.com for redirects to work offline/cached.
