# @pyreon/router

Type-safe client-side router for Pyreon with hash and history modes, nested routes, guards, loaders, and scroll restoration.

## Install

```bash
bun add @pyreon/router
```

## Quick Start

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink } from '@pyreon/router'

const router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/user/:id', component: UserPage, name: 'user' },
    {
      path: '/admin',
      component: AdminLayout,
      children: [{ path: 'users', component: AdminUsers }],
    },
    { path: '/old-path', redirect: '/new-path' },
    { path: '/dashboard', component: lazy(() => import('./Dashboard')) },
    { path: '(.*)', component: NotFound },
  ],
})

const App = () => (
  <RouterProvider router={router}>
    <RouterView />
  </RouterProvider>
)
```

## Typed Params

Route parameters are inferred from path strings:

```tsx
const route = useRoute<'/user/:id'>()
route().params.id // string
```

## Named Navigation

```tsx
const router = useRouter()
router.push({ name: 'user', params: { id: '42' } })
```

## RouterLink

```tsx
<RouterLink to="/user/42">Profile</RouterLink>
<RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>
```

## Data Loaders

```tsx
import { useLoaderData, prefetchLoaderData } from '@pyreon/router'

const data = useLoaderData<typeof loader>()
```

## API

### Router Creation

- `createRouter(options: RouterOptions)` -- create a router instance
- `lazy(loader)` -- define a lazily loaded route component

### Hooks

- `useRouter()` -- access the router instance
- `useRoute<Path>()` -- access the current resolved route with typed params
- `useLoaderData<T>()` -- access data returned by a route loader

### Components

- `RouterProvider` -- provides router context to the tree
- `RouterView` -- renders the matched route component
- `RouterLink` -- anchor element with client-side navigation

### Utilities

- `resolveRoute(routes, path)` -- match a path against route definitions
- `parseQuery(search)` / `parseQueryMulti(search)` -- parse query strings
- `stringifyQuery(params)` -- serialize query parameters
- `buildPath(pattern, params)` -- build a path from a pattern and params
- `findRouteByName(routes, name)` -- look up a named route
- `prefetchLoaderData(router, path)` -- prefetch loader data for a path
- `serializeLoaderData(router)` / `hydrateLoaderData(router, data)` -- SSR serialization

### Types

`ExtractParams`, `RouteMeta`, `ResolvedRoute`, `RouteRecord`, `RouterOptions`, `Router`, `NavigationGuard`, `AfterEachHook`, `ScrollBehaviorFn`, `LoaderContext`, `RouteLoaderFn`

## View Transitions

Route changes are wrapped in `document.startViewTransition()` automatically when the browser supports it. Opt out per-route with `meta: { viewTransition: false }`.

`await router.push()` / `.replace()` resolves once the DOM has committed to the new route -- specifically, when the ViewTransition's `updateCallbackDone` promise settles. It does NOT wait for the full animation (`.finished`, 200-300ms), because blocking every programmatic navigation on an animation is unacceptable.

| Promise | Resolves when | Router awaits? |
| --- | --- | --- |
| `updateCallbackDone` | Callback done; DOM swapped; state live | yes |
| `ready` | Snapshot captured, pseudo-elements ready | no -- `.catch()` only |
| `finished` | Full animation completed | no -- `.catch()` only |

`afterEach` hooks and scroll restoration fire after the VT callback completes, so they observe the new route state when invoked.
