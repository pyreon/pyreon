---
'@pyreon/styler': minor
'@pyreon/unistyle': minor
'@pyreon/coolgrid': minor
'@pyreon/elements': minor
'@pyreon/ui-core': patch
'@pyreon/lint': patch
---

Remove the deprecated low-level theme providers and the dead `boost` parameters.

- `@pyreon/unistyle` no longer exports `Provider` or the `TProvider` type. `@pyreon/coolgrid` and `@pyreon/elements` no longer re-export `Provider`.
- `@pyreon/styler` no longer exports `ThemeProvider`. `ThemeContext`, `useTheme`, `useThemeAccessor` and `DefaultTheme` are unchanged.
- `sheet.insert(cssText, insertLayer?, use?)` drops its unused second parameter (formerly `boost`), so the layer moves from the third argument to the second. A JavaScript call still on the old shape (`sheet.insert(css, false, 'layer')`) would lose its layer, so in dev a boolean second argument or a string third one logs a one-time `[Pyreon]` warning naming the new call. `useCSS(template, props?)` drops its unused third `boost` parameter; a stale third argument is simply ignored, as it always was.
- `pyreon/no-theme-outside-provider` is now silenced only by a `PyreonUI` import.

Migration: wrap the app in `<PyreonUI theme={theme}>` from `@pyreon/ui-core` instead of `Provider` / `ThemeProvider` (low-level code can call `provide(ThemeContext, () => theme)`); for `sheet.insert(css, false, layer)` drop the second argument, and for `useCSS(t, props, boost)` drop the third.
