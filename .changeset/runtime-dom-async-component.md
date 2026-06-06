---
'@pyreon/runtime-dom': patch
---

Async function components are now first-class on the client (parity with `renderToString`).

Before this fix, an `async function Component()` returned a Promise that mount/hydrate fed straight into `mountChild`, crashing with `Cannot read properties of undefined (reading 'ref')` because Promises have no `.props`. SSR awaited the Promise per the documented contract; the client never did. This was the root cause of the deployed `examples/docs-zero` preview crashing on every doc route — they all delegated to an async `<DocBody slug={slug} />`.

The fix: when `mountComponent` sees a Promise output, insert a placeholder comment, then mount the resolved subtree at the placeholder once the Promise settles. `hydrateComponent` gets a sibling fix — the SSR HTML for the resolved subtree was already baked by `renderToString`, so hydration just leaves it standing and resolves the Promise in the background to settle any reactive side effects.

`<Suspense>` still works for `lazy()`-style boundaries; this path is the natural async-function counterpart for ad-hoc async data loading in a route component. The previous dev warning ("Components must be synchronous — use lazy() + Suspense for async loading...") is removed.

Regression-locked at `packages/core/runtime-dom/src/tests/async-component.test.ts` (5 specs): resolves-after-mount, null resolve, cleanup-before-resolve, rejection logged without crash, nested async-under-sync. Bisect-verified — reverting the Promise branch in `mount.ts` fails the 3 resolution specs with the exact `Cannot read properties of undefined (reading 'ref')` TypeError.
