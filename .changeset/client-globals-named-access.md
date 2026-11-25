---
'@pyreon/router': patch
'@pyreon/store': patch
'@pyreon/server': patch
'@pyreon/zero': patch
'@pyreon/styler': patch
'@pyreon/mcp': patch
---

Page markup can no longer stand in for the server-to-client hand-over globals.

In a browser, an element with `id="X"` makes the global `X` resolve to that element when no script assigned it (named access on Window). On a page whose inline script was not written, `<div id="__PYREON_LOADER_DATA__">` and its siblings were taken for server data or for a bridge function:

- `@pyreon/zero`: `startClient` took the element for server loader data, skipped the initial loader run, and rendered the page without its data. It now runs the loaders.
- `@pyreon/server`, `@pyreon/zero`: `startClient` and zero's islands runtime called an element shadowing `__PYREON_HYDRATE_STORES__` (no `@pyreon/store` on the page), throwing "is not a function". The bridge is now called only when it is a function.
- `@pyreon/router`: `hydrateLoaderData(router, data)` applies only a plain record (an object literal or a null-prototype object) and returns whether it did. Its `data` parameter is now `unknown`, so pass `window.__PYREON_LOADER_DATA__` as it is; `?? {}` does not catch an element.
- `@pyreon/store`: `hydrateStores(data)` ignores anything that is not a plain record. Its parameter is now `unknown`.
- `@pyreon/styler`: the sheet calls the per-request SSR scope slot only when it is a function, so `reset()` on the client no longer throws on such markup.
