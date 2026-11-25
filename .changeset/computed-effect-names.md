---
'@pyreon/reactivity': patch
---

`computed()` and `effect()` accept a dev-only `name` option and register it with devtools, so the names `@pyreon/vite-plugin` already injects for `const x = computed(…)` / `const x = effect(…)` now show in the reactive graph instead of `derived#N` / `effect#N`. Production builds never read it.
