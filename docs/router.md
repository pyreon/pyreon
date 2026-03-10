# Router

`@pyreon/router` is a client-side router with hash and history mode support, nested routes, navigation guards, lazy routes, data loaders, link prefetching, and typed param/query access.

## Installation

```bash
bun add @pyreon/router
```

## Quick Start

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink } from "@pyreon/router"
import { lazy } from "@pyreon/router"
import { Suspense } from "@pyreon/core"

const router = createRouter({
  mode: "history",
  routes: [
    { path: "/",        component: Home },
    { path: "/about",   component: About },
    { path: "/user/:id", component: UserPage, name: "user" },
    { path: "/settings", component: lazy(() => import("./Settings")) },
    { path: "/admin", component: AdminLayout, children: [
      { path: "users", component: AdminUsers },
      { path: "reports", component: AdminReports },
    ]},
    { path: "(.*)", component: NotFound },
  ],
})

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
      <Suspense fallback={<p>Loading...</p>}>
        <RouterView />
      </Suspense>
    </RouterProvider>
  )
}

mount(document.getElementById("app")!, <App />)
```

## createRouter

```ts
import { createRouter } from "@pyreon/router"

const router = createRouter(options)
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `routes` | `RouteRecord[]` | required | Route definitions |
| `mode` | `"hash" \| "history"` | `"hash"` | URL strategy |
| `url` | `string` | — | Initial URL for SSR (when `window` is unavailable) |
| `scrollBehavior` | `ScrollBehaviorFn \| "top" \| "restore" \| "none"` | `"top"` | Scroll behavior on navigation |
| `maxCacheSize` | `number` | `100` | Max cached lazy components (LRU eviction) |
| `onError` | `(err, route) => undefined \| false` | — | Loader error handler. Return `false` to cancel navigation. |

### Route Definition

```ts
interface RouteRecord {
  path: string                    // "/user/:id", "/files/*", "(.*)"
  component: ComponentFn | LazyComponent
  name?: string                   // for named navigation
  meta?: RouteMeta                // custom metadata
  children?: RouteRecord[]        // nested routes
  redirect?: string | ((to) => string)
  loader?: RouteLoaderFn          // data loader
  errorComponent?: ComponentFn    // shown when loader fails
  beforeEnter?: NavigationGuard | NavigationGuard[]
  beforeLeave?: NavigationGuard | NavigationGuard[]
}
```

### Path Patterns

| Pattern | Matches |
| --- | --- |
| `/about` | Exact match |
| `/user/:id` | `/user/42`, `/user/alice` |
| `/files/*` | `/files/a/b/c` |
| `(.*)` | Catch-all / 404 |

## RouterProvider

Wraps the application and provides the router via context. Automatically calls `router.destroy()` on unmount to clean up event listeners and caches.

```tsx
<RouterProvider router={router}>
  {/* App content */}
</RouterProvider>
```

There must be exactly one `RouterProvider` in the application.

## RouterView

Renders the component matched by the current URL. For nested routes, each `RouterView` renders one level of the matched route hierarchy.

```tsx
function Layout() {
  return (
    <div class="layout">
      <Sidebar />
      <main>
        <RouterView />
      </main>
    </div>
  )
}
```

### Nested Routes

Nested routes are defined with `children` in the route config. The parent route's component renders a `<RouterView />` where child content appears.

```tsx
const router = createRouter({
  routes: [
    {
      path: "/admin",
      component: AdminLayout,
      children: [
        { path: "users",   component: AdminUsers },
        { path: "reports", component: AdminReports },
      ],
    },
  ],
})

// AdminLayout renders a nested RouterView:
function AdminLayout() {
  return (
    <div class="admin">
      <AdminSidebar />
      <main>
        <RouterView />  {/* renders AdminUsers or AdminReports */}
      </main>
    </div>
  )
}
```

Each `RouterView` tracks its nesting depth automatically. The first `RouterView` renders `matched[0]`, the second renders `matched[1]`, and so on.

## RouterLink

Renders an `<a>` tag that navigates without a full page reload. Adds active classes when the link matches the current path.

```tsx
<RouterLink to="/about">About</RouterLink>
<RouterLink to="/user/42" replace>User 42</RouterLink>
```

### Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `to` | `string` | required | Target path |
| `replace` | `boolean` | `false` | Use `replaceState` instead of `pushState` |
| `activeClass` | `string` | `"router-link-active"` | Class applied when active (prefix match) |
| `exactActiveClass` | `string` | `"router-link-exact-active"` | Class for exact match |
| `exact` | `boolean` | `false` | Only apply `activeClass` on exact match |
| `prefetch` | `"hover" \| "viewport" \| "none"` | `"hover"` | Prefetch strategy for loader data |

### Link Prefetching

`RouterLink` can prefetch loader data before the user navigates:

- `"hover"` (default) — prefetches when the user hovers over the link
- `"viewport"` — prefetches when the link scrolls into view (uses `IntersectionObserver`)
- `"none"` — no prefetching

```tsx
<RouterLink to="/dashboard" prefetch="viewport">Dashboard</RouterLink>
```

Prefetch results are cached per router instance. Each path is only prefetched once.

## useRouter

Returns the router instance for programmatic navigation.

```tsx
import { useRouter } from "@pyreon/router"

function LogoutButton() {
  const router = useRouter()

  return (
    <button onClick={() => {
      logout()
      router.push("/login")
    }}>
      Log out
    </button>
  )
}
```

### Router Methods

| Method | Signature | Description |
| --- | --- | --- |
| `push` | `push(path: string): Promise<void>` | Navigate to path, add history entry |
| `push` | `push({ name, params?, query? }): Promise<void>` | Navigate by route name |
| `replace` | `replace(path: string): Promise<void>` | Navigate, replace history entry |
| `back` | `back(): void` | Go back in history |
| `beforeEach` | `beforeEach(guard): () => void` | Register a navigation guard. Returns unregister function. |
| `afterEach` | `afterEach(hook): () => void` | Register a post-navigation hook. Returns unregister function. |
| `destroy` | `destroy(): void` | Remove event listeners, clear caches, abort in-flight navigations |
| `currentRoute` | `readonly () => ResolvedRoute` | Reactive getter for the current route |
| `loading` | `readonly () => boolean` | True while guards/loaders are running |

## useRoute

Returns the current resolved route as a reactive signal.

```tsx
import { useRoute } from "@pyreon/router"

function UserPage() {
  const route = useRoute()

  return (
    <div>
      <h1>User {() => route().params.id}</h1>
      <p>Tab: {() => route().query.tab ?? "overview"}</p>
    </div>
  )
}
```

### Route Object

| Property | Type | Description |
| --- | --- | --- |
| `path` | `string` | Current matched path |
| `params` | `Record<string, string>` | URL params from `:param` segments |
| `query` | `Record<string, string>` | Query string params |
| `hash` | `string` | URL hash fragment |
| `matched` | `RouteRecord[]` | All matched records from root to leaf |
| `meta` | `RouteMeta` | Merged metadata from matched route |

## Navigation Guards

Guards run before each navigation and can redirect, cancel, or allow it.

```ts
const removeGuard = router.beforeEach((to, from) => {
  if (to.path.startsWith("/admin") && !isAdmin()) {
    return "/login"  // redirect
  }
  // return nothing or true to allow
  // return false to cancel
})

// Later, remove the guard:
removeGuard()
```

### Guard Signature

```ts
type NavigationGuard = (
  to: ResolvedRoute,
  from: ResolvedRoute
) => string | false | void | Promise<string | false | void>
```

Guards can be async. Navigation is deferred until the promise resolves.

### Per-Route Guards

```ts
{
  path: "/admin",
  component: AdminLayout,
  beforeEnter: (to, from) => {
    if (!isAdmin()) return "/login"
  },
  beforeLeave: (to, from) => {
    if (hasUnsavedChanges()) return false  // cancel navigation
  },
}
```

### After-Each Hooks

`afterEach` runs after each successful navigation. Useful for analytics and logging.

```ts
const removeHook = router.afterEach((to, from) => {
  analytics.pageView(to.path)
})

// Later:
removeHook()
```

## Data Loaders

Route records can define a `loader` function that runs before navigation commits. The result is accessible via `useLoaderData()` inside the component.

```ts
import { useLoaderData } from "@pyreon/router"

const routes = [
  {
    path: "/user/:id",
    component: UserPage,
    loader: async ({ params, signal }) => {
      const res = await fetch(`/api/users/${params.id}`, { signal })
      return res.json()
    },
    errorComponent: UserError,
  },
]

function UserPage() {
  const user = useLoaderData<User>()
  return <h1>{user.name}</h1>
}
```

