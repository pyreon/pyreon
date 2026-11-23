---
'@pyreon/server': patch
'@pyreon/zero': patch
---

Server islands work under a base path, and on islands-only pages.

- A `<pyreon-server-island>` marker fetches its fragment under the route base (`/sub/_pyreon/fragment/…`). The base is its own router's, read in the component body. Where no router runs (an islands-only page) it is the base set with the new `setServerIslandBase` (`@pyreon/server/client`); zero sets it from its build base. Before, a self-activating marker passed no base and requested the host root, which 404s behind a proxy that forwards only `/sub/*`.
- The fragment is inserted as HTML, so the origin and path it is fetched from never come from the page. A non-path base is refused (including a percent-encoded `.`, `/` or `\`), a `data-name` of `.` / `..` / empty is refused (any other name is percent-encoded into one path segment, as before), and a URL that leaves the page's origin is refused; a refusal warns in dev. `isRoutePath` is exported from `@pyreon/server` and `@pyreon/server/client`, and zero re-exports it rather than keeping a copy.
- `serverIsland()` now applies the same name rule at registration: an empty name, `.` or `..` throws a `[Pyreon]` error. Those names never worked (their fragment URL resolved outside the endpoint); every other name that worked still does.
- The server-island registry and base are no longer readable from a global that page markup can shadow (`<a id="…">` on Window): the base lives in module scope, and the shared registry slot is used only when it holds a real `Map`.
- `hydrateIslands` only looks up a `data-component` among the registry's own keys, so an inherited name (`constructor`, `toString`) is reported as having no loader instead of being called.
- On an islands-only page (`export const hydrate = 'islands'`), a server island outside every client island is now activated by the islands runtime. Nothing mounted it before, so it stayed on its fallback.

Upgrade: none — rename a server island called `''`, `.` or `..` (it never fetched its fragment).
