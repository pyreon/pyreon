---
"@pyreon/unistyle": patch
---

perf: cut per-render allocations on the responsive-styles hot path

Three allocation reductions on the `makeItResponsive` → `styles()` → `stripUnit()`
path that runs on every styled/PyreonUI component render (× breakpoint × property
× side). Behavior-identical (341 tests unchanged):

- **`stripUnit`**: hoist the CSS-unit `RegExp` literal out of the function body to
  module scope. It sat inside the most-executed leaf in the engine, so a fresh
  `RegExp` was allocated on every call — thousands of throwaway objects per page
  render. No `g`/`y` flag, so a shared instance is safe under `.match`.
- **`makeItResponsive`**: defer the `...restTheme` rest-spread (a shallow copy of
  the entire provider theme — colors/space/fonts/radii/…) behind a lazy getter.
  It was built unconditionally *before* the rendered-cache-hit early return, so a
  cache hit — the steady-state path the cache exists to keep cheap — paid for a
  full large-object copy it never used.
- **`styles()`**: memoize the three curried unit factories (`calc`/`edge`/
  `borderRadius`) by `rootSize` in a single-slot module cache. They depend only on
  `rootSize` (effectively constant) yet were rebuilt on every call.

Structural/allocation wins on the hot path; not a wall-clock-benched change.
