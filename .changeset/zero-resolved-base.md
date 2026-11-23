---
'@pyreon/zero': minor
'@pyreon/loom': patch
---

zero follows Vite's resolved `base` everywhere. `vite build --base /x/` (or a programmatic `build({ base })`, or `vite.config.base`) on a zero app no longer emits SSG modulepreloads, `cssMode: 'asset'` stylesheets, OG image URLs, self-hosted font URLs, `<Link>` hrefs or the production server's routing under `/`. Precedence: an explicit `zero({ base })` wins, then Vite's base, then `/`; zero's plugin no longer returns its default `/` over a Vite-level base. zero's `<Link>` / `createLink` / `useLink().href()` now render an internal root-relative href with the router base, like `<RouterLink>`. The internal `argvHasBaseFlag` helper is removed. loom's static-site build no longer passes its `--base` to zero separately.

Upgrade: manual — an app that set `base` in `vite.config.ts` (or passed `--base` / `build({ base })`) together with a different `zero({ base })` now gets `zero({ base })` everywhere, as before for assets; drop one of the two. Code importing the internal `argvHasBaseFlag` must stop.
