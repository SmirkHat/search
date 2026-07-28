# Plan 007: Align README search URL with deployed host

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat bf165ef..HEAD -- README.md src/main.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `bf165ef`, 2026-07-26

## Why this matters

The README still tells users to add `https://unduck.link?q=%s`, while the landing page (this fork’s deployed product) shows `https://unduck.smht.eu?q=%s`. Stale docs send users to the wrong host.

## Current state

`README.md:5-7`:

```
https://unduck.link?q=%s
```

Also mentions `https://unduck.link` in the “How is it that much faster?” section (`README.md:13`).

`src/main.ts` landing input value: `https://unduck.smht.eu?q=%s`.

This repo’s remote is `https://github.com/danielsebesta/unduck` (fork of t3dotgg/unduck).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Grep check | `rg -n 'unduck\\.link|unduck\\.smht\\.eu' README.md src/main.ts` | README and UI agree on the public search URL |

## Scope

**In scope**:
- `README.md` only

**Out of scope**:
- Changing the live hostname in `src/main.ts` (UI is source of truth for this fork unless operator says otherwise)
- Rewriting the whole README into Czech
- Updating GitHub “Zdrojový kód” footer link

## Git workflow

- Branch: `advisor/007-align-readme-url`
- Commit message example: `Point README search URL at unduck.smht.eu`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Update README URLs

1. Replace the custom search engine URL with `https://unduck.smht.eu?q=%s`.
2. In the caching explanation sentence, replace `https://unduck.link` with `https://unduck.smht.eu`.
3. Keep the rest of the English README as-is unless a sentence becomes factually wrong.
4. Optional one-line note that this fork is hosted at smht.eu (only if it fits naturally — do not write an essay).

**Verify**:

```bash
rg -n 'unduck\.link' README.md
```

→ no matches.

```bash
rg -n 'unduck\.smht\.eu' README.md src/main.ts
```

→ both files mention `unduck.smht.eu`.

### Step 2: Update index

Mark 007 DONE in `plans/README.md`.

## Test plan

- Docs-only; grep verification above is sufficient.

## Done criteria

- [ ] README search URL matches `src/main.ts` landing URL host
- [ ] No remaining `unduck.link` in `README.md`
- [ ] Scope respected
- [ ] `plans/README.md` row 007 → DONE

## STOP conditions

- Operator states the canonical public URL is still `unduck.link` or something else — STOP and ask; do not guess.
- `src/main.ts` URL was changed to yet another host since planning — align README to whatever the landing page currently shows, and mention the drift in the commit message.

## Maintenance notes

- If the deploy host changes again, update README and landing input together in one commit.
