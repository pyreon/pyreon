---
'@pyreon/styler': minor
'@pyreon/ui-core': patch
'@pyreon/unistyle': patch
'@pyreon/rocketstyle': patch
---

Make theme swap reactive across the whole UI system. `ThemeContext` is now a `createReactiveContext<Theme>`; `PyreonUI` wraps `enrichTheme(props.theme)` in `computed` so swapping the `theme` prop (user-preference theme) re-resolves CSS in every styled component and swaps class names without remounting. `styled()` DynamicStyled reads the theme via a new `useThemeAccessor()` hook inside its resolver effect (alongside `$rocketstyle` / `$rocketstate`); rocketstyle's `$rocketstyleAccessor` moves `baseTheme` / `dimensionThemes` lookups inside the accessor so dimension values re-resolve with the new theme. WeakMap caches on theme identity keep the static-theme case O(1). Consumer `useTheme()` still returns `Theme` (snapshot at call time) — calling it inside an effect now tracks theme changes. `ThemeProvider` and `unistyle` `Provider` updated to pass the accessor form (`provide(ThemeContext, () => theme)`).
