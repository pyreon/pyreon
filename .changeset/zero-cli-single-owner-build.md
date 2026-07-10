---
'@pyreon/zero-cli': patch
'@pyreon/zero': patch
---

fix(zero-cli): `zero build` is now ONE `vite build` — the zero plugin owns the whole pipeline (single SSR post-step owner, loud failures)

`zero build` previously ran a SECOND owner on top of the `zero()` plugin's battle-tested post-step: its own `vite build --ssr` pass to `dist/server`, its own prerender pass, and its own `adapter.build()` into `dist/output` — each wrapped in a bare swallow-all `catch`. Consequences: the SSR bundle was built twice into divergent trees (up to four copies of `entry-server.js`), the deployed `dist/output` server bundle was staged **without** `template.html` (it fell back to the dev template + `/src/entry-client.ts`, so pages server-rendered but never hydrated in production), zero-config apps (no user `src/entry-server.ts`) got **no** server bundle at the documented location at all, and every one of those failures was swallowed into a green "Build completed".

Now:

- `zero build` runs exactly one `vite build`; the plugin chain owns client bundle, SSR/ISR server bundle + `dist/server/template.html`, SSG prerendering, and deploy-adapter staging into the one `dist/` tree (`node dist/index.js` for the node adapter). `dist/output` and the CLI's duplicate passes are gone.
- **Breaking (pre-1.0):** the `--mode` CLI flag is removed — the render mode comes from `zero({ mode })` in `vite.config.ts` (the flag never reached the plugin instances; it only gated the CLI's now-deleted duplicate passes).
- An **explicitly configured** adapter (`zero({ adapter })`) whose `build()` throws now **fails the build** (SSR/ISR and SSG modes); auto-selected adapters remain non-fatal with a console error — the server bundle itself is still usable.
- The SSR/SSG plugins' inner-build recursion flags moved to one shared module (`build-flags.ts`); a flag **leaked** in from a parent process/shell (which silently disabled the whole post-step) now prints a one-line notice, and both plugins silently no-op on user-invoked server-target builds (`vite build --ssr`).
- `zero preview` serves `dist/client/` when a node/bun-adapter build staged it, otherwise the project's `build.outDir` (previously-documented `dist/client` layouts keep working).
