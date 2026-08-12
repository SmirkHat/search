# SmirkHat Search

Bang search for [SmirkHat.org](https://smirkhat.org).

- Production: [search.smht.eu](https://search.smht.eu)
- Repo: [github.com/SmirkHat/search](https://github.com/SmirkHat/search)
- Hosting: Vercel (static Vite app + `/api/ac`, `/api/go`)

## Usage

```text
!gh smirkhat
smirkhat !gh
@w quantum
```

In settings you can change the default engine, custom bangs, and bang prefix.

| Purpose | URL |
|---------|-----|
| Search | `https://<host>?q=%s` |
| Suggestions | `https://<host>/ac?q=%s` |

OpenSearch uses relative paths, so any domain works.

## Development

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

Refresh the bang catalog (DuckDuckGo + Kagi; local overrides win):

```bash
pnpm bangs:sync
```

`bangs-hot.json` (~top 500) loads first; full `bangs.json` loads on demand. Prefs and frecency live in IndexedDB for the service worker.

Based on [Unduck](https://github.com/t3dotgg/unduck).
