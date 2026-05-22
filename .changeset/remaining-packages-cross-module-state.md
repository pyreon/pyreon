---
'@pyreon/hotkeys': patch
'@pyreon/hooks': patch
'@pyreon/toast': patch
'@pyreon/dnd': patch
'@pyreon/charts': patch
'@pyreon/document': patch
'@pyreon/form': patch
'@pyreon/i18n': patch
'@pyreon/state-tree': patch
'@pyreon/runtime-server': patch
'@pyreon/ui-core': patch
'@pyreon/elements': patch
'@pyreon/styler': patch
'@pyreon/zero': patch
---

Apply `defineCrossModuleState` to module-level state in 14 remaining packages. Closes the dual-module-instance bug class across the `fundamentals/`, `core/runtime-server`, `ui-system/`, and `zero/` packages. Each migrates from bare module-scope `let _foo = …` to `defineCrossModuleState(key, () => ({ ... }))`, hosting state on globalThis under stable `Symbol.for` keys.

Per-package state migrated:
- `@pyreon/hotkeys` — keydown listener + refcount + entries + active scopes
- `@pyreon/hooks` — useScrollLock refcount + savedOverflow
- `@pyreon/toast` — id counter
- `@pyreon/dnd` — sortable id counter
- `@pyreon/charts` — ECharts core + module registration set + inflight Map
- `@pyreon/document` — renderer registry
- `@pyreon/form` — devtools active forms + listeners
- `@pyreon/i18n` — devtools active instances + listeners
- `@pyreon/state-tree` — hook singleton registry + devtools active models + listeners
- `@pyreon/runtime-server` — context ALS + fallback stack + store ALS + isolation-active flag
- `@pyreon/ui-core` — system mode signal + auto-init flag
- `@pyreon/elements` — modal overflow refcount
- `@pyreon/styler` — sheet-clear subscribers
- `@pyreon/zero` — action registry

Byte-identical behavior; all package tests pass.
