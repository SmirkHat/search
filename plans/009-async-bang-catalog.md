# Plan 009: Shrink cold-start — async bang catalog + thin redirect entry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- src/ package.json vite.config.ts`
> Requires plans 001–005 (redirect module + Map API stable). Prefer 002–004 merged so behavior is correct before restructuring load.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/001-extract-redirect-and-tests.md through plans/005-bang-map-lookup.md
- **Category**: perf
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

`src/bang.ts` is ~2.6 MB / ~122k lines of inline data bundled into the app entry. The product pitch is “faster than DuckDuckGo,” but the **first** visit pays a huge JS download/parse cost before any redirect. Subsequent visits may be helped by the PWA plugin, but cold start and first redirect remain weak. Split the catalog from the control plane: tiny entry loads first; bang data loads as JSON (cacheable), then redirect.

## Current state

- `src/main.ts` imports `{ bangs } from "./bang"` synchronously, then redirects.
- `vite-plugin-pwa` with `registerType: "autoUpdate"` in `vite.config.ts`.
- After 005: `buildBangMap` + `resolveBangRedirectUrl(query, bangMap, defaultTrigger)`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Build | `pnpm build` | exit 0; inspect `dist/assets` sizes |
| Test | `pnpm test` | exit 0 |
| Preview | `pnpm preview` | serves `dist` |

## Scope

**In scope**:
- Convert catalog to a static JSON asset (e.g. `public/bangs.json` or `src/bangs.json` imported/fetched — prefer **fetch of `/bangs.json`** from `public/` so it is a separate cacheable file)
- Generation path: a script that converts current `src/bang.ts` → JSON **or** one-time checked-in JSON + delete/stop bundling the giant TS module
- `src/main.ts` — async boot: if `q` present, show minimal “Přesměrovávám…” (optional), await catalog, build Map, redirect; if no `q`, render landing without waiting for full catalog **if possible**, or await catalog only when default-bang UI needs validation (006) — see steps
- `vite.config.ts` — ensure Workbox/PWA precaches or runtime-caches `/bangs.json`
- `src/bang.ts` — remove from critical path (delete or replace with re-export stub used only by the generator)
- Tests for loading helper / resolve still pure

**Out of scope**:
- Automating download from DuckDuckGo (plan 010)
- Custom bangs (plan 011)
- Server-side redirect
- Truncating the bang list to a “popular only” subset as the final product (optional optimization later; not required if JSON split alone wins)

## Git workflow

- Branch: `advisor/009-async-bang-catalog`
- Commit message example: `Load bang catalog asynchronously as JSON`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Design spike (short, in-repo)

Decide and document in a brief comment at top of the loader module:

1. JSON shape: array of `{ t, u, d }` **only** (drop unused `c/r/s/sc` to shrink payload) — **preferred**.
2. Loader: `fetch("/bangs.json", { cache: "force-cache" })` → `buildBangMap`.
3. Keep a generate script: `pnpm bangs:build` reading existing data and writing `public/bangs.json`.

If stripping fields, confirm redirect only needs `t`, `u`, `d` (true for current code).

**Verify**: write `scripts/build-bangs-json.mjs` (or `.ts` run via `pnpm exec tsx`) and produce `public/bangs.json`; `node -e "JSON.parse(fs.readFileSync('public/bangs.json'))"` succeeds; file size notably smaller than 2.6 MB when stripped (expect well under ~1.5 MB; report actual size in commit message).

### Step 2: Implement `src/bangs-loader.ts`

```ts
export async function loadBangMap(): Promise<Map<string, Bang>> {
  const res = await fetch("/bangs.json");
  if (!res.ok) throw new Error(`Failed to load bangs: ${res.status}`);
  const data = (await res.json()) as Bang[];
  return buildBangMap(data);
}
```

Handle errors in `main.ts`: on failure, render landing (and optionally a Czech error line) — never leave a blank page (align with plan 004).

**Verify**: unit-test `buildBangMap` still; loader can be tested with `vi.stubGlobal('fetch', …)` in Vitest.

### Step 3: Rewire `main.ts` boot

```ts
async function main() {
  const query = new URL(window.location.href).searchParams.get("q")?.trim() ?? "";
  try {
    const bangMap = await loadBangMap();
    if (!query) {
      noSearchDefaultPageRender(bangMap); // if 006 needs map for validation
      return;
    }
    const url = resolveBangRedirectUrl(query, bangMap, localStorage.getItem("default-bang") ?? "g");
    if (!url) {
      noSearchDefaultPageRender(bangMap);
      return;
    }
    window.location.replace(url);
  } catch {
    noSearchDefaultPageRender(/* map optional */);
  }
}
main();
```

Remove synchronous `import { bangs } from "./bang"`.

**Verify**: `pnpm build` → exit 0; main JS chunk in `dist/assets/*.js` should be **much smaller** than before (order-of-magnitude). Record before/after sizes in the commit message (`du -h dist/assets/* public/bangs.json`).

### Step 4: PWA cache the JSON

In `VitePWA` options, add workbox runtime caching or `includeAssets: ['bangs.json']` / glob patterns so `/bangs.json` is cached for offline/repeat visits. Keep `registerType: "autoUpdate"`.

**Verify**: `pnpm build` succeeds; generated SW references bangs asset (grep `dist` for `bangs.json`).

### Step 5: Retire giant `src/bang.ts` from the app

- Stop importing it from app code.
- Either delete it after JSON is generated and committed, **or** keep it only as input to the generator if that is easier for 010 — but it must not be in the Vite dependency graph of `main.ts`.
- Prefer committing `public/bangs.json` so clone+build works offline without running the generator.

**Verify**: `pnpm build` ; `rg -n "from \\\"./bang\\\"" src/` → no app imports; `pnpm test` → exit 0.

### Step 6: Update index

Mark 009 DONE in `plans/README.md`.

## Test plan

- Mock `fetch` loader tests: ok JSON → Map size; HTTP error → throw.
- Existing `resolveBangRedirectUrl` tests unchanged.
- Manual: `pnpm preview`, visit `/?q=!gh+unduck` → ends on GitHub; visit `/` → landing.

## Done criteria

- [ ] App entry no longer bundles the full catalog as a TS module
- [ ] `public/bangs.json` (or equivalent) exists and is loaded via `fetch`
- [ ] Failed load shows landing, not blank page
- [ ] PWA build still works; JSON is cacheable
- [ ] `pnpm test` and `pnpm build` exit 0
- [ ] Commit message notes approximate main-chunk and JSON sizes
- [ ] `plans/README.md` row 009 → DONE

## STOP conditions

- Stripping fields breaks a bang that used another field (none today) — stop if you discover otherwise.
- PWA plugin config changes require major version bump — stop and report rather than upgrading Vite/PWA casually.
- Plans 001–005 not present — STOP.

## Maintenance notes

- Plan 010 should overwrite the same JSON path the loader reads.
- Reviewers: watch for redirect race (don’t render landing flash before redirect on success — OK to delay paint until fetch resolves for `?q=` navigations).
- First visit still downloads JSON once; that is expected and still better than parsing a 2.6 MB JS module graph tied to the entry.
