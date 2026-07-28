# 013 — Bang-aware omnibox suggestions

## Goal

Když uživatel v adresním řádku píše `!y…`, `/ac` nabídne bang triggery (`!yt`, `!ya`, …), ne jen webové suggesty. Ranking: prefix match → personal frecency → DDG `r` popularita.

## Why

Flashbang to uvádí jako unikátní feature. Issue T3 #31 (suggestions). Máme silný multi-engine `/ac`, ale při bang prefixu je engine suggest irelevantní.

## Scope

### In

- Detekce v `api/ac.ts` / `vite-ac-proxy.ts` / sdílené logice: pokud `q` začíná bang prefixem (`!` default), vrať OpenSearch JSON s bang návrhy
- Zdroj: hot katalog (+ custom bangs z cookie/query pokud možné) — na Edge runtime nelze číst IDB; použít:
  - query param / cookie se seznamem top custom triggers, NEBO
  - statický hot katalog na edge + custom jen po hydrataci (omnibox jde přes server)
- Frecency: počítadlo v IDB na klientu; pro omnibox posílat top-N v cookie (kompaktní `g:50,yt:30` jako flashbang — vlastní formát)
- Zachovat stávající engine suggest pro dotazy bez bang prefixu

### Out

- Plné flashbang `/suggest` s favicony (firefox `google:suggestdetail`) — fáze 2
- Snaps (`@`)

## Implementation

1. `shared/bang-suggest.ts`: `suggestBangs(query, catalog, frecency) → string[]`
2. V `fetchUpstreamSuggestions` / ac handler: branch na bang mode
3. Cookie `bang-frecency` aktualizovat při redirectu (main thread teď; později SW)
4. Testy na ranking a empty/partial prefix

## Verification

```bash
pnpm test
curl 'http://localhost:5173/ac?q=!y'   # očekávej !yt, !ya, …
curl 'http://localhost:5173/ac?q=praha' # stávající engine suggest
```

## Effort

M · Risk: S · Depends on: `/ac` (DONE), hot catalog (DONE) · Ideal after: 012 (SW může bumpovat frecency)
