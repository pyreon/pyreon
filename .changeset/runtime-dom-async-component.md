---
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
---

Async function components are now first-class on the client (parity with `renderToString`).

Before this fix, an `async function Component()` returned a Promise that mount/hydrate fed straight into `mountChild`, crashing with `Cannot read properties of undefined (reading 'ref')` because Promises have no `.props`. SSR awaited the Promise per the documented contract; the client never did. This was the root cause of the deployed `examples/docs-zero` preview crashing on every doc route — they all delegated to an async `<DocBody slug={slug} />`.

Two coordinated fixes:

**`@pyreon/runtime-server`**: brackets async-component output with `<!--$pas-->` (start) / `<!--$pae-->` (end) sentinel comments — both in `renderToString` (the SSG path) and `streamComponentNode` (the streaming path). These mark the SSR DOM range corresponding to the resolved Promise so the client knows exactly where the async subtree begins and ends. Markers nest correctly for nested async components.

**`@pyreon/runtime-dom`**:
- `mountComponent` — detects `output instanceof Promise`, inserts a placeholder comment, and mounts the resolved subtree at the placeholder once settled. Cleanup cancels pending resolution so unmount-before-resolve is safe.
- `hydrateComponent` — locates the SSR `<!--$pas-->`/`<!--$pae-->` markers (depth-tracked for nesting), advances the parent's DOM cursor past the end marker synchronously (so siblings hydrate normally), then awaits the Promise and **hydrates the resolved VNode against the SSR DOM range bounded by the markers**. This wires up events, lifecycle hooks (`onMount`), and signal subscriptions on every node of the async subtree — the part missing from the first cut, which left the SSG content visible but client-dead.
- `firstReal` recognises `$pas`/`$pae` (and the existing `k:` For-list markers) as structural — it stops at them instead of skipping like other comments.

`<Suspense>` still works for `lazy()`-style boundaries; this is the natural async-function counterpart.

Regression coverage:
- `packages/core/runtime-dom/src/tests/async-component.test.ts` — 5 mount specs.
- `packages/core/runtime-dom/src/tests/async-component-hydrate.test.ts` — 6 hydration specs covering: handlers attach on async subtree, `onMount` fires, signal-driven text patches, siblings hydrate sync, nested async (depth-tracked markers), missing-markers fallback + dev warning.

Bisect-verified: removing the SSR markers leaves the click-handler unattached and reactivity dead — all 6 hydration specs fail. Removing the mount Promise branch fails the 3 resolution specs with the documented `'ref'` TypeError.

Real-Chromium sweep: docs-zero's previously-broken `/docs/multiplatform` page now renders 23 KB of content with zero errors, TOC scroll-spy links navigate correctly, URL hashes update — proving full reactivity wired through the hydrated async subtree.
