---
"@pyreon/compiler": minor
"@pyreon/vite-plugin": minor
---

Directive islands — `<Counter hydrate="visible" />` (opt-in: `pyreon({ directiveIslands: true })`)

Astro-`client:*`-grade ergonomics for islands, coherent with Pyreon's existing
`island({ hydrate })` vocabulary (the directive value, the option key, and the
runtime strategy are one word). A `hydrate="<strategy>"` attribute on an imported
component lowers to a self-hydrating `island()` wrapper with a **file-derived
stable name** — which eliminates the duplicate-name / registry-drift / dead-island
bug class by construction.

- `@pyreon/compiler`: `transformClientDirectives` — the pure source→source lowering
  (default + named imports, all strategy strings + bare `hydrate`; unsupported shapes
  warned + left unchanged; fast-bails when no `hydrate` attr).
- `@pyreon/vite-plugin`: `directiveIslands: true` wires it into the transform hook
  (lowering + HMR) and the `buildStart` prescan, registering each lowered island in
  `virtual:pyreon/islands-registry` (for `hydrateIslandsAuto` / static-islands apps);
  zero apps self-hydrate on mount.

Off by default (a new syntax is opt-in until proven).
