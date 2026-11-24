---
'@pyreon/atlas': minor
---

`atlas dev` and `atlas build` now run the workbench as a `@pyreon/zero` app that ships inside the package (`app/`: `/` and `/:component` file routes under one layout that renders `<Workbench>`). `atlas dev` serves it with zero's dev mode; `atlas build` builds it with zero's SSG pass and writes the client shell at `/` and at one path per component (plus a `404.html` shell), so a component URL is still a real page on a plain file server. The dev server and the built site are now one app with one plugin chain instead of a dev HTML shell and a separately generated build entry.

Breaking:

- `atlas dev` and `atlas build` need `@pyreon/zero` installed next to `vite` and `@pyreon/vite-plugin` (all optional peers; `atlas scan` needs none): `bun add -d vite @pyreon/vite-plugin @pyreon/zero`.
- `atlas build --base` must be absolute (`/` or `/my-repo/`). A relative base used to build a site that worked only at its root; it is now refused before any work.
- `@pyreon/atlas/dev` no longer exports `devHtml` or `ENTRY_ID` (the page is the app's `index.html`; its head lines come from `atlasDevPlugin`'s `transformIndexHtml`). It exports `SHELL_ID` (`virtual:atlas/shell`, the site title).
- The `pyreon` named export of `@pyreon/vite-plugin` is no longer accepted as an alias for its default export (the package has never exported one).

Fixed on the way: `atlas build` now applies the project's `resolve.alias` (as `atlas dev` already did), so a `~/…` import in a component no longer fails the build; and the canvas and docs preview no longer pass raw CSS strings to the `css` prop (a dev warning on every page).
