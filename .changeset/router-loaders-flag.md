---
'@pyreon/router': minor
'@pyreon/zero': minor
'@pyreon/compiler': patch
---

Router loaders can now be compiled out of the bundle. Defining `globalThis.__PYREON_ROUTER_LOADERS__` as `false` at build time removes the loader engine (cache, in-flight dedup, stale-while-revalidate, server-loader single-fetch) and the loader render path (pending components, loader-data provider, link prefetch). Leaving it undefined changes nothing.

`@pyreon/zero` sets it for you in production builds: `false` when its scan of `src/routes` finds no `loader` export and no `.server.ts` sibling, `true` otherwise. Measured on real apps, initial JS drops by 1,020 B gz (ui-showcase) and 891 B gz (kanban); an app with loaders changes by 1 B. `zero dev` never sets it. A value you define yourself always wins.

A route passed to `startClient`/`createApp` by hand is outside the scan. If such a route has a loader while loaders are compiled out, the app now throws a `[Pyreon]` error at startup naming the fix, instead of rendering without its data. `pyreon doctor diagnose` explains it.
