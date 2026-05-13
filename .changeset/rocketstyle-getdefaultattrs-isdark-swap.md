---
'@pyreon/rocketstyle': patch
---

Fix `isDark`/`isLight` helper swap in `rocketstyle`'s `getDefaultAttrs`. The attrs callback received `isDark: mode === 'light'` and `isLight: mode === 'dark'` — exact inverse of the documented semantics. Any user code reading `helpers.isDark` / `helpers.isLight` from `.attrs(callback)` got the wrong flag for both light and dark mode. Inversed mode (`inversed: true`) was also affected since it flows through the same helper. Mirrors vitus-labs commit.
