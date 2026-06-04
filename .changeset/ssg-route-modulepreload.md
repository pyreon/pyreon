---
"@pyreon/zero": minor
---

feat(zero): SSG injects per-route `<link rel="modulepreload">` (islands-safe) — closes #1355

Vite already modulepreloads the single ENTRY's static graph, and the SSG
pipeline preserves those links — but a route's own component chunk is
lazy-imported, so the browser discovers it LATE in the network waterfall
(each chunk only after the previous one parses). SSG now pre-declares the
**per-route delta** in each prerendered page's `<head>`: the matched route
chain's chunk(s) + their STATIC import closure, minus the entry graph the
template already loads. The browser fetches the whole route graph in parallel
from t=0.

**Islands-safe by construction — the load-bearing constraint.** The closure
follows only the Vite manifest's `imports` (static), NEVER `dynamicImports`.
A route's `dynamicImports` are exactly the chunks the author DEFERRED — islands
(`hydrate: 'never' | 'visible' | …`), `lazy()` components, heavy-module-in-handler.
Preloading those would pull deferred code onto the first-paint critical path and
defeat the islands model (a net perf regression). Following only `imports`
structurally excludes them — verified end-to-end: an `island-demo` route's own
chunk + the `island()` runtime are preloaded, but the deferred `IslandProbe`
component chunk never is.

- Default-on in `mode: 'ssg'`. Opt out with `zero({ ssg: { modulePreload: false } })`.
- Enables Vite's `build.manifest` on the client build; the manifest is read +
  deleted post-build (internal artifact, never shipped to the host — unless the
  user enabled the manifest themselves, in which case it's left alone).
- Degrades gracefully at every step: a missing/malformed manifest or an
  unresolvable route just yields no preload for that path. `modulepreload` is a
  non-load-bearing hint, so the page always still works.

Gated by `verify-modes` (ssr-showcase × ssg): per-route delta present, per-route
specificity (home page does NOT preload the about chunk), the IslandProbe chunk
NEVER appears in any modulepreload (bisect-verified — making the closure follow
`dynamicImports` fails the gate), and the build manifest is cleaned up. Plus 19
unit specs over the resolver. Font preload was already shipped (`font.ts`); this
PR is modulepreload only.
