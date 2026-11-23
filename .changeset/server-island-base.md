---
'@pyreon/server': patch
'@pyreon/zero': patch
---

Server islands work under a base path, and on islands-only pages.

- A `<pyreon-server-island>` marker fetches its fragment under the route base (`/sub/_pyreon/fragment/…`). The base is its own router's, read in the component body. Where no router runs (an islands-only page) it is the base set with the new `setServerIslandBase` (`@pyreon/server/client`); zero sets it from its build base. Before, a self-activating marker passed no base and requested the host root, which 404s behind a proxy that forwards only `/sub/*`.
- The fragment is inserted as HTML, so the origin and path it is fetched from never come from the page. A non-path base is refused (including a percent-encoded `.`, `/` or `\`), an invalid `data-name` is refused, and a URL that leaves the page's origin is refused; a refusal warns in dev. `isRoutePath` and `isIslandName` are exported from the runtime-free `@pyreon/server/paths` (and from `@pyreon/server` / `@pyreon/server/client`); zero re-exports `isRoutePath` from there rather than keeping a copy.
- One island-name rule (`isIslandName`) for registration, the browser and zero's fragment endpoint: no `/`, `\` or `%`, no control characters, not empty or only dots. A name containing one of those now throws a `[Pyreon]` error at `serverIsland()`. In practice this restricts nothing that worked: zero's endpoint already answered 400 to a name with `/` (so `shop/cart` registered and then silently never loaded), and `.`/`..` never reached the endpoint. The reason for refusing separators and `%`: a decoding reverse proxy (nginx's standard sub-path setup) un-escapes the name, so `../../api/x` would reach another path of the app.
- The server-island registry and base are no longer readable from a global that page markup can shadow (`<a id="…">` on Window): the base lives in module scope, and the shared registry slot is used only when it holds a real `Map`.
- `hydrateIslands` only looks up a `data-component` among the registry's own keys, so an inherited name (`constructor`, `toString`) is reported as having no loader instead of being called.
- On an islands-only page (`export const hydrate = 'islands'`), a server island outside every client island is now activated by the islands runtime. Nothing mounted it before, so it stayed on its fallback.

Upgrade: manual — rename a server island whose name contains `/`, `\`, `%` or a control character, or is empty or only dots (none of those ever loaded its fragment through zero's endpoint).
