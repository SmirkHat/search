# 014 — Suffix bangs + Kagi catalog merge

## Goal

1. Podporovat `query !bang` stejně jako `!bang query` (T3 #16, #42, PR #52, unduckified).  
2. Sloučit Kagi bang katalog s DDG při `pnpm bangs:sync` (flashbang/unduckified/bangs.fast).

## Why

Suffix je často žádaný a malý diff. Kagi katalog je aktuálnější/úplnější u některých bangů (#41).

## Scope

### In

- `extractBangTrigger` / `resolveBangRedirectUrl`: detekce suffix `(\S+)!\s*$` nebo `!\S+$` na konci; priorita: pokud je prefix i suffix, zvolit explicitní pravidlo (doporučení: **prefix vyhraje**, dokumentovat)
- Sync script: fetch Kagi bangs (JSON z `kagisearch/bangs` nebo jejich raw URL), merge by trigger — **local overrides > custom sync locals > Kagi > DDG** (nebo Kagi over DDG — zvolit a zdokumentovat; flashbang merguje s preferencí novějších)
- CI workflow (volitelně) denní `bangs:sync` + PR (jako unduckified)

### Out

- Konfigurovatelný prefix znak (samostatný plan)
- Binary bang format

## Implementation

1. Unit testy nejdřív: `!g cats`, `cats !g`, `cats !g more` (suffix jen pokud `!trigger` je poslední token)
2. Upravit `src/redirect.ts`
3. Rozšířit `scripts/sync-bangs.mjs` o Kagi source + merge
4. Spustit sync, zkontrolovat velikost hot/full

## Verification

```bash
pnpm test
pnpm bangs:sync
# manuálně: ?q=unduck%20!gh → github search
```

## Effort

M (suffix S + Kagi M) · Risk: S · Depends on: redirect tests (DONE), bangs:sync (DONE)
