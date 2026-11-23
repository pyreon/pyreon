---
'@pyreon/server': patch
'@pyreon/zero': patch
---

Server islands work under a base path, and on islands-only pages.

- A `<pyreon-server-island>` marker fetches its fragment under the route base (`/sub/_pyreon/fragment/…`). The base is its own router's, read in the component body. Where no router runs (an islands-only page) it is the base set with the new `setServerIslandBase` (`@pyreon/server/client`); zero sets it from its build base. Before, a self-activating marker passed no base and requested the host root, which 404s behind a proxy that forwards only `/sub/*`.
- The fragment is inserted as HTML, so the origin and path it is fetched from never come from the page. A non-path base is refused, a `data-name` that is not a plain island name is refused, and a URL that leaves the page's origin is refused. `isRoutePath` is exported from `@pyreon/server` and `@pyreon/server/client`.
- `hydrateIslands` only looks up a `data-component` among the registry's own keys, so an inherited name (`constructor`, `toString`) is reported as having no loader instead of being called.
- On an islands-only page (`export const hydrate = 'islands'`), a server island outside every client island is now activated by the islands runtime. Nothing mounted it before, so it stayed on its fallback.
