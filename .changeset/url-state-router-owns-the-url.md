---
'@pyreon/url-state': patch
'@pyreon/router': patch
---

url-state: ask the router which part of the URL owns the route

`useUrlState` read `location.search` and wrote `${location.pathname}?${search}`
unconditionally. `@pyreon/router` defaults to `mode: 'hash'`, where the whole
route — query included — lives in the fragment (`#/products?page=3`) and
`location.search` is empty. So under the documented `setUrlRouter(useRouter())`
bridge, a single `page.set(3)` handed the router `/?page=3`, which it wrote as
`#/?page=3`: the app left `#/products` on the first filter change, and the value
never read back.

Three fixes, all from the same wrong assumption:

- **Hash mode** — the query is now read from, and written into, the fragment
  beside the route path, so a param update keeps the app where it is.
- **The fragment is preserved** on history-mode writes (router and raw-history
  alike). `/docs#installation` used to become `/docs?page=2`, jumping the reader
  back to the top of the page on every change.
- **A sub-path deploy** gets a base-relative path: the router prepends `base`
  itself, so passing `location.pathname` produced `/app/app/products?page=2`.

`UrlRouter` gained optional `mode` and `_base` fields; `useRouter()` satisfies
both structurally, so nothing changes at the call site. A router without `mode`
(hand-rolled) still means history mode, and without a registered router
url-state owns `location.search` exactly as before.

In `@pyreon/router`, `mode` moves from the internal `RouterInstance` type onto
the public `Router` type. It was always present on the router object — only the
public type omitted it, which is what let the wrong assumption look correct.
