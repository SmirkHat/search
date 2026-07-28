# SmirkHat Search

Hledej s bangy přímo na stránce, nebo si SmirkHat Search nastav jako vyhledávač v prohlížeči. Součást [SmirkHat.org](https://smirkhat.org).

Deploy: **Vercel** (static Vite app + Edge Function `/api/ac`).

## Použití

1. Otevři stránku a hledej — `!gh smirkhat`, suffix `smirkhat !gh`, snap `@w quantum`.
2. Nastav výchozí vyhledávač v pickeru (včetně **Google Web / bez AI**).
3. Volitelně přidej vlastní bangy, změň znak bangu, zapni historii, nebo sdílej nastavení odkazem (`#share=…`).
4. Do prohlížeče:

| Účel | URL |
|------|-----|
| Vyhledávání | `https://<tvůj-host>?q=%s` (v UI se doplní aktuální doména) |
| Návrhy (autocomplete) | `https://<tvůj-host>/ac?q=%s` |

Produkce: [search.smht.eu](https://search.smht.eu). OpenSearch používá relativní cesty, funguje na libovolné doméně.

Autocomplete (`/ac` → `/api/ac`) používá upstream podle zvoleného vyhledávače; při bang prefixu nabídne triggery (frecency + hot katalog). Redirect: **Edge** `/api/go` (cold start) → **SW 302** (opakované) → page fallback.

Repo: [github.com/SmirkHat/search](https://github.com/SmirkHat/search).

## Vývoj

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

Obnovení katalogu bangů (DuckDuckGo + Kagi, local overrides vyhrají):

```bash
pnpm bangs:sync
```

Lokální override v sync scriptu: `t3`, `gweb`, `npmx`, searx, … Katalog: `bangs-hot.json` (~top 500 podle DDG popularity) se načte hned; plný `bangs.json` až při neznámém bangu (nebo na pozadí). Cache: IndexedDB + Cache Storage (SW) + HTTP; prefs (custom bangs / default / searx / frecency) jsou v IDB kvůli SW.

Založeno na myšlence projektu [Unduck](https://github.com/t3dotgg/unduck) 🤠
