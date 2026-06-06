---
'@pyreon/zero-content': patch
---

Fix two long-standing bugs in `@pyreon/zero-content`:

1. **Search broken on subpath deploys** — `buildSearchIndex` hardcoded `url: "/search-index-X.json"` in the catalog, so a site deployed under `/<base>/` fetched from `https://host/search-index-X.json` (404) instead of `https://host/<base>/search-index-X.json`. The runtime `loadSearchIndex()` had the same bug — defaulted to `/search-index.json` regardless of `base`. Fixed:
    - `BuildIndexArgs` accepts a new optional `base` field; emitted catalog URLs are prefixed.
    - `loadSearchIndex()` default now derives from `import.meta.env.BASE_URL` (the standard Vite global), so consumers don't need any explicit configuration.
    - `@pyreon/zero` passes the resolved Vite `base` from `configResolved` into `buildSearchIndex` automatically.

2. **Copy button missing `data-copied` attribute** — the `<CodeBlock>` copy button flipped its TEXT between "Copy" and "Copied" but exposed no DOM attribute for the copied state, so consumers couldn't style the confirm visual via CSS. Now emits `data-copied="true"` (or omits it) reactively.
