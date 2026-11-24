---
'@pyreon/router': minor
---

A navigation that changes only the query or the hash no longer remounts the route component (#4814). `<RouterView>` decides whether to remount by the matched route records, their params and the route's loader key, not by the full URL. This holds for `push`, `replace`, Back/Forward, nested layouts and tab stacks. A search box written to the URL with `router.replace`, `useSearchParams().set` or `@pyreon/url-state` keeps its focus and local state on every keystroke.

- The page's `params`, `query` and `meta` props are live. The page being replaced keeps its own params until it unmounts.
- The page still remounts when its params or its loader key (`loaderKey`, else path + params) change.
- Loader data that changes under the same key (`revalidate()`, `staleWhileRevalidate`, `gcTime: 0`, a server loader) is delivered in place through the new `useLoaderDataAccessor()`. A page that read the `useLoaderData()` snapshot is remounted for new data instead, so it never shows stale data.
- A route error boundary showing its `errorComponent` is remounted on any navigation, so it recovers. The error page's `params` / `query` are live too.
- New `NavigateOptions` for `push` / `replace`: `{ scroll?: boolean, viewTransition?: boolean }`. A `replace()` that changes only the query (same route, params and hash) defaults both to `false`. Every other navigation defaults to `true`. With `scroll: false` the `scrollBehavior` option is not consulted. `useSearchParams` / `useTypedSearchParams` setters pass `{ scroll: false, viewTransition: false }`.

**Migration.** A page no longer re-runs its body on a query- or hash-only navigation. Code that read the query ONCE in the body (`const page = props.query.page`, or an `onMount` fetch keyed on the query) stops updating. Read the query inside an accessor, `effect` or `computed` instead: `() => props.query.page`, `useRoute()().query`, or `useSearchParams()`. Alternatively, make a query-dependent route `loader` declare a `loaderKey` that includes the query, which remounts the page per key.
