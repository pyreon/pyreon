---
'@pyreon/zero': patch
---

Dev server now renders user-provided `_404.tsx` / `_not-found.tsx` for `mode: 'ssg'` and `mode: 'spa'` apps — closes production-vs-dev drift.

**Before**: in `mode: 'ssg'` / `mode: 'spa'` apps, the dev server emitted a hardcoded `<h1>404 — Not Found</h1>` fallback on any unmatched URL, completely ignoring the user's `_404.tsx` / `_not-found.tsx`. The SSG build output (`dist/404.html`) rendered the user's component correctly with full layout chrome — but dev didn't, so developers iterating on the 404 page locally never saw what production would actually ship.

**Root cause**: the dev SSR middleware (`renderSsr`) was gated `if (config.mode === 'ssr')` (vite-plugin.ts:238). For ssg/spa modes the SSR middleware never registered, and unmatched URLs fell straight through to the `handle404` middleware — which called `render404Page(undefined)`, never reading the routes tree's `notFoundComponent`. An inline comment in `vite-plugin.ts:629` claimed "add `_404.tsx` to your routes tree (canonical pattern)" was the user-side fix, but that advice only worked in `mode: 'ssr'` because the SSR middleware was the only path that consulted the router.

**Fix**: `handle404` now delegates to `renderSsr` before falling back to the bare HTML. The router's `findNotFoundFallback` (PR L5 / M1.2) walks the routes tree, finds the deepest matching layout's `notFoundComponent`, builds a synthetic chain `[...layouts, syntheticLeaf]`, and `renderSsr` produces 404 HTML wrapped in the layout's chrome — matching what `dist/404.html` ships at build time. Works for ssr / ssg / spa modes uniformly. The bare-HTML static fallback remains for apps that genuinely ship no `_404.tsx` / `_not-found.tsx`.

For `mode: 'ssr'` apps the upstream SSR middleware is still the primary path. `renderSsr` may be called twice on a truly-unmatched URL (once by the upstream middleware, once via the `handle404` fallback). The duplicate cost is purely a no-op `resolveRoute` call that returns `matched: []` again — no extra render work.

**Bisect-verified**: reverting `handle404` to skip the `renderSsr` delegation fails the new regression tests with `expected '<h1>404 — Not Found</h1>...' to contain 'Page Not Found'` (the bare fallback's "Not Found" doesn't match the fixture's `<h1>404 — Page Not Found</h1>` from `_404.ts`). Restored → 977/977 zero tests pass + no `TEMP BISECT` remnants.

**Test coverage**: 5 new regression tests in `src/tests/integration/dev-404-ssg.test.ts`:

- uses the user's `_404` component on an unmatched URL
- emits the `_404` component WRAPPED in the layout/app chrome (doctype + html/head/body)
- known routes still serve normally (not 404)
- path with deeply-nested segments still routes through `_404`
- static-asset-shaped paths fall through (don't hit `handle404`)

No API change.
