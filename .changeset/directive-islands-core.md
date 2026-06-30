---
"@pyreon/compiler": minor
---

Add `transformClientDirectives` — the directive-islands (`hydrate="…"`) lowering

A pure source→source compiler transform that turns a `hydrate="<strategy>"`
attribute on an imported component into a self-hydrating `island()` wrapper —
the Astro-`client:*`-style ergonomics, but coherent with Pyreon's existing
`island({ hydrate })` vocabulary (the directive value, the option key, and the
runtime strategy are the same word).

`<Counter hydrate="visible" />` → `island(() => import('./Counter'), { name,
hydrate: 'visible' })` with a **file-derived stable name**, which eliminates the
entire duplicate-name / registry-drift / dead-island bug class by construction.

Supports default + named imports, all strategy strings (`load`/`idle`/`visible`/
`interaction`/`media(...)`/`never`) + bare `hydrate` (eager). Unsupported shapes
(dynamic strategy, local/non-imported component, namespace import, DOM element)
are left UNCHANGED and reported as a warning — never silently mis-compiled.

This is the compiler primitive (the `transformDeferInline` / `scanCollapsibleSites`
pattern); the `@pyreon/vite-plugin` wiring that calls it in the transform hook +
merges into the islands registry is the next increment.
