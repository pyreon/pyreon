---
'@pyreon/zero': patch
---

fix(zero): give server actions the same id in the client and server bundles

`defineAction` generated a random id each time its module was evaluated, so the client bundle and the server bundle carried different ids and every client call returned 404. Zero's Vite plugin now derives each action's id at build time from the defining module's path and the name the action is assigned to. The id is the same in both bundles, in dev, and across HMR, which also stops HMR from adding a new registry entry on every edit.

The plugin also removes the handler from the client bundle, together with imports that only the handler used, so server-only code (a database client, secrets read in the handler) is no longer shipped to the browser.

`defineAction` now requires `zero()` in the Vite config. Without it, a call in the browser throws in production and warns once in development. Server-only use, such as tests, still works without the plugin.
