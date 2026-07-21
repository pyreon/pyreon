---
"@pyreon/ui-core": patch
"@pyreon/unistyle": patch
---

refactor(ui-core,unistyle): break the ui-core ↔ unistyle dependency cycle

`@pyreon/ui-core` and `@pyreon/unistyle` depended on each other (a runtime `dependencies` cycle): ui-core's `<PyreonUI>` imported unistyle's theme engine (`enrichTheme`/`themeToCssVars`/`cpseRewrite` + the `PyreonTheme` type), while unistyle imports ui-core's primitives (`config`/`context`/`isEmpty`/…). This inverted the intended layer order (ui-core is the base of the ui-system layer) and made the two packages impossible to build/version/consume independently.

Fixed with the repo's established anti-cycle pattern — a registration seam (like `@pyreon/router`'s `_setDefaultChromeLayout`, `@pyreon/styler`'s `setStyleExtraction`, `@pyreon/core`'s `setSnapshotCapture`):

- `@pyreon/ui-core` now OWNS the canonical `PyreonTheme` type and exposes a `setThemeEngine`/`getThemeEngine` seam (`ThemeEngine` interface). It carries **no dependency on `@pyreon/unistyle`**.
- `@pyreon/unistyle` registers its engine into ui-core at module load (`setThemeEngine({ enrichTheme, themeToCssVars, cpseRewrite })`) and re-exports `PyreonTheme` for back-compat.
- `<PyreonUI>` reads the engine via `getThemeEngine()` — which throws a clear, actionable error if `@pyreon/unistyle` isn't in the module graph (it always is in a real app; every styled `@pyreon` UI package pulls it in transitively).

The dependency graph is now **acyclic**: `unistyle → ui-core` only. No public API change — `PyreonUI` is still exported from `@pyreon/ui-core`, `PyreonTheme` from both. `@pyreon/unistyle` is added as a `@pyreon/ui-core` **devDependency** (for tests only — its test setup imports unistyle to register the engine, mirroring a real app).
