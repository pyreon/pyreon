---
'@pyreon/zero': patch
---

fix(zero): forward outer build's resolved base into inner SSR sub-build

The SSG/SSR inner sub-build didn't inherit the outer build's `base`
config. With `vite build --base=/X/`, the outer client build's
`__ZERO_BASE__` was correctly `/X/` but the inner build's
`__ZERO_BASE__` was `/`. Any user component that constructed asset
URLs from `__ZERO_BASE__` (e.g. `<img src={\`${__ZERO_BASE__}brand/
logo.svg\`} />`) baked the WRONG prefix into the prerendered SSG
HTML — initial page load 404'd until client-side hydration patched
the DOM.

Fix: `BuildSsrBundleOptions.base` field, captured from each plugin's
`configResolved` and forwarded into the inner build via BOTH (a) the
top-level `build({base})` arg AND (b) a synthesized
`zeroPlugin(innerZeroConfig)` instance with the base injected — the
plugin's `config()` return BEATS the inline build arg in Vite's
merge order (the PR #1395 trap), so the synthesized config is the
canonical path that wins.

Discovered when docs-zero's preview deploy at `/pyreon/preview/`
shipped brand logos at `/brand/...` (root, 404) instead of
`/pyreon/preview/brand/...`.
