---
'@pyreon/router': minor
'@pyreon/zero-content': patch
---

**Breaking (router): View Transitions are now opt-in.** A navigation no longer runs inside `document.startViewTransition()` unless you ask for it: `createRouter({ routes, viewTransition: true })` for the whole router, or `meta: { viewTransition: true }` on a route (meta merges down the matched chain, so a layout route covers its children). `meta.viewTransition: false` still opts one route out of a router that has them on. Reduced motion and `mode: 'memory'` still skip them.

Why: a transition costs every navigation that runs one. The DOM swap waits for the browser to capture the old page on the next frame, and the page is not hit-testable while the cross-fade runs (250 ms by default), so a click in that window reaches the transition overlay instead of the page. On the catalogue app (`examples/real-bench/app`, Chromium) each route change took 14–17 ms from click to the new DOM with transitions on and 0.2–1.6 ms with them off, where Solid's router takes 0.3–0.8 ms. The default path also no longer calls `matchMedia` on every navigation.

To keep the previous behaviour, pass `viewTransition: true` to `createRouter`. In a zero app, `export const meta = { viewTransition: true }` from the root `_layout.tsx`.
