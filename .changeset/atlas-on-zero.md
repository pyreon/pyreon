---
'@pyreon/atlas': minor
---

`atlas dev` and `atlas build` now run the workbench as a `@pyreon/zero` app that ships inside the package (`app/`: `/` and `/:component` file routes under one layout that renders `<Workbench>`). `atlas dev` serves it with zero's dev mode; `atlas build` builds it with zero's SSG pass and writes the client shell at `/` and at one path per component (plus a `404.html` shell), so a component URL is still a real page on a plain file server. The dev server and the built site are now one app with one plugin chain instead of a dev HTML shell and a separately generated build entry.

zero's router owns the component URL. The workbench reads the selection from the route and navigates with `router.replace`; it no longer guesses a base from `location.pathname`, which wrote `/sub/old-name/button/` for a renamed component's old link (a blank page on reload). A stale id or a path with extra segments now lands on the default component. The trailing slash is kept (`/button/`, the directory a static host serves). A host that embeds `<Workbench>` keeps `?c=`; the app passes the new `route` prop (`WorkbenchRoute`).

The project's own `vite.config.*` applies to the workbench: its plugins (minus its own `pyreon()` / `zero()`), `resolve`, `css`, `define` and `envPrefix`; a Tailwind v4 CSS root gets the project as an `@source` (Tailwind scans from Vite's root, which is the workbench app). The project's `public/` is served by `atlas dev` and copied by `atlas build`, and its PostCSS config applies, as its `.env` files already did. Atlas's Vite cache lives in the project (`node_modules/.cache/atlas-vite`), and a build writes nothing into the installed package. A component edit in `atlas dev` is an in-place update: the preview re-mounts with the new module and every control value kept. A previewed component gets an empty router of its own: `useRoute()` / `useRouter()` inside it no longer see the workbench's, and its plain links no longer trigger the router's reload warning. `atlas dev` no longer writes `.pyreon/context.json` into the installed package.

Breaking:

- `atlas dev` and `atlas build` need `@pyreon/zero` installed next to `vite` and `@pyreon/vite-plugin` (all optional peers; `atlas scan` needs none): `bun add -d vite @pyreon/vite-plugin @pyreon/zero`.
- `atlas build --base` must be absolute (`/` or `/my-repo/`). A relative base used to build a site that worked only at its root; it is now refused before any work.
- The `__ATLAS_ROUTES__` global is gone: a host that wants path URLs passes `route` to `<Workbench>`.
- `@pyreon/atlas/dev` no longer exports `devHtml` or `ENTRY_ID` (the page is the app's `index.html`; its head lines come from `atlasDevPlugin`'s `transformIndexHtml`). It exports `SHELL_ID` (`virtual:atlas/shell`, the site title).
- The `pyreon` named export of `@pyreon/vite-plugin` is no longer accepted as an alias for its default export (the package has never exported one).

Fixed on the way: `atlas build` now applies the project's `resolve.alias` (as `atlas dev` already did), so a `~/…` import in a component no longer fails the build; and the canvas and docs preview no longer pass raw CSS strings to the `css` prop (a dev warning on every page).
