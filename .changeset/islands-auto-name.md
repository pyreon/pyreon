---
'@pyreon/vite-plugin': minor
'@pyreon/server': minor
---

Islands DX — auto-naming + dev doctor-lite:

- **`island()` `name` is now optional** for const-bound declarations under `@pyreon/vite-plugin` (`islands: true`, the default). The plugin derives a collision-free name from the binding (`const Counter = island(…)` → `Counter$<file-hash>`) and injects it in BOTH the transform (what the runtime receives) and the auto-registry prescan (what the client hydrates) — one derivation, so marker and registry can never disagree, and the manual-name typo class disappears. Explicit `name:` always wins. The no-options form `island(() => import('./X'))` works too. Without the plugin (or for bindingless calls) the runtime throws at declaration time with guidance instead of failing silently at hydration.
- **Islands doctor-lite on `vite dev`**: the islands audit (duplicate-name / nested-island / dead-island / registry drift — previously CI-or-manual via `pyreon doctor --check-islands`) now runs once on dev-server boot and prints findings as plain warnings. Advisory: any audit failure is swallowed, never breaking the dev server.
