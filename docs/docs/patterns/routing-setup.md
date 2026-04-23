---
title: "Router setup"
summary: "createRouter with typed routes, named navigation, loaders, and RouterView."
seeAlso: [signal-writes, reactive-context]
---

# Router setup

## The pattern

Define routes at module scope, wrap the app in a provider, mount `<RouterView />`:

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink } from '@pyreon/router'

const router = createRouter({
  routes: [
    { path: '/', name: 'home', component: Home },
    {
      path: '/user/:id',
      name: 'user',
      component: UserPage,
      loader: async ({ params }) => api.fetchUser(params.id),
      loaderKey: ({ params }) => `user-${params.id}`,  // for cache identity
    },
    { path: '/admin', name: 'admin', component: Admin, guard: adminOnly },
  ],
})

<RouterProvider router={router}>
  <nav>
    <RouterLink name="home">Home</RouterLink>
    <RouterLink name="user" params={{ id: '42' }}>User 42</RouterLink>
  </nav>
  <RouterView />
</RouterProvider>
```

For typed named navigation, constrain the `Router` generic:

```ts
const router = createRouter<'home' | 'user' | 'admin'>({ routes })

router.push({ name: 'home' })        // ok
router.push({ name: 'typo' })        // TS error at compile time
```

## Key APIs

- `router.push({ name, params?, search? })` — navigate forward (history entry added)
- `router.replace(...)` — navigate without adding a history entry
- `useRoute()` — signal that reads the current resolved route
- `useIsActive(path, exact?)` — `Signal<boolean>` for active-link styling
- `useTypedSearchParams({ page: 'number' })` — coerced + typed query params
- `router.invalidateLoader(key?)` — clear loader cache entries

`await router.push(...)` resolves AFTER the route's view-transition callback commits, so the next line can read the new route immediately.

## Why

Pyreon's router is context-based + signal-driven. Routes are resolved into `Signal<ResolvedRoute>` so `RouterView` re-renders only when the route changes, not when unrelated state changes. Typed routes catch dead navigation calls at compile time — a rename in the routes array surfaces as a TypeScript error across every `router.push` / `<RouterLink name>` site.

## Anti-pattern

```tsx
// BROKEN — mutating window.location directly bypasses the router
window.location.pathname = '/user/42'  // full page reload, loses SPA state

// Correct:
router.push({ name: 'user', params: { id: '42' } })
```

```tsx
// BROKEN — useRoute() called at module scope
const route = useRoute()   // hooks require an active component setup context

// Correct: call inside a component body
function UserPage() {
  const route = useRoute()
  return <div>{() => route().params.id}</div>
}
```

```tsx
// BROKEN — router.push inside the render body triggers infinite loops
function Redirect() {
  router.push({ name: 'home' })   // renders, pushes, renders, pushes…
  return null
}

// Correct: push from onMount or an event handler (detector:
// no-imperative-navigate-in-render catches this in the lint rule)
function Redirect() {
  onMount(() => router.push({ name: 'home' }))
  return null
}
```

## Related

- Reference API: `createRouter`, `useRoute`, `RouterView`, `RouterLink` — `get_api({ package: "router", symbol: "..." })`
- Lint rule: `pyreon/no-imperative-navigate-in-render`
- Anti-pattern: "`const handleClick = () => router.push(…); handleClick()` in render body"
