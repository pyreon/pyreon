---
'@pyreon/server': patch
'@pyreon/zero': patch
---

Server islands work under a base path, and on islands-only pages.

- The server stamps the route base on a `<pyreon-server-island>` marker (`data-base`), read from the marker's own router in the component body. A marker fetches its fragment under that base (`/sub/_pyreon/fragment/…`). Before, a self-activating marker passed no base and requested the host root, which 404s behind a proxy that forwards only `/sub/*`. An explicit `activateServerIslands(base)` still overrides it.
- On an islands-only page (`export const hydrate = 'islands'`), a server island outside every client island is now activated by the islands runtime. Nothing mounted it before, so it stayed on its fallback. One inside a client island is still left to that island.
