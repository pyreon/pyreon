---
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
'@pyreon/vue-compat': patch
'@pyreon/solid-compat': patch
'@pyreon/svelte-compat': patch
'@pyreon/core': patch
'@pyreon/compiler': patch
---

Compat-layer `lazy()` / `defineAsyncComponent()` now take part in the SSR lazy contract: `renderToString` and `renderToStream` wait for a still-loading chunk (via `__load`) instead of rendering nothing or the `<Suspense>` fallback, and hydration adopts the server content.

- The compat `jsx()` runtimes wrapped a lazy component, hiding `__loading` / `__load` behind the wrapper — `<Suspense>` never showed its fallback on the client and the server could not see a pending chunk. Compat lazies are now marked `nativeCompat`.
- `@pyreon/react-compat` and `@pyreon/preact-compat` previously re-exported `@pyreon/core`'s `lazy`, which mounts the loaded component raw: a lazily-loaded component using hooks threw "Hook called outside of a component render". Their `lazy` now mounts it through the compat wrapper, like `jsx()` does.
- `@pyreon/solid-compat`'s `lazy` and `@pyreon/vue-compat`'s `defineAsyncComponent` expose `__load` (settles, never rejects) and keep their load-on-first-use semantics.
- `@pyreon/vue-compat`'s `<Suspense>` renders core's `Suspense` as a child vnode instead of calling it, so the server recognises the boundary.
- `@pyreon/core`'s `Suspense` is marked `nativeCompat`, so react/preact/vue-compat's `jsx()` no longer wraps it (solid/svelte-compat already routed it natively).
- solid/svelte-compat's component wrapper forwards `__load` alongside `__loading`, so a core `lazy()` reaching it is still waited for on the server.
- `@pyreon/compiler`: a diagnose-catalog entry for "Hook called outside of a component render" pointing at a core `lazy()` used in a compat app.
