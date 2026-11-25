---
'@pyreon/core': patch
'@pyreon/elements': patch
'@pyreon/head': patch
'@pyreon/kinetic': patch
'@pyreon/preact-compat': patch
'@pyreon/react-compat': patch
'@pyreon/rocketstyle': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
'@pyreon/server': patch
'@pyreon/solid-compat': patch
'@pyreon/store': patch
'@pyreon/styler': patch
'@pyreon/svelte-compat': patch
'@pyreon/testing': patch
'@pyreon/ui-core': patch
'@pyreon/unistyle': patch
'@pyreon/vue-compat': patch
'@pyreon/zero': patch
---

Pin every edge to another package's internals exactly. A package whose shipped code imports `@pyreon/x/internal`, `@pyreon/x/internal-server` or `@pyreon/core/compat` now declares `@pyreon/x` as `workspace:*`, which publishes as the exact version (`"@pyreon/core": "0.55.0"`) instead of a caret range, so an install can never pair it with a different version of those internals. `check-stability-tier` (rule 10) enforces this. The edges: runtime-dom, runtime-server, server, head, elements, rocketstyle, styler, kinetic, store, testing and the five compat layers → `@pyreon/core` / `@pyreon/reactivity` / `@pyreon/runtime-dom` / `@pyreon/toast`; ui-core → `@pyreon/styler`; unistyle and rocketstyle → `@pyreon/ui-core`; core → `@pyreon/reactivity`.

`@pyreon/zero`'s dev SSR alias for `@pyreon/runtime-server` is now an exact-match pattern, so it no longer rewrites `@pyreon/runtime-server/internal` to a path inside the package directory.
