---
'@pyreon/server': minor
'@pyreon/zero': patch
---

Server islands work under a base path, and on islands-only pages.

- A `<pyreon-server-island>` marker fetches its fragment under the route base (`/sub/_pyreon/fragment/…`). The base is its own router's, read in the component body. Where no router runs (an islands-only page) it is the base set with the new `setServerIslandBase` (`@pyreon/server/client`); zero sets it from its build base. Before, a self-activating marker passed no base and requested the host root, which 404s behind a proxy that forwards only `/sub/*`.
- The fragment is inserted as HTML, so the origin and path it is fetched from never come from the page. A non-path base is refused (including a percent-encoded `.`, `/` or `\`), an invalid `data-name` is refused, and a URL that leaves the page's origin is refused; a refusal warns in dev. `isRoutePath` and `isIslandName` are exported from the runtime-free `@pyreon/server/paths` (and from `@pyreon/server` / `@pyreon/server/client`); zero re-exports `isRoutePath` from there rather than keeping a copy.
- One island-name rule (`isIslandName`) for registration, the browser and zero's fragment endpoint: no `/`, `\` or `%`, no control or format characters (C0, DEL, C1, U+2028/U+2029, `\p{Cf}`), not empty or only dots, and the same after NFKC normalisation. A name that breaks it now throws a `[Pyreon]` error at `serverIsland()`. **This is a breaking change** for some names that worked: on zero's endpoint a name with `%` or `\` (`50%`, `a\b`) loaded before, and a host other than zero could have served names with `/`. (Through zero, a name with `/` never loaded: the endpoint answered 400.) The reason for refusing separators and `%`: a decoding reverse proxy (nginx's standard sub-path setup) un-escapes the name, so `../../api/x` would reach another path of the app.
- The server-island registry and base are no longer readable from a global that page markup can shadow (`<a id="…">` on Window): the base lives in module scope, and the shared registry slot is used only when it holds a real `Map`.
- `hydrateIslands` only looks up a `data-component` among the registry's own keys, so an inherited name (`constructor`, `toString`) is reported as having no loader instead of being called.
- On an islands-only page (`export const hydrate = 'islands'`), a server island outside every client island is now activated by the islands runtime. Nothing mounted it before, so it stayed on its fallback.

Upgrade: manual — rename a server island whose name contains `/`, `\` or `%` (or a full-width look-alike of them), a control or format character (C0, DEL, C1, U+2028, U+2029, bidi overrides, zero-width characters), or is empty or only dots.
