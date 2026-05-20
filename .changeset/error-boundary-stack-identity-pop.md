---
'@pyreon/core': patch
---

fix(core): ErrorBoundary stack cleanup now removes the right handler when siblings unmount out-of-order (#725 sibling fix)

`ErrorBoundary` pushed its error handler onto a module-level `_errorBoundaryStack` at setup and registered `onUnmount(() => popErrorBoundary())`. `popErrorBoundary()` was `stack.pop()` — position-based. That assumed strict LIFO between push and pop, **but sibling boundaries can unmount in any order driven by the renderer**: keyed `<For>` removing a non-last item, `<Show>` flipping the first of several siblings, route nav unmounting an outer of nested routes, etc.

**Symptom**: when a non-last sibling boundary unmounted, its `onUnmount` popped the LAST boundary's handler instead of its own. The surviving (innermost) boundary's handler was removed from the stack; the unmounted boundary's stale handler was orphaned at the top. A subsequent throw in the surviving boundary's children dispatched to the orphan handler — `error.set(err)` on a disposed signal is a no-op, so the error was **silently swallowed** AND the surviving boundary's fallback never rendered. Same root-cause class as #725 (`provide()` / `popContext()`).

**Fix**: `popErrorBoundary(handler)` accepts the handler reference and removes by IDENTITY via `lastIndexOf + splice` — robust to "wrong handler on top" regardless of unmount order. `ErrorBoundary`'s `onUnmount` now passes its own handler. Back-compat: `popErrorBoundary()` (no-arg) still does `stack.pop()` for direct callers (tests, advanced consumers).

Regression tests in `packages/core/runtime-dom/src/tests/error-boundary-stack-leak-repro.test.tsx` — bisect-verified: reverting `component.ts` + `error-boundary.ts` → the FIRST-unmounted-sibling spec fails with `AssertionError: expected null to be truthy` (the surviving boundary's fallback never appears because the throw is routed to the orphan). Restored → 2/2 pass. All 2,458 tests across the 7 core packages pass with the fix.

Discovered while sweeping core packages for #725-class bugs (position-based cleanup of shared module-level state). The audit also surfaced 3 lower-risk patterns (router refcount idempotency, router preload bypassing LRU cache contract, unused `_scrollPositions` field) — all fileable as separate follow-ups.
