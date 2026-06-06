---
'@pyreon/zero-content': patch
---

PR-B audit C2 — kill the 2× markdown pipeline pass.

Pre-fix the markdown pipeline ran TWICE per SSG build:
1. Once for the outer client build's `transform` hook.
2. Once for the SSG inner SSR sub-build's `transform` hook.

Both invocations have their own plugin instance, so per-instance state couldn't bridge them — but they share the same Node process. A module-level cache keyed on `(id, FNV-1a(code), FNV-1a(opts))` survives across plugin-instance boundaries within the process, so the second transform skips remark + Shiki + esbuild entirely.

**Measured wall-clock impact on `examples/docs-zero` (93 docs pages):**
- Baseline (cache off): 13.21s
- With cache (cache on): 8.75s
- **~34% faster** on every SSG build.

Cache mechanics:
- LRU bound at 4096 entries (effectively unbounded for normal docs sites).
- HMR / content changes invalidate naturally (FNV-1a key shifts).
- Theme swaps in `content.config.ts` invalidate (the `highlighter` opts shape changes).
- Search-index population on cache-hit path: re-stashes only when the collection+slug entry is absent (the outer build's `searchEntries` populates once; the inner SSR build's map is discarded anyway).

Regression coverage: `_compile-cache.test.ts` — 8 specs covering:
- Public `_resetCompileCacheForTesting` helper exists + is callable.
- Plugin instance memoises identical input (cache HIT skips `compileMarkdown`).
- Cache invalidates on content change (cache MISS triggers re-compile).
- **Cross-instance sharing** — the SSG outer→inner SSR scenario: a second `content()` plugin instance hits the cache populated by the first.
- Opts difference invalidates (`highlight: false` → `highlight: true` re-compiles).
- Pipeline is byte-stable on repeat compiles (cache safety).
- Content change → different output.
- ID change → different slug.

Bisect-verified: reverting `plugin.ts:transform`'s cache HIT branch fails 3 of the 6 plugin-level specs (cache-helper test + pipeline-idempotency specs still pass since they don't depend on the plugin).
