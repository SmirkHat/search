# Roadmap: nejrychlejší bang search se všemi features

Datum: 2026-07-27  
Zdroje: [T3-Content/unduck](https://github.com/T3-Content/unduck) issues/PR (#100 a související),  
[ph1losof/flashbang](https://github.com/ph1losof/flashbang), [taciturnaxolotl/unduckified](https://github.com/taciturnaxolotl/unduckified),  
[mynameistito/cf-unduck](https://github.com/mynameistito/cf-unduck), [kristianvld/bangs.fast](https://github.com/kristianvld/bangs.fast),  
[Void-n-Null/rebang](https://github.com/Void-n-Null/rebang), [MrPancakes39/re-search](https://github.com/MrPancakes39/re-search),  
aktuální SmirkHat Search (`/workspace/unduck`).

**Licence:** Flashbang je **AGPL-3.0** — kopírovat kód přímo do MIT forku nelze. Bereme **architekturu a nápady**, implementace musí být vlastní.

---

## Co lidi chtějí (T3 unduck issues / PR)

Seřazeno podle engagementu a opakování:

| Poptávka | Signal | Stav u nás |
|----------|--------|------------|
| Volitelný default engine (ne jen Google) | #6, #35, #114, PR #38/#59/#83/#120 | ✅ máme |
| Custom bangy / custom engines | #8, #118, PR #8/#120 | ✅ máme (+ jméno, %s, picker) |
| Autocomplete / suggestions | #31 | ✅ máme multi-provider `/ac` |
| OpenSearch | #9, #17, PR #9/#126 | ✅ (+ relativní cesty) |
| Prázdný bang → homepage (`!gh`) | #56, #82, PR #55 | ✅ máme |
| O(1) lookup / hashmap | #63, PR #11/#65 | ✅ `Map` + hot/full katalog |
| Suffix bangy (`query !gh`) | #16, #42, PR #52 | ✅ máme |
| Feeling lucky | #22, PR #76 | ✅ máme |
| Kagi bang katalog | #41 | ✅ DDG + Kagi merge |
| Whitescreen / pomalý redirect | #70, #141 | ✅ SW 302 + Edge `/api/go` |
| Browser extension | #130 | ❌ oddělený projekt |
| Dark mode | #69 | ✅ system theme |
| Bang browser (`!` za slovem) | #16, #42 | ✅ suffix + konfigurovatelný prefix |

---

## Co už máme lepší než většina forků

- Multi-engine **suggest** (Google, DDG, Brave, Bing, Seznam, Searx, Swisscows, …) s fallbackem
- **SearxNG** picker + vlastní instance
- Česká UI + SmirkHat brand
- Hot/full bang split (rychlý first paint)
- Custom engines v dropdownu

---

## Co si vypůjčit (priorita)

### P0 — Rychlost (největší gap vs flashbang)

**Service Worker redirect před renderem** (flashbang, částečně bangs.fast / cf-unduck)

- Dnes: request → HTML → JS → `location.assign` (stovky ms + bílý flash)
- Cíl: SW zachytí `/?q=…` a hned vrátí **302** z lokálního katalogu (~1 ms lookup)
- Fallback: první návštěva bez SW = stávající page path; po instalaci SW = instant
- Bonus z cf-unduck: edge 302 na Vercel Edge pro cold start (volitelné)

**Bang-aware omnibox suggestions** (flashbang USP)

- `/ac?q=!y` → navrhuje `!yt`, `!ya`, … podle katalogu + frekvence
- Stávající engine suggest nechat pro běžný text; při `!` prefixu přepnout na bang suggest
- Frecency (počítadlo použití bangů v IDB) — flashbang/unduckified

### P1 — Feature parity s top forky

| Feature | Vzor | Poznámka |
|---------|------|----------|
| Suffix bangy | unduckified, flashbang, PR #52 | `kočky !g` i `!g kočky` |
| Kagi + DDG merge + denní CI | flashbang, unduckified, bangs.fast | už máme `pnpm bangs:sync` — rozšířit o Kagi |
| Feeling lucky (`\query` nebo `!!`) | flashbang, PR #76 | provider dle default engine |
| Share/export settings URL | bangs.fast | base64 prefs v hash/query |
| Dynamic OpenSearch origin | flashbang | relativní už máme; volitelně edge XML |

### P2 — Nice-to-have (unduckified polish)

- Lokální search history (opt-in) — unduckified / cf-unduck
- Snaps (`@w query` = site:wikipedia) — flashbang; velké UX, střední komplexita
- Konfigurovatelný bang prefix (`!` / `$` / …) — flashbang, PR #49
- Extension (Chrome) — issue #130; oddělený projekt
- Sounds/animations — **nebrat** (odporuje našemu minimalismu)

### Nebrat / opatrně

- AGPL kód z flashbang (jen nápady)
- Analytics (re-search má analytics lib — my ne)
- Těžký React rewrite (flashbang/rebang/cf-unduck) — zůstat vanilla Vite, pokud SW stačí

---

## Doporučené pořadí implementace

```
01 SW redirect (P0)          ← největší win na „nejrychlejší“
02 Bang-aware /ac suggest    ← unikátní feature v omniboxu
03 Suffix bangs              ← často žádané, malé
04 Kagi catalog + CI         ← bohatší bangy
05 Feeling lucky             ← nice
06 Settings export/share     ← multi-device
07 (optional) Snaps / history / edge 302
```

Detailní handoff plány:

- `plans/012-sw-bang-redirect.md` — Service Worker 302
- `plans/013-bang-aware-suggest.md` — omnibox bang suggestions + frecency
- `plans/014-suffix-bangs-and-kagi.md` — suffix + Kagi sync

---

## Srovnání forků (zkratka)

| | SmirkHat (teď) | flashbang | unduckified | cf-unduck | bangs.fast |
|--|----------------|-----------|-------------|-----------|------------|
| Redirect path | page+JS | **SW 302** | page+JS | edge+SPA | SW |
| Custom bangs | ✅ | ✅ | ✅ | ✅ | ✅ |
| Default engine | ✅ | ✅ | ✅ | ✅ | ✅ |
| Omnibox AC | engine only | **bang-aware** | upstream only | DDG proxy | ? |
| Multi suggest | **✅ silné** | multi | slabé | DDG | — |
| Searx | **✅** | — | — | — | — |
| Kagi bangs | — | ✅ | ✅ | ✅ | ✅ |
| Suffix | — | ✅ | ✅ | ✅ | ? |
| Lucky | — | ✅ | — | — | — |
| Licence | MIT | AGPL | MIT | MIT | MIT |

---

## Verdict

Abychom byli **nejrychlejší** a měli **všechny klíčové features**, stačí tři tahy:

1. SW redirect (flashbang architektura, vlastní kód)  
2. Bang-aware suggest do `/ac`  
3. Suffix + Kagi catalog  

Zbytek (lucky, share, snaps, history) je pak dohánění UX, ne kritická cesta.
