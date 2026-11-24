---
'@pyreon/router': minor
---

A navigation that changes only the query or the hash no longer remounts the route component (#4814). `<RouterView>` decides whether to remount by the matched route records, their params and the route's loader key, not by the full URL. This holds for `push`, `replace`, Back/Forward, nested layouts and tab stacks. A search box written to the URL with `router.replace`, `useSearchParams().set` or `@pyreon/url-state` keeps its focus and local state on every keystroke.

- The page's `params`, `query` and `meta` props are live. The page being replaced keeps its own params until it unmounts.
- The page still remounts when its params or its loader key (`loaderKey`, else path + params) change.
- **`useLoaderData()` returns an accessor `() => T`**, like `useRoute()` / `useMiddlewareData()`. Loader data that changes under the same key (`revalidate()`, `staleWhileRevalidate`, `gcTime: 0`, a server loader) arrives in place, and the page is never remounted for it. The page being replaced never sees the next page's data, and a consumer re-runs only when the data itself changes.
- A route error boundary showing its `errorComponent` is remounted on any navigation, so it recovers. The error page receives live `params` / `query` plus `error` and `reset`; `reset()` recovers in place.
- `<RouterLink>` takes `scroll` and `viewTransition` props, forwarded as `NavigateOptions`.
- New `NavigateOptions` for `push` / `replace`: `{ scroll?: boolean, viewTransition?: boolean }`. A `replace()` that changes only the query (same route, params and hash) defaults both to `false`. Every other navigation defaults to `true`. With `scroll: false` the `scrollBehavior` option is not consulted. `useSearchParams` / `useTypedSearchParams` setters pass `{ scroll: false, viewTransition: false }`.

**Migration.**

`useLoaderData()` now returns an accessor. Call it where the value is used:

```tsx
// before
const data = useLoaderData<Post>()
return <h1>{data.title}</h1>
// after
const data = useLoaderData<Post>()
return <h1>{data().title}</h1>
```

Destructuring (`const { title } = useLoaderData()`) and reading `data()` once into a body `const` no longer follow the data. Use `{data().title}` in JSX, `<For each={() => data().items}>`, `<Show when={() => data().post}>`, `useHead(() => ({ title: data().title }))`, or an `effect` / `computed`. An early `if (!data) return …` in the body becomes a returned accessor: `return () => (data() ? <Page /> : null)`. On native (PMTC) the accessor shape lowers to the same Swift/Kotlin reads; a destructure is no longer lowered and warns.

A page no longer re-runs its body on a query- or hash-only navigation. Code that read the query ONCE in the body (`const page = props.query.page`, or an `onMount` fetch keyed on the query) stops updating. Read the query inside an accessor, `effect` or `computed` instead: `() => props.query.page`, `useRoute()().query`, or `useSearchParams()`. Alternatively, make a query-dependent route `loader` declare a `loaderKey` that includes the query, which remounts the page per key.
