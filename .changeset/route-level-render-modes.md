---
'@pyreon/zero': minor
---

Per-route render modes (hybrid rendering) — `export const renderMode` is now WIRED, not just typed. Any route file (or layout — cascades to descendants) can override the app-level `mode`, which becomes the default for undeclared routes:

- **`'ssg'` in a server app**: prerendered at build (loaders + `getStaticPaths` run), served static-first by the emitted node/bun servers via the `_pyreon-ssg-paths.json` manifest, excluded from the Cloudflare worker via `_routes.json`; missing file falls back to SSR.
- **`'spa'`**: the opt-out-of-SSR hatch — the server responds with the CSR shell; the client mounts fresh and runs loaders on the cold-start path. In `mode: 'ssg'`, 'spa' routes emit the shell file instead of prerendered HTML.
- **`'isr'` in an `'ssr'` app**: per-route stale-while-revalidate caching. **`'ssr'` in an `'isr'` app**: per-route cache bypass.
- **`'ssr'`/`'isr'` in a `mode: 'ssg'` app**: a loud build error naming each route + the fix (a static deploy has no server).

One resolver (`resolveRenderModeForPath` — leaf-first, layout cascade, app default) drives both build and runtime. Apps with no per-route declarations are byte-identical to before.
