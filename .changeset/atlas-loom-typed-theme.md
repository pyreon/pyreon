---
'@pyreon/atlas': minor
'@pyreon/loom': patch
---

Type the workbench and observatory theme through rocketstyle's `withTheme<Tokens>()` instead of casts.

`rs` / `el` / `txt` from `@pyreon/atlas/ui` are now bound to Atlas's `ThemeTokens`, so a catalog built on them gets a typed, checked `t` in every `.theme()` and dimension callback. **Breaking:** the `dim` adapter is removed from `@pyreon/atlas/ui`; write `.states((t) => …)` directly, since `t` is now typed.
