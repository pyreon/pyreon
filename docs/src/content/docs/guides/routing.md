---
title: "Client-Side Routing"
description: "How to set up routes, navigate, read params and typed search params, guard navigation, and load data with @pyreon/router."
---

# Client-Side Routing

`@pyreon/router` is Pyreon's signal-native router: hash + history + SSR modes, context-based, with prefetching, guards, loaders, typed search params, and View Transitions. Route state is reactive — navigating patches only the `<RouterView>` subtree that changed, never the whole tree.

## When to use it

- Any multi-page SPA, or the client half of an SSR/SSG app.
- You want data loaders, route-level error/pending components, or navigation guards.

## When **not** to use it

- A `@pyreon/zero` app — Zero's file-system router wires `@pyreon/router` for you from `src/routes/`. Use the router directly only outside Zero, or for advanced programmatic control.

## Setup

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink } from '@pyreon/router'

const router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/users/:id', component: User },
  ],
})

export function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/users/1">User 1</RouterLink>
      </nav>
      <RouterView />
    </RouterProvider>
  )
}
```

`RouterLink` is prefetch-on-intent by default (hover **and** focus, so keyboard users get the same head-start). It also sets `aria-current="page"` when active.

Here is route matching driven by a reactive path signal:

<Example file="./examples/router/router-signal-backed-path-matching" />

## Reading params and search

```tsx
import { useParams, useTypedSearchParams } from '@pyreon/router'

function User() {
  const params = useParams()                 // { id: '1' }
  const search = useTypedSearchParams({ page: 'number', q: 'string' })
  // search().page is a number (coerced), NaN-guarded to 0
  return <h1>{() => `User ${params().id}, page ${search().page}`}</h1>
}
```

## Navigating programmatically

```tsx
import { useNavigate } from '@pyreon/router'

function Logout() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/login')}>Log out</button>
}
```

`await router.push(...)` resolves once the new route's DOM commit is done (it awaits `updateCallbackDone`, not the full View-Transition animation) — so you can inspect the new route immediately after.

## Loaders, guards, and boundaries

- **Loaders** — `loader: ({ params, request }) => fetchData(params.id)`; read with `useLoaderData()`. `loaderKey` controls cache identity; `gcTime` controls expiry; `router.invalidateLoader(key?)` clears it.
- **Redirect from a loader** — `throw redirect('/login')` runs BEFORE the layout renders (SSR returns a real 302/307; CSR replaces). Use this for auth gates instead of an `onMount` push.
- **404** — `throw notFound()` triggers the nearest `NotFoundBoundary`.
- **Pending / error** — `pendingComponent` (with `pendingMs` / `pendingMinMs`) shows while a loader runs; `errorComponent` catches render errors.
- **Guards** — global `beforeEach` / `afterEach`, per-route `beforeEnter`; throw `router.redirect()` inside a guard (re-entry-safe).

## Common pitfalls

- **`router.push(...)` synchronously in a component body.** That runs on every render → infinite navigation loop. Navigate only inside event handlers, `onMount`, or loaders. (`@pyreon/lint`'s `no-imperative-navigate-in-render` flags the synchronous-body case; nested handlers are fine.)
- **`useTransition()` / `useMiddlewareData()` are accessors.** Call them: `useTransition()()` is the boolean. They are not destructurable objects.
- **Auth gate via `onMount` + push.** It briefly renders the gated layout before redirecting (leaking structure to anonymous users). Use a loader `throw redirect(...)` instead.

## Related

- [Router reference](/docs/reference/router) — every export with signatures
- [Router package guide](/docs/router)
- [SSR, SSG & ISR](/docs/guides/ssr-ssg-isr)
- [Data Fetching](/docs/guides/data-fetching)
