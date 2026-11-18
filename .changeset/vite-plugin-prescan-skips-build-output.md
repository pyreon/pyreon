---
'@pyreon/vite-plugin': patch
---

The boot-time prescans (`island()` declarations and signal exports) no longer read build output as source. Every directory the resolved Vite config declares as output (each environment's `build.outDir`, `publicDir`, `cacheDir`) is skipped, and each build records its output directory under `cacheDir` so a later build of the same project skips it too. Before, any `build.outDir` other than `dist` (for example `dist-ssr`) was scanned, and a server bundle's `island()` calls entered the client islands registry.
