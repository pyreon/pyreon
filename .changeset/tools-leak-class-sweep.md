---
'@pyreon/core': patch
'@pyreon/vue-compat': patch
'@pyreon/lint': patch
---

fix(tools): post-#725/#729/#730 leak-class sweep — vue-compat provide/createApp context-stack leaks + lint AstCache unbounded growth

Audit pass across all 12 `packages/tools/*` packages for the same patterns behind #725 (position-based pop on shared module-level stack under non-LIFO unmount), #729 (sibling-unmount LIFO violation), and #730 (refcount under-count + inflight-cache rejection). Found 3 HIGH suspects + 4 MEDIUM patterns. This PR fixes the three HIGH suspects.

### 1. `@pyreon/core` — export `removeContextFrame`

The internal identity-based stack-frame remover already existed in `packages/core/core/src/context.ts` (used by `provide()` post-#725) but wasn't exported. Compat layers and advanced consumers that call `pushContext` directly need this primitive to do safe identity-based cleanup. Now exported alongside `popContext` / `pushContext` from the package root. No behavior change for existing code — purely an additive export.

### 2. `@pyreon/vue-compat` `provide(key, value)` — context-stack frame leak (exact #725 shape)

Vue's `provide(key, value)` semantics use string/symbol keys with a key→Context registry. The vue-compat implementation pushed a Map onto Pyreon's global context stack and registered `unmountCallbacks.push(() => popContext())` — the *position-based* `stack.pop()` that #725 explicitly flagged as unsafe.

`@pyreon/core/context.ts` documents: *"The `provide()` helper does NOT use this — it uses identity-based removal via `removeContextFrame` because reactive boundaries can push snapshot frames between a component's `provide(ctx, value)` and its eventual unmount, making the top-of-stack unsafe to assume."* vue-compat bypassed that safety.

Real-app symptom: two sibling components both call `provide('K', …)`. They unmount in renderer-driven order (keyed `<For>` removing a non-last item, `<Show>` flipping a non-last sibling, route nav unmounting an outer of nested provider chains). The first-unmounted's `popContext` removed the LAST sibling's frame instead of its own; the surviving sibling's frame was orphaned at the top of the global stack forever.

Fix: capture the frame at push, register `unmountCallbacks.push(() => removeContextFrame(frame))`. Mirror of the framework's own `provide()` fix from #725.

### 3. `@pyreon/vue-compat` `createApp(C).provide(k, v).mount(el)` — app-level provisions pushed but never popped

`createApp.mount()` ran `pushContext(new Map([[ctx.id, value]]))` for each app-level provision but the returned unmount function only ran `pyreonMount`'s cleanup — leaving the app-level frames on the global stack forever, one per provision per mount cycle.

Real-app symptom: test harness or app entry calls `createApp(C).provide('A', a).provide('B', b).mount(el)` then unmounts. Two app-level frames stay on the context stack forever. SSG / re-mount cycles compound this.

Fix: track every pushed frame in a local array during `mount()`, remove each by identity (reverse order) in the returned unmount closure.

### 4. `@pyreon/lint` `AstCache` — unbounded growth in LSP / `--watch` sessions

`AstCache` (used by `lint` programmatic API, the LSP server, and `pyreon-lint --watch`) keyed by FNV-1a hash of source text with `cache: Map<string, …>` and NO eviction strategy. Each entry holds a multi-MB oxc-parsed AST + `LineIndex`. A long-running LSP session editing across many files accumulates one entry per UNIQUE content snapshot ever seen — after hours of editing, hundreds of MB of heap.

Fix: LRU bound (default 256 entries). `Map` preserves insertion order, so the first key is the least-recently-used. `get` / `set` on an existing key refresh recency by re-inserting at the tail. Apps that lint thousands of distinct files in tight succession can bump the cap via `new AstCache(2048)`.

### Regression tests + bisect

- `packages/tools/vue-compat/src/tests/provide-stack-leak-repro.test.ts` (2 specs) — `createApp().provide().mount(el); unmount()` returns the global context stack to baseline; 100 mount/unmount cycles do NOT accumulate frames. **Bisect-verified**: revert `vue-compat/src/index.ts` → both specs fail with stack-length assertions; restored → pass.
- `packages/tools/lint/src/tests/ast-cache-lru.test.ts` (5 specs) — cache never exceeds `maxEntries`, evicts LRU on overflow, `get`/`set` refresh recency, re-setting an existing key doesn't double-count, default cap is 256. **Bisect-verified**: revert `lint/src/cache.ts` → all 5 fail; restored → pass.

### Validation

- `@pyreon/core` 510/510 tests pass
- `@pyreon/vue-compat` 218/218 tests pass (+ 2 new regression specs)
- `@pyreon/lint` 639/639 tests pass (+ 5 new LRU specs)
- Lint + typecheck clean across all 3 packages
- Zero public-API breakage (`removeContextFrame` is a purely additive export)

### Audit byproducts (NOT in this PR — deliberately scoped follow-ups)

The 12-package audit also surfaced 4 MEDIUM-risk patterns documented in the audit report. Each filed-worthy as a separate small follow-up:

1. **`@pyreon/solid-compat` `createStore` per-path signal map grows unbounded** — one signal per UNIQUE read-path string. Problematic for stores with dynamic key spaces (dictionaries, pagination, logs).
2. **`@pyreon/solid-compat` `createResource` has the Class-F stale-resolution race** — `fetchPromise` overwritten on refetch with no AbortSignal; old promise's success handler still runs `setData`. Same shape as #730-charts/storage inflight-promise bug.
3. **`@pyreon/svelte-compat` ChildInstance preservation discards `unmountCallbacks` without firing them** — the cached `writable.subscribe` short-circuit doesn't re-register the unsub after the reset. Subtle; needs a targeted reproducer.
4. **`@pyreon/vite-plugin` per-instance caches (`signalExportRegistry`, `resolveCache`, `pyreonWorkspaceDirCache`, `islandRegistry`) never evict** stale entries when source files are deleted/renamed during a long `vite dev` session. Bounded by source tree size in practice, but no invalidation on file delete.

Plus 6 LOW-risk patterns (devtools `expandedIds` accumulating across panel session, lint LSP debounceTimers not cleared on didClose, svelte-compat globalThis CTX_REGISTRY, vite-plugin HMR registry never deletes, vue-compat `_contextRegistry` global map, etc.) — none real leaks in practice, all bounded by user surface.

### `pyreon doctor` baseline

Saved at `/tmp/doctor-tools-baseline.json`. 94 findings across `packages/tools/*`: 51 errors + 24 warnings + 19 infos. Top patterns: `lint/pyreon/no-window-in-ssr` (51, mostly devtools Chrome-extension false positives), `lint/pyreon/no-children-access` (10), `lint/pyreon/no-error-without-prefix` (10), `lint/pyreon/no-raw-addeventlistener` (9), `lint/pyreon/no-dom-in-setup` (7). Separate hardening pass; this PR addresses the structural bugs not caught by static lint rules.
