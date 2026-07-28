# 012 — Service Worker bang redirect (před renderem)

## Goal

Zachytit navigaci `/?q=…` ve Service Workeru a vrátit **HTTP 302** na cílovou URL **bez načtení HTML/JS stránky**. Odstranit bílý flash a stovky ms latence oproti současnému `page → main.ts → location.assign`.

## Why

Flashbang měří sub-ms lookup + SW 302. Issue T3 #141/#70: whitescreen při redirectu. Jsme PWA (`vite-plugin-pwa`) — SW už existuje, ale neřeší bang redirect.

## Scope

### In

- Rozšířit SW (Workbox custom handler nebo vlastní `importScripts` modul) o fetch handler pro navigace s `q`
- Sdílená redirect logika použitelná z SW i z `main.ts` (fallback bez SW)
- Precache / Cache Storage: `bangs-hot.json` (už máme) + custom bangs z IDB (ne localStorage — SW k LS nemá přístup)
- Po úspěšném redirectu: landing page se neukáže

### Out

- Kopírování AGPL kódu z flashbang
- Binary bang formát
- Feeling lucky / snaps
- Edge server 302 (samostatný follow-up)

## Constraints

- Vanilla Vite + existující `vite-plugin-pwa` / Workbox
- Licence: vlastní implementace (MIT)
- Custom bangs dnes v `localStorage` — pro SW je nutný **IDB mirror** (zapsat při save v UI, číst ve SW)
- Default bang + searx host taky do IDB (nebo cookie čitelné ze SW requestu — cookie už máme pro suggest/searx)

## Implementation

1. Extrahovat čistou funkci `resolveRedirect(query, ctx) → url | null` použitelnou v main thread i SW (bez `window`/`document`).
2. IDB store `smirkhat-prefs`: `{ customBangs, defaultBang, searxHost }` — sync z UI při každé změně.
3. Ve SW `fetch` handleru (navigation requests only):
   - pokud URL má `q` (nebo hash `#q=` volitelně později),
   - načti hot bang map z Cache Storage (+ full pokud trigger chybí — async, nebo jen hot + custom),
   - `Response.redirect(target, 302)`.
4. Pokud katalog ještě není v cache (první hit): `passThrough` na network → stávající page path zaregistruje SW a naplní cache.
5. Landing (`main.ts`) nechat jako fallback + UI; při `?q=` a dostupném SW by se page skoro neměla zobrazit.
6. Testy: unit na `resolveRedirect`; volitelně Playwright „SW intercepts before document“.

## Verification

```bash
pnpm test
pnpm build
# Manuálně: DevTools → Application → SW, vyhledat !gh unduck — Network ukáže 302 ze SW, ne document navigation na /
```

## Files (expected)

- `shared/redirect-core.ts` (nebo rozšířit `src/redirect.ts` o SW-safe API)
- `src/prefs-idb.ts` — mirror prefs
- SW entry / `vite.config.ts` Workbox `navigateFallback` / runtimeCaching úpravy
- `src/main.ts` — sync prefs do IDB

## Effort

L · Risk: M (SW lifecycle, cache race) · Depends on: hot catalog + custom bangs (DONE)
