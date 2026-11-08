---
'@pyreon/zero': patch
---

Routes whose mode resolves to `'ssg'` are now prerendered in every hybrid build, however that mode was reached.

With `mode: 'auto'`, or with a `routeRules` entry declaring `'ssg'`, the build's mode table printed `○ ssg` for a route but no HTML was written for it, so production served it with SSR. The prerender pass only ran when some route file contained a literal `export const renderMode = 'ssg'`. It now uses the same per-route resolver as the mode table (page > layout > `routeRules` > inference > app mode).

Also fixed on the way:

- Under `mode: 'auto'`, a `routeRules` entry or a parent `_layout`'s `renderMode` now beats the inferred mode, as documented. The inference was stamped onto the page as if the page had declared it, so it outranked both.
- `mode: 'auto'` picks the server pipeline when a `_layout` declares `'ssr'` or `'isr'` over pages that would otherwise infer `'ssg'`.
- The missing-`getStaticPaths` warning no longer fires for a dynamic route whose resolved mode is not `'ssg'` (a hybrid app's server-rendered routes, a layout-declared mode, an inferred `'ssr'`).
- A second build in the same process (a programmatic or test build) no longer prerenders with the first build's routes.
