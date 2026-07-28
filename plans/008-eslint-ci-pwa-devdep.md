# Plan 008: Add ESLint, CI, and fix PWA dependency placement

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- package.json pnpm-lock.yaml vite.config.ts .github`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-extract-redirect-and-tests.md (so CI can run `pnpm test`)
- **Category**: dx
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

There is no lint script and no CI. `vite-plugin-pwa` is listed under `dependencies` even though it is a Vite build plugin (belongs in `devDependencies`). A minimal GitHub Actions workflow + ESLint gives every later plan a machine gate.

## Current state

`package.json` scripts: `dev`, `build`, `preview` (and after 001: `test`).

```json
"devDependencies": {
  "typescript": "~5.7.2",
  "vite": "^6.1.0"
},
"dependencies": {
  "vite-plugin-pwa": "^0.21.1"
}
```

No `.github/workflows` directory. Package manager: pnpm (`pnpm-lock.yaml` present).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Test | `pnpm test` | exit 0 |
| Build | `pnpm build` | exit 0 |

## Scope

**In scope**:
- `package.json` / `pnpm-lock.yaml` — move `vite-plugin-pwa` to `devDependencies`; add ESLint (+ typescript eslint) and scripts `lint`, optionally `typecheck`
- ESLint config file (flat config preferred: `eslint.config.js`)
- `.github/workflows/ci.yml` — install, lint, test, build on push/PR
- Tiny ignore patterns if needed

**Out of scope**:
- Prettier (unless ESLint setup you choose already formats and you keep it minimal)
- Changing PWA runtime behavior / manifest contents
- Dependabot / release automation

## Git workflow

- Branch: `advisor/008-eslint-ci-pwa-devdep`
- Commit message example: `Add ESLint, CI, and move vite-plugin-pwa to devDependencies`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Fix dependency placement

```bash
pnpm remove vite-plugin-pwa
pnpm add -D vite-plugin-pwa
```

Confirm `vite.config.ts` still imports it and `pnpm build` works.

**Verify**: `pnpm build` → exit 0; `vite-plugin-pwa` only under `devDependencies` in `package.json`.

### Step 2: Add ESLint

1. Add devDeps: `eslint`, `typescript-eslint` (and whatever peer versions pnpm requests).
2. Create `eslint.config.js` flat config recommending `@eslint/js` + `typescript-eslint` recommended for `**/*.{ts,js}` excluding `dist`, `node_modules`.
3. **Do not** lint `src/bang.ts` as a normal source file if it blows memory/time — exclude `src/bang.ts` explicitly (generated/vendored data).
4. Add script `"lint": "eslint ."`.
5. Fix any issues in `src/main.ts` / `src/redirect.ts` / tests with minimal code changes (no refactors).

**Verify**: `pnpm lint` → exit 0.

### Step 3: Optional typecheck script

Add `"typecheck": "tsc --noEmit"` mirroring build’s tsc step.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: GitHub Actions CI

Create `.github/workflows/ci.yml`:

- Trigger: `push` and `pull_request` to `main` (and default branch if different).
- Runner: `ubuntu-latest`
- Steps: checkout, enable pnpm (`pnpm/action-setup`), Node LTS with pnpm cache, `pnpm install`, `pnpm lint`, `pnpm test`, `pnpm build`.

**Verify**: workflow file is valid YAML; locally `pnpm lint && pnpm test && pnpm build` → exit 0.

### Step 5: Update index

Mark 008 DONE in `plans/README.md`.

## Test plan

- CI gate is the test: the three commands must pass locally.
- Do not add ESLint to bang data file.

## Done criteria

- [ ] `vite-plugin-pwa` is in `devDependencies` only
- [ ] `pnpm lint`, `pnpm test`, `pnpm build` exit 0
- [ ] `.github/workflows/ci.yml` exists and runs those commands
- [ ] `src/bang.ts` excluded from ESLint
- [ ] Scope respected
- [ ] `plans/README.md` row 008 → DONE

## STOP conditions

- ESLint forces large unrelated refactors across the app — loosen rules rather than rewriting architecture; if still stuck, STOP.
- Repo cannot use GitHub Actions (no permissions) — still add the workflow file; report that remote CI wasn’t verified.

## Maintenance notes

- When plan 009/010 add scripts under `scripts/`, include them in lint or exclude generated outputs consistently.
- Reviewers: watch for accidental Prettier/format churn beyond touched files.
