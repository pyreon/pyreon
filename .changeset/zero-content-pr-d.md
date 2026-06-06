---
'@pyreon/zero-content': minor
---

PR-D audit — search correctness. Seven items, 13 new bisect-verified specs.

**C7** — index leaks fixed.
- Frontmatter YAML block (`---...---`) stripped from `body` before indexing. Pre-fix ~12 KB on docs-zero shipped to the client untouched.
- Heading text is no longer double-indexed (was in both the dedicated `headings` field AND embedded in `body`). Saves ~26 KB on docs-zero.

**C8** — `useSearch` subscriber cleanup.
- Pre-fix `debounced.subscribe(() => ...)` never disposed. Every `useSearch()` call accumulated a subscriber that outlived the component. Now query/open/debounced unsubscribes are all returned from the `onMount` cleanup.

**H9** — MiniSearch instance refcounted; redundant computed collapsed.
- The module-level `_instance` is now reference-counted via `acquireSearchInstance()` — when the last `useSearch` consumer unmounts, the cache is released so an SPA without a persistent `<Search>` reclaims ~200 KB.
- `loadSearchIndex` now caches keyed by `catalogUrl` (a URL change triggers a rebuild).
- The duplicate `_results: signal + results: computed` pattern collapsed to one `computed` since the inner signal was just being unwrapped.

**M20** — `<RouterLink>` instead of `<a href>` on result rows.
- Pre-fix every result click triggered a full page reload because the `<a href>` bypassed Pyreon's router. SPA-navigates now; `state.close()` runs before the navigation push so the dialog doesn't flicker across the route change.

**M21** — focus management.
- Capture the previously-focused element on open; restore on close (via Cmd+K, Esc, or Close button). Auto-focus the search input on open via a `queueMicrotask` after the dialog mounts.

**M22** — `minQueryLength` option.
- `UseSearchOptions.minQueryLength` and `SearchProps.minQueryLength` default to `2`. Single-character queries hit too broad a result set on docs-sized corpora; the floor cuts wasted MiniSearch passes.

**M23** — `searchBodyMax` configurable.
- `ContentPluginOptions.searchBodyMax` (default `1500`, accepts `Infinity` to disable truncation) replaces the previously-hardcoded magic constant. Documents the trade-off in the JSDoc.

Regression coverage: `_search-correctness.test.tsx` — 13 specs across H9/M22/M23/M20/C8; `index-builder.test.ts` updated for C7 (heading-line drop + frontmatter strip + malformed-frontmatter graceful).

Total: 427 specs pass (was 412 in PR C).
