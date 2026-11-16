---
'@pyreon/create-zero': patch
---

Scaffold fixes, found by testing the fixtures against fresh scaffolder output:

- A `--compat react|vue|solid|preact` app no longer crashes on `/counter`. The app template's counter is written in Plain Mode, which only the Pyreon compiler understands, and a compat project hands its JSX to the compat runtime, so the page threw "state() from '@pyreon/core/plain' reached the runtime". Compat projects now get a signals version of the counter.
- The dashboard template's `/app/*` auth gate is a route loader again: a signed-out visitor gets a server redirect to `/login` with no authenticated markup, and a session that ends mid-visit is caught on the next client navigation. It used to check on mount, after first paint, and never re-checked while the layout stayed mounted.
- An SSG scaffold's `sitemap.xml` lists the pages `getStaticPaths` enumerates (every blog post). The generated config now sets `sitemap.useSsgPaths`; without it only file-system routes appeared.
- The generated `vite.config.ts` imports `@pyreon/zero/server` once (`import zero, { vercelAdapter } from …`); two imports from the same module failed `import/no-duplicates`.
- New projects declare `@types/bun` at `^1.4.4`.
- The app template's post route and the dashboard's invoice route typecheck under `noUncheckedIndexedAccess` (a route param is `string | undefined` there).
