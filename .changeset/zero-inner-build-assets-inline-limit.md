---
"@pyreon/zero": patch
---

fix(zero): inner SSR/SSG sub-build inherits `build.assetsInlineLimit` + `assetsDir` from the outer config

The SSG/SSR/ISR plugins run a programmatic inner `vite build` with `configFile:
false` (it must not re-load and re-run the user's whole `vite.config.ts`). As a
side effect the inner build also dropped the user's `build.assetsInlineLimit`,
falling back to Vite's 4 KB default — so a `<= 4 KB` image the client build
emitted as a hashed file (`/assets/logo-HASH.png`) was inlined as a `data:` URI
in the SSR/SSG-rendered HTML. The two builds then disagreed on the `<img src>`
of every small image: an avoidable hydration mismatch, and (combined with the
SSR URL guard) the reason small placeholder images could vanish from static
output.

The plugins now capture `build.assetsInlineLimit` and `build.assetsDir` in
`configResolved` and thread them into the inner build, so asset emission is
identical across the client and SSR/SSG builds. Settings that are deliberately
SSR-runtime-specific (`target: 'esnext'`, ES output, `node:` externals) are
NOT inherited. Apps that never set `assetsInlineLimit` see no change (the inner
build keeps Vite's default).

Verified with a real Vite SSR build: the default inlines a sub-4 KB PNG as a
`data:` URI; with the propagated `assetsInlineLimit: 0` it emits a file
reference — matching the client build.
