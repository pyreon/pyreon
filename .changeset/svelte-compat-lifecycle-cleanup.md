---
'@pyreon/svelte-compat': patch
---

fix(svelte-compat): re-attach onMount-cleanup + onDestroy after a parent re-render (lifecycle leak)

`onMount`'s returned cleanup and `onDestroy`'s callback were pushed into `ctx.unmountCallbacks` only on first render (hook-indexed gate). When a parent re-render preserved the ChildInstance, the wrapper resets `ctx.unmountCallbacks = []` (jsx-runtime.ts) and the child re-ran the hooks on the cached path — which did nothing, so the cleanups were dropped from the array and never ran on final unmount. An `onMount` that opened a resource (subscription/listener/timer) leaked it for the component's lifetime; `onDestroy` never fired.

The cleanup callback is now stored in the hook slot and re-pushed into `unmountCallbacks` on the cached re-render path (`includes()`-guarded) — the lifecycle sibling of the #739 `writable.subscribe` re-push. Bisect-verified: `tests/lifecycle-cleanup-leak-repro.test.ts` (post-reset `unmountCallbacks.length` is 0 pre-fix, 2 post-fix; onDestroy fires on unmount). 56/56 existing tests pass.
