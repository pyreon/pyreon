---
'@pyreon/zero': minor
'@pyreon/router': patch
'@pyreon/runtime-server': minor
'@pyreon/server': patch
---

- `@pyreon/router`: `stringifyLoaderData` serializes with native `JSON.stringify` and only walks the data for cycles when serialization fails. Output is byte-identical (checked against the previous implementation over 2,000 seeded payloads) and it is ~3.7× faster on a 200-item payload; the named circular-reference error is unchanged. It runs on every loader-backed SSR request, every SSG page and every data-endpoint call.
- `@pyreon/zero`: apps that are SPA everywhere no longer ship hydration code (−6.6 KB gz, −10.6% of initial JS on the kanban example). A production build defines `__ZERO_HYDRATE__` from the app mode, `routeRules` and route files; anything that could be server-rendered keeps hydration.
- `@pyreon/zero`: `<Link>`'s `aria-current="page"` now follows client-side navigation (it was set once and never moved).
- `@pyreon/zero`: SSG fails the build when two different route files produce the same URL (the check never ran for auto-detected paths), and a `_redirects` file shipped in `public/` is kept, with build-time loader redirects appended after it, instead of being overwritten.
- `@pyreon/zero`: new `@pyreon/zero/app` subpath exporting `createApp`; dev SSR loads it instead of the whole server package.
- `@pyreon/runtime-server`: `renderToStream` accepts `nonce`, which it puts on every inline `<script>`/`<style>` it emits. `@pyreon/server` passes the request's CSP nonce to it and to the streamed loader-data script, so streaming SSR works under a strict nonce CSP.
