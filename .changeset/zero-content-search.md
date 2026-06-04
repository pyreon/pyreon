---
'@pyreon/zero-content': minor
---

zero-content PR 5: built-in search — minisearch index builder + `<Search>` runtime component.

The fifth piece of the markdown-driven Pyreon docs story. Adds a complete search layer: build-time index emission + lazy client-side loading + a default `<Search>` overlay with Cmd+K + debounced query + SPA navigation.

Layers shipped:

- **Index builder** (`src/search/index-builder.ts`) — `buildSearchIndex({ config, entries, root, outDir })` walks every searchable collection (defaults: `pages` searchable, `data` not — overridable via `searchable: true | false` on the collection definition), strips markdown body to plain prose, emits one `search-index-<collection>.json` per collection + a catalog `search-index.json` at the dist root. Chunked at 300 KB warn threshold, 1 MB error threshold (both overridable).
- **Markdown body stripper** (`stripMarkdown`) — removes fenced code, inline code, HTML tags, link URLs (keeps link text), heading markers, emphasis markers, then collapses whitespace. Fast O(n) regex pass; good enough for the indexer's needs.
- **Search runtime** (`src/search/search-runtime.tsx`) — `loadSearchIndex(catalogUrl?, fetchFn?)` fetches the catalog + every per-collection chunk + merges them into one shared `MiniSearch` instance. Idempotent at module scope — repeat calls share one in-flight `Promise`. `useSearch({ catalogUrl, debounceMs, maxResults, fetchFn })` is the headless state hook. `<Search />` wraps it with Cmd+K (or Cmd+/) keyboard shortcut + Esc-to-close + a `<dialog>` overlay + result list with click-to-navigate.
- **A11y** — `<search>` landmark, `<dialog open aria-modal>` panel, `aria-label` on search input, semantic close button.

29 new specs across `src/tests/index-builder.test.ts` (22) and `src/tests/search-runtime.test.ts` (7).

366/366 specs passing. 11/11 validate-fast gates. typecheck + lint clean.

**Plugin integration deferred to PR 7** (docs-pyreon spike). The current PR ships the public APIs (`buildSearchIndex`, `loadSearchIndex`, `useSearch`, `<Search>`); the spike will drive the build-time collection-walking integration shape inside the Vite plugin's `closeBundle` hook — letting real-app shape inform the contract rather than guessing now.
