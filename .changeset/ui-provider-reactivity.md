---
'@pyreon/rocketstyle': patch
'@pyreon/ui-core': patch
'@pyreon/unistyle': patch
'@pyreon/styler': patch
'@pyreon/elements': patch
---

UI providers are now reactive, and two diagnostics are corrected.

- `@pyreon/rocketstyle` `Provider` reads its parent context and its own props lazily, so `<Provider inversed>` follows a later parent mode change and a signal-driven `theme`/`mode` prop stays live (it previously froze at mount).
- `@pyreon/ui-core`'s low-level `Provider` no longer logs "CoreProvider is internal" on every mount — rocketstyle's public `Provider` delegates to it — and exposes getter-backed props lazily. `@pyreon/unistyle`'s `Provider` re-enriches a changing `theme` prop.
- `@pyreon/styler` `ThemeProvider` follows later `theme` prop changes for consumers tracking the reactive `ThemeContext`.
- `@pyreon/elements` `Overlay` `trigger` / `children` render-prop callbacks are contextually typed (no implicit `any` under strict TS).
- rocketstyle's reserved-dimension error names the clashing key(s) and the reserved set (it printed `[object Object]`).