### Loader Context

```ts
interface LoaderContext {
  params: Record<string, string>
  query: Record<string, string>
  signal: AbortSignal  // aborted when a newer navigation supersedes this one
}
```

Sibling loaders run in parallel. If a loader throws, the route's `errorComponent` is rendered (if defined), or the `onError` handler is called.

### Prefetching Loader Data

Loader data can be prefetched programmatically or via `RouterLink`'s `prefetch` prop:

```ts
import { prefetchLoaderData } from "@pyreon/router"

// Programmatic prefetch
await prefetchLoaderData(router, "/user/42")
```

### SSR Serialization

Loader data can be serialized on the server and hydrated on the client:

```ts
import { serializeLoaderData, hydrateLoaderData } from "@pyreon/router"

// Server: after rendering
const data = serializeLoaderData(router)
// Inject into HTML as JSON

// Client: before hydration
hydrateLoaderData(router, data)
```

## Named Routes

Give routes a `name` and navigate by name instead of path:

```ts
const router = createRouter({
  routes: [
    { path: "/user/:id", component: UserPage, name: "user" },
  ],
})

// Navigate by name:
router.push({ name: "user", params: { id: "42" } })
```

## Typed Params

Route parameters are inferred from path strings at the type level:

```ts
const route = useRoute<"/user/:id">()
route().params.id  // string — type-safe
```

## Route Meta

Attach custom metadata to routes. Extend `RouteMeta` via module augmentation for type safety:

```ts
// globals.d.ts
declare module "@pyreon/router" {
  interface RouteMeta {
    requiresRole?: "admin" | "user"
    pageTitle?: string
  }
}
```

```ts
{
  path: "/admin",
  component: AdminLayout,
  meta: { requiresAuth: true, title: "Admin" },
}
```

Built-in meta fields: `title`, `description`, `requiresAuth`, `scrollBehavior`.

## Lazy Routes

```ts
import { lazy } from "@pyreon/router"

const router = createRouter({
  routes: [
    {
      path: "/dashboard",
      component: lazy(() => import("./Dashboard"), {
        loading: LoadingSpinner,  // shown while loading
        error: ChunkError,        // shown after retries fail
      }),
    },
  ],
})
```

Lazy components are cached after first load (up to `maxCacheSize`). Failed chunks are retried 3 times with exponential backoff. Stale chunks (post-deploy 404s) trigger a full page reload.

Pair with `Suspense` at the `RouterView` level to show a loading state:

```tsx
<Suspense fallback={<PageSpinner />}>
  <RouterView />
</Suspense>
```

## Hash vs History Mode

**Hash mode** (default): URLs look like `/#/about`. No server configuration needed.

**History mode**: URLs look like `/about`. Requires the server to serve `index.html` for all paths.

```ts
const router = createRouter({
  mode: "history",
  routes: [...],
})
```

## Scroll Behavior

```ts
const router = createRouter({
  routes: [...],
  scrollBehavior: "restore",  // "top" | "restore" | "none"
})
```

Or use a function for custom logic:

```ts
scrollBehavior: (to, from, savedPosition) => {
  if (savedPosition !== null) return savedPosition
  if (to.hash) return to.hash  // scroll to anchor
  return "top"
}
```

Per-route override via `meta.scrollBehavior`:

```ts
{ path: "/feed", component: Feed, meta: { scrollBehavior: "restore" } }
```

## Router Cleanup

`RouterProvider` automatically calls `router.destroy()` when it unmounts. This removes `popstate`/`hashchange` event listeners, clears the component cache and loader data, and aborts in-flight navigations.

You can also call `destroy()` manually:

```ts
router.destroy()
```

`destroy()` is idempotent — safe to call multiple times.

## SSR

Pass the request URL so the router resolves the correct route on the server:

```ts
const router = createRouter({
  routes: [...],
  url: req.url,
})
```

## Gotchas

**`useRouter()` and `useRoute()` must be called inside a `RouterProvider`.** Calling them outside throws.

**Guards that redirect can loop.** Ensure redirect conditions exclude the redirect target itself.

```ts
// Infinite loop if /login also matches:
router.beforeEach(to => {
  if (!isAuthed() && to.path !== "/login") return "/login"
})
```

**Params are strings.** URL params are always strings. Parse numbers explicitly.

```ts
const id = Number(route().params.id)
```

**Hash mode and `<base>` tags conflict.** Do not use both.
