---
'@pyreon/zero': patch
---

A hybrid build (`mode: 'ssr'` / `'isr'`, or `'auto'` resolving to a server build) now fails with a `[Pyreon]` error when a prerendered route would be written under a name the build or the deploy adapter owns in `dist/`. These names are `server`, `server-edge`, `.zero-ssg-server` and `.vite`, plus the adapter's own: `client`, `index.js` / `index.ts` / `main.js` and `package.json` for node, bun and deno; `publish`, `netlify` and `netlify.toml` for netlify; `_server`, `_worker.js` and `_routes.json` for cloudflare. Before, such a route was listed in `_pyreon-ssg-paths.json` and shown as `○ ssg`, but the SSR sub-build or the staging dropped its HTML, so it silently server-rendered. Adapters declare their names through the new optional `Adapter.reservedOutputs`. A custom adapter that stages into `outDir` should set it.
