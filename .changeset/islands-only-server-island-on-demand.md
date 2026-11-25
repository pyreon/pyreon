---
'@pyreon/zero': patch
'@pyreon/server': patch
---

An islands-only page (`export const hydrate = 'islands'`) no longer downloads the server-island code unless it has a server island. Zero's islands runtime loads the marker activation with a dynamic import only when the page contains a `<pyreon-server-island>`, and the client build puts that code in a `server-island` chunk of its own instead of the `islands-runtime` chunk every islands-only page with an island preloads. The route base for server islands an island renders later is still set on every islands-only page. On pyreon.dev, which has no server islands, this is about 600 B gzip off every page.

`@pyreon/server` keeps the server-island base (`setServerIslandBase`) in its own module and builds `server-island.ts` as a lib chunk of its own, so an app bundler can load the marker code apart from the islands runtime. No API change.
