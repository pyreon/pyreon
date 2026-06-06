---
'@pyreon/zero': patch
---

fix(zero): propagate user plugins into SSR inner build (was hardcoded)

`buildSsrBundle` previously hardcoded the inner SSR sub-build's plugin
chain to `[pyreon(), zeroPlugin()]` only. This meant any non-zero Vite
plugin in the outer config — most importantly `@pyreon/zero-content`'s
`content()` plugin which transforms `.md` → `.tsx` and serves
`virtual:zero-content/*` modules — was NOT available during the SSG
path-enumeration + per-page render passes.

Symptom: a route file that imports from a content collection (or any
file type a user plugin handles) crashed the SSG inner build with:
- `Cannot assign to this expression` on every `.md` file (Rolldown tried
  to parse markdown as JavaScript because the content plugin wasn't there
  to transform it)
- `Failed to resolve import "virtual:zero-content/collections"` when a
  route imported the virtual collection registry

Fix: both `ssgPlugin` and `ssrPlugin` now capture `resolved.plugins`
from `configResolved` and forward them to `buildSsrBundle` via a new
`userPlugins` field on `BuildSsrBundleOptions`. The helper filters out
the precise plugin names the inner build re-adds itself (the main
pyreon-zero set + pyreon-vite-plugin) using an explicit allowlist —
not a prefix match, which would incorrectly drop `pyreon-zero-content`
and similar third-party plugins that share the `pyreon-zero-` prefix.

Discovered while migrating the legacy VitePress docs to docs-zero —
the `getStaticPaths` enumeration in the catch-all docs route needed
to read the content collection at build time and failed because the
content plugin was absent from the inner build.
