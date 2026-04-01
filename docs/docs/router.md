---
title: '@pyreon/router'
description: Type-safe client-side router with nested routes, navigation guards, data loaders, and scroll restoration.
---

`@pyreon/router` is Pyreon's type-safe client-side router. It supports nested routes, TypeScript param inference from path strings, navigation guards, data loaders, lazy loading with retries, scroll restoration, and both hash and history mode.

<PackageBadge name="@pyreon/router" href="/docs/router" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/router
```

```bash [bun]
bun add @pyreon/router
```

```bash [pnpm]
pnpm add @pyreon/router
```

```bash [yarn]
yarn add @pyreon/router
```

:::

## Quick Start

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'

const router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
    { path: '/user/:id', component: UserPage, name: 'user' },
    { path: '(.*)', component: NotFound },
  ],
})

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
      <RouterView />
    </RouterProvider>
  )
}

mount(<App />, document.getElementById('app')!)
```

## createRouter

Create a router instance. Accepts a `RouterOptions` object or a shorthand array of `RouteRecord[]`.

```ts
const router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
  ],
  mode: 'history', // "hash" (default) or "history"
  scrollBehavior: 'restore', // "top" | "restore" | "none" | ScrollBehaviorFn
})

// Shorthand -- just pass the routes array:
const router = createRouter([
  { path: '/', component: Home },
  { path: '/about', component: About },
])
```

### RouterOptions

```ts
interface RouterOptions {
  routes: RouteRecord[]
  mode?: 'hash' | 'history'
  base?: string
  scrollBehavior?: ScrollBehaviorFn | 'top' | 'restore' | 'none'
  trailingSlash?: 'strip' | 'add' | 'ignore'
  url?: string
  onError?: (err: unknown, route: ResolvedRoute) => undefined | false
  maxCacheSize?: number
}
```

| Option           | Type                                               | Default   | Description                                                                                                                                        |
| ---------------- | -------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes`         | `RouteRecord[]`                                    | required  | Route definitions                                                                                                                                  |
| `mode`           | `"hash" \| "history"`                              | `"hash"`  | URL mode                                                                                                                                           |
| `base`           | `string`                                           | `""`      | Base path for sub-path deployments (e.g. `"/app"`). Must start with `/`. Only applies in history mode.                                             |
| `scrollBehavior` | `ScrollBehaviorFn \| "top" \| "restore" \| "none"` | `"top"`   | Scroll behavior on navigation                                                                                                                      |
| `trailingSlash`  | `"strip" \| "add" \| "ignore"`                     | `"strip"` | Trailing slash handling: `"strip"` removes trailing slashes before matching, `"add"` ensures paths end with `/`, `"ignore"` does no normalization. |
| `url`            | `string`                                           | -         | Initial URL for SSR (when `window.location` is unavailable)                                                                                        |
| `onError`        | `(err, route) => undefined \| false`               | -         | Global loader error handler. Return `false` to cancel navigation.                                                                                  |
| `maxCacheSize`   | `number`                                           | `100`     | Max number of resolved lazy components to cache (LRU eviction)                                                                                     |

**Hash mode vs history mode:**

```ts
// Hash mode (default): URLs like /#/about
const router = createRouter({ routes, mode: 'hash' })

// History mode: clean URLs like /about (requires server-side fallback)
const router = createRouter({ routes, mode: 'history' })
```

Hash mode uses `window.location.hash` and listens to `hashchange` events. History mode uses `pushState`/`replaceState` and listens to `popstate` events. History mode requires your server to serve the app for all routes (SPA fallback).

**Base path (sub-directory deployment):**

When deploying to a sub-path like `https://example.com/app/`, set the `base` option. The router strips the base before matching and prepends it when building URLs.

```ts
const router = createRouter({
  routes,
  mode: 'history',
  base: '/app',
})

// router.push("/about") navigates to /app/about
// URL /app/user/42 matches route /user/:id with params.id = "42"
```

**Trailing slash normalization:**

```ts
// Strip trailing slashes (default) — /about/ becomes /about
createRouter({ routes, trailingSlash: 'strip' })

// Always add trailing slash — /about becomes /about/
createRouter({ routes, trailingSlash: 'add' })

// No normalization — match paths exactly as-is
createRouter({ routes, trailingSlash: 'ignore' })
```

**Error handling:**

```ts
const router = createRouter({
  routes,
  onError: (err, route) => {
    console.error(`Loader failed for ${route.path}:`, err)
    // Return false to cancel the navigation
    // Return undefined to continue with undefined loader data
    return false
  },
})
```

## Route Records

```ts
interface RouteRecord<TPath extends string = string> {
  path: TPath
  component: RouteComponent
  name?: string
  meta?: RouteMeta
  redirect?: string | ((to: ResolvedRoute) => string)
  beforeEnter?: NavigationGuard | NavigationGuard[]
  beforeLeave?: NavigationGuard | NavigationGuard[]
  alias?: string | string[]
  children?: RouteRecord[]
  loader?: RouteLoaderFn
  staleWhileRevalidate?: boolean
  errorComponent?: ComponentFn
}
```

| Field                  | Type                                   | Description                                                                                |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `path`                 | `string`                               | Path pattern with `:param` segments                                                        |
| `component`            | `ComponentFn \| LazyComponent`         | Component to render, or a `lazy()` wrapper                                                 |
| `name`                 | `string`                               | Optional name for named navigation                                                         |
| `meta`                 | `RouteMeta`                            | Route metadata (title, auth, scroll, custom fields)                                        |
| `redirect`             | `string \| (to) => string`             | Redirect target, evaluated before guards                                                   |
| `beforeEnter`          | `NavigationGuard \| NavigationGuard[]` | Guard(s) run before entering this route                                                    |
| `beforeLeave`          | `NavigationGuard \| NavigationGuard[]` | Guard(s) run before leaving this route                                                     |
| `alias`                | `string \| string[]`                   | Alternative path(s) that render the same component and share guards, loaders, and metadata |
| `children`             | `RouteRecord[]`                        | Nested child routes                                                                        |
| `loader`               | `RouteLoaderFn`                        | Data loader function                                                                       |
| `staleWhileRevalidate` | `boolean`                              | When true, show cached loader data immediately and revalidate in the background            |
| `errorComponent`       | `ComponentFn`                          | Component shown when the loader fails                                                      |

### Path Patterns

The router supports several path pattern types:

**Static paths:**

```ts
{ path: "/about", component: About }
{ path: "/contact", component: Contact }
```

**Dynamic param segments:**

Segments prefixed with `:` capture the corresponding path segment as a named parameter.

```ts
{ path: "/user/:id", component: UserPage }
// /user/42 => params.id = "42"

{ path: "/user/:id/posts/:postId", component: PostPage }
// /user/42/posts/7 => params.id = "42", params.postId = "7"
```

**Splat (catch-rest) params:**

Params ending with `*` capture the rest of the path, including slashes.

```ts
{ path: "/files/:path*", component: FileBrowser }
// /files/docs/readme.md => params.path = "docs/readme.md"
// /files/images/logo.png => params.path = "images/logo.png"
```

**Optional params:**

Params suffixed with `?` match zero or one segments. The param type becomes `string | undefined`.

```ts
{ path: "/user/:id?", component: UserPage }
// /user => params.id = undefined
// /user/42 => params.id = "42"

{ path: "/page/:page?/settings/:setting?", component: SettingsPage }
// /page/settings => params.page = undefined, params.setting = undefined
// /page/1/settings/theme => params.page = "1", params.setting = "theme"
```

Optional params work with `ExtractParams` type inference:

```ts
type Params = ExtractParams<'/user/:id?'>
// { id?: string | undefined }
```

When building paths with `buildPath()`, optional segments are omitted when no value is provided:

```ts
buildPath('/user/:id?', {}) // "/user"
buildPath('/user/:id?', { id: '42' }) // "/user/42"
```

**Wildcard (catch-all):**

The pattern `(.*)` matches any path. Use it as the last route for 404 pages.

```ts
{ path: "(.*)", component: NotFound }
// or equivalently:
{ path: "*", component: NotFound }
```

**Route matching order:**

Routes are matched in definition order. The first match wins. Place more specific routes before less specific ones:

```ts
const routes = [
  { path: '/', component: Home },
  { path: '/user/me', component: MyProfile }, // specific
  { path: '/user/:id', component: UserProfile }, // dynamic
  { path: '/user/:id/posts', component: UserPosts },
  { path: '(.*)', component: NotFound }, // catch-all last
]
```

### TypeScript Param Inference

Route params are automatically inferred from the path string using the `ExtractParams` type:

```ts
import { useRoute } from '@pyreon/router'

// Inside a route with path "/user/:id/posts/:postId":
const route = useRoute<'/user/:id/posts/:postId'>()

route().params.id // string (typed!)
route().params.postId // string (typed!)
// route().params.foo  // TypeScript error -- "foo" does not exist
```

The `ExtractParams` utility type works at compile time:

```ts
import type { ExtractParams } from '@pyreon/router'

type UserParams = ExtractParams<'/user/:id'>
// { id: string }

type PostParams = ExtractParams<'/user/:id/posts/:postId'>
// { id: string; postId: string }

type FileParams = ExtractParams<'/files/:path*'>
// { path: string }

type HomeParams = ExtractParams<'/'>
// Record<never, never> (empty object)
```

### Nested Routes

Child routes are rendered inside the parent's component via a nested `RouterView`. The parent route's path acts as a prefix for all children.

```tsx
const routes = [
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true },
    children: [
      { path: 'users', component: AdminUsers }, // matches /admin/users
      { path: 'settings', component: AdminSettings }, // matches /admin/settings
      { path: 'users/:id', component: AdminUserDetail }, // matches /admin/users/42
    ],
  },
]

function AdminLayout() {
  return (
    <div class="admin">
      <Sidebar />
      <main>
        <RouterView /> {/* renders AdminUsers, AdminSettings, or AdminUserDetail */}
      </main>
    </div>
  )
}
```

**Multi-level nesting:**

Routes can be nested to any depth. Each level needs its own `RouterView`.

```tsx
const routes = [
  {
    path: '/dashboard',
    component: DashboardLayout,
    children: [
      {
        path: 'analytics',
        component: AnalyticsLayout,
        children: [
          { path: 'overview', component: AnalyticsOverview }, // /dashboard/analytics/overview
          { path: 'reports', component: AnalyticsReports }, // /dashboard/analytics/reports
        ],
      },
      { path: 'settings', component: DashboardSettings }, // /dashboard/settings
    ],
  },
]

function DashboardLayout() {
  return (
    <div class="dashboard">
      <DashboardNav />
      <RouterView /> {/* level 1: AnalyticsLayout or DashboardSettings */}
    </div>
  )
}

function AnalyticsLayout() {
  return (
    <div class="analytics">
      <AnalyticsTabs />
      <RouterView /> {/* level 2: AnalyticsOverview or AnalyticsReports */}
    </div>
  )
}
```

**How depth tracking works:**

Each `RouterView` captures `router._viewDepth` at setup time and increments it, so sibling and child views get the correct index into the `matched[]` array. When a `RouterView` unmounts, the counter decrements. This means each `RouterView` automatically renders the correct nesting level without any manual configuration.

### Route Metadata

Attach metadata to routes via the `meta` property. Metadata is merged from root to leaf -- deeper routes override parent values.

```ts
interface RouteMeta {
  title?: string // Sets document.title on navigation
  description?: string // Page description (for meta tags)
  requiresAuth?: boolean // Guards can check this
  scrollBehavior?: 'top' | 'restore' | 'none'
}
```

```ts
const routes = [
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, title: 'Admin' },
    children: [
      { path: 'users', component: AdminUsers, meta: { title: 'Admin - Users' } },
      { path: 'settings', component: AdminSettings, meta: { title: 'Admin - Settings' } },
    ],
  },
]

// Navigating to /admin/users:
// route.meta = { requiresAuth: true, title: "Admin - Users" }
// (title from child overrides parent, requiresAuth is inherited)
```

The router automatically sets `document.title` when `meta.title` is present.

**Extending `RouteMeta` via module augmentation:**

Add custom fields to `RouteMeta` for your app:

```ts
// globals.d.ts
declare module '@pyreon/router' {
  interface RouteMeta {
    requiresRole?: 'admin' | 'user' | 'guest'
    breadcrumb?: string
    transition?: 'fade' | 'slide'
    cacheable?: boolean
  }
}
```

Then use the custom fields in your route definitions:

```ts
const routes = [
  {
    path: '/admin',
    component: AdminLayout,
    meta: {
      requiresAuth: true,
      requiresRole: 'admin',
      breadcrumb: 'Admin',
    },
    children: [
      {
        path: 'users',
        component: AdminUsers,
        meta: { breadcrumb: 'Users', transition: 'slide' },
      },
    ],
  },
]
```

### Redirects

```ts
// Static redirect
{ path: "/old-page", redirect: "/new-page" }

// Dynamic redirect with access to the resolved route
{ path: "/legacy/:id", redirect: (to) => `/v2/${to.params.id}` }
```

Redirects are evaluated before guards. The router detects circular redirects (max depth 10) and aborts with a console error.

```ts
const routes = [
  // Redirect /home to /
  { path: '/home', redirect: '/' },

  // Redirect with param forwarding
  { path: '/profile/:id', redirect: (to) => `/user/${to.params.id}` },

  // Redirect preserving query params
  { path: '/search-old', redirect: (to) => `/search?q=${to.query.q ?? ''}` },

  // Actual routes
  { path: '/', component: Home },
  { path: '/user/:id', component: UserPage },
  { path: '/search', component: SearchPage },
]
```

### Route Aliases

Aliases let a route be reachable from multiple paths. The alias renders the same component and shares guards, loaders, and metadata with the original route.

```ts
const routes = [
  {
    path: '/user/:id',
    component: UserProfile,
    alias: '/profile/:id', // single alias
  },
  {
    path: '/settings',
    component: Settings,
    alias: ['/preferences', '/config'], // multiple aliases
  },
]
```

Aliases are useful for backwards compatibility (keeping old URLs working) and providing multiple entry points to the same view.

### Stale While Revalidate

When `staleWhileRevalidate: true` is set on a route with a loader, the router shows cached data immediately on navigation and revalidates in the background. Once fresh data arrives, the component re-renders.

```ts
const routes = [
  {
    path: '/feed',
    component: Feed,
    loader: async ({ signal }) => {
      const res = await fetch('/api/feed', { signal })
      return res.json()
    },
    staleWhileRevalidate: true,
  },
]
```

This only applies when navigating to a route that already has cached loader data (e.g., the user previously visited it). On the first visit, the loader runs normally and navigation waits for it to complete.

## Components

### RouterProvider

Wraps your app and provides the router instance to all descendant components via Pyreon's context system.

```tsx
interface RouterProviderProps {
  router: Router
  children?: VNode | VNodeChild | null
}
```

```tsx
<RouterProvider router={router}>
  <App />
</RouterProvider>
```

`RouterProvider` does several things:

1. Pushes the router into Pyreon's context stack so `useRouter()` and `useRoute()` work in descendants.
2. Sets a module-level fallback so `useRouter()` works from event handlers outside the component tree.
3. Cleans up on unmount: removes event listeners, clears caches, aborts in-flight navigations.

### RouterView

Renders the matched route component at the current nesting level. Place one at each level of your route nesting.

```tsx
interface RouterViewProps {
  router?: Router // optional -- uses context by default
}
```

```tsx
function App() {
  return (
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>
  )
}

// In a nested layout:
function AdminLayout() {
  return (
    <div>
      <Sidebar />
      <RouterView /> {/* renders the matched child route */}
    </div>
  )
}
```

`RouterView` handles lazy-loaded components automatically: it shows the loading component while the chunk loads, retries on failure, and shows the error component after all retries are exhausted.

When a route has a loader, `RouterView` wraps the route component with a `LoaderDataContext` provider so `useLoaderData()` works inside.

### RouterLink

A reactive link component that renders an `<a>` tag with automatic active class management and prefetching.

```tsx
interface RouterLinkProps {
  to: string
  replace?: boolean
  activeClass?: string
  exactActiveClass?: string
  exact?: boolean
  prefetch?: 'hover' | 'viewport' | 'none'
  children?: VNodeChild | null
}
```

**Basic usage:**

```tsx
<RouterLink to="/about">About</RouterLink>
```

**With all props:**

```tsx
<RouterLink
  to="/users"
  activeClass="nav-active"
  exactActiveClass="nav-exact"
  exact
  prefetch="viewport"
  replace
>
  Users
</RouterLink>
```

| Prop               | Type                              | Default                      | Description                                                      |
| ------------------ | --------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `to`               | `string`                          | required                     | Navigation target path                                           |
| `replace`          | `boolean`                         | `false`                      | Use `replace` instead of `push`                                  |
| `activeClass`      | `string`                          | `"router-link-active"`       | Class when link is active (current path starts with link target) |
| `exactActiveClass` | `string`                          | `"router-link-exact-active"` | Class on exact path match                                        |
| `exact`            | `boolean`                         | `false`                      | Only apply activeClass on exact match                            |
| `prefetch`         | `"hover" \| "viewport" \| "none"` | `"hover"`                    | Prefetch strategy for loader data                                |

**Active class behavior:**

The active class is segment-aware. `/admin` is a prefix of `/admin/users` but NOT of `/admin-panel`.

```tsx
// Current path: /admin/users

<RouterLink to="/admin">Admin</RouterLink>
// class="router-link-active" (prefix match)

<RouterLink to="/admin/users">Users</RouterLink>
// class="router-link-active router-link-exact-active" (exact match)

<RouterLink to="/">Home</RouterLink>
// No active class (/ is not applied as prefix by default)
```

**Navigation behavior:**

`RouterLink` renders a standard `<a>` tag with an `onClick` handler that calls `e.preventDefault()` and uses `router.push()` (or `router.replace()` if `replace` is set). The `href` attribute is set correctly for both hash and history mode:

- Hash mode: `href="#/about"`
- History mode: `href="/about"`

#### Prefetch Strategies

Prefetching runs the target route's loader in advance so data is ready when the user navigates.

- **`"hover"`** (default) -- prefetch loader data when the user hovers over the link. Best for navigation menus.
- **`"viewport"`** -- prefetch when the link scrolls into the viewport (via IntersectionObserver). Best for content lists.
- **`"none"`** -- no prefetching. Use for links the user is unlikely to click.

```tsx
// Main navigation -- prefetch on hover
<nav>
  <RouterLink to="/" prefetch="hover">Home</RouterLink>
  <RouterLink to="/about" prefetch="hover">About</RouterLink>
</nav>

// Content list -- prefetch when visible
<ul>
  {posts.map(post => (
    <li>
      <RouterLink to={`/post/${post.id}`} prefetch="viewport">
        {post.title}
      </RouterLink>
    </li>
  ))}
</ul>

// Rarely-used link -- no prefetch
<RouterLink to="/terms" prefetch="none">Terms of Service</RouterLink>
```

Prefetching is deduplicated per router instance: each path is only prefetched once.

## Hooks

### useRouter

Access the router instance from any component inside a `RouterProvider`:

```ts
function useRouter(): Router
```

```tsx
import { useRouter } from '@pyreon/router'

function MyComponent() {
  const router = useRouter()

  const goHome = () => router.push('/')
  const goBack = () => router.back()
  const isLoading = () => router.loading()

  return (
    <div>
      <button onClick={goHome}>Home</button>
      <button onClick={goBack}>Back</button>
      {isLoading() && <span>Loading...</span>}
    </div>
  )
}
```

Throws if called outside a `RouterProvider`.

### useRoute

Access the current resolved route as a reactive signal:

```ts
function useRoute<TPath extends string = string>(): () => ResolvedRoute<ExtractParams<TPath>>
```

```tsx
import { useRoute } from '@pyreon/router'

function Breadcrumb() {
  const route = useRoute()

  return (
    <nav>
      <span>{route().path}</span>
      {Object.entries(route().query).map(([k, v]) => (
        <span>
          {k}={v}
        </span>
      ))}
    </nav>
  )
}
```

**With typed params:**

```tsx
function UserProfile() {
  const route = useRoute<'/user/:id'>()

  return <p>User ID: {route().params.id}</p>
  // route().params.id is typed as string
}
```

The resolved route includes:

```ts
interface ResolvedRoute<
  P extends Record<string, string> = Record<string, string>,
  Q extends Record<string, string> = Record<string, string>,
> {
  path: string // The matched path (without query or hash)
  params: P // Extracted route params
  query: Q // Parsed query string
  hash: string // Hash fragment (without #)
  matched: RouteRecord[] // All matched records from root to leaf
  meta: RouteMeta // Merged metadata from all matched records
}
```

### useSearchParams

Reactive read/write access to URL query parameters:

```ts
function useSearchParams<T extends Record<string, string>>(
  defaults?: T,
): [get: () => T, set: (updates: Partial<T>) => Promise<void>]
```

```tsx
import { useSearchParams } from '@pyreon/router'

function SearchPage() {
  const [query, setQuery] = useSearchParams({ q: '', page: '1' })

  return (
    <div>
      <input value={query().q} onInput={(e) => setQuery({ q: e.currentTarget.value })} />
      <p>Page: {query().page}</p>
      <button onClick={() => setQuery({ page: String(Number(query().page) + 1) })}>
        Next Page
      </button>
    </div>
  )
}
```

The `defaults` object provides fallback values for missing query params. `set()` navigates to the current path with updated params (existing params are preserved, only specified keys are changed).

### useBlocker

Register a navigation blocker to prevent the user from leaving a page:

```ts
function useBlocker(fn: BlockerFn): { remove(): void }

type BlockerFn = (to: ResolvedRoute, from: ResolvedRoute) => boolean | Promise<boolean>
```

Return `true` (or resolve to `true`) to block navigation. The blocker also installs a `beforeunload` handler to catch tab closures.

```tsx
import { useBlocker } from '@pyreon/router'

function Editor() {
  const dirty = signal(false)

  useBlocker((to, from) => {
    if (!dirty()) return false
    return !window.confirm('You have unsaved changes. Leave anyway?')
  })

  return <textarea onInput={() => dirty.set(true)} />
}
```

The blocker is automatically removed when the component unmounts. You can also remove it manually via the returned `&#123; remove &#125;` object.

### onBeforeRouteLeave

In-component guard called before the user navigates away from the current route:

```ts
function onBeforeRouteLeave(guard: NavigationGuard): () => void
```

```tsx
import { onBeforeRouteLeave } from '@pyreon/router'

function EditorPage() {
  onBeforeRouteLeave((to, from) => {
    if (hasUnsavedChanges()) {
      return false // cancel navigation
    }
  })

  return <div>...</div>
}
```

Returns an unregister function. Automatically cleaned up on component unmount.

### onBeforeRouteUpdate

In-component guard called when the route changes but the component is reused (e.g., `/user/1` to `/user/2`):

```ts
function onBeforeRouteUpdate(guard: NavigationGuard): () => void
```

```tsx
import { onBeforeRouteUpdate } from '@pyreon/router'

function UserProfile() {
  onBeforeRouteUpdate(async (to, from) => {
    // Confirm before switching to a different user
    if (to.params.id !== from.params.id) {
      const ok = window.confirm(`Switch to user ${to.params.id}?`)
      if (!ok) return false
    }
  })

  return <div>...</div>
}
```

## Navigation

### Programmatic Navigation

The router provides several navigation methods:

```ts
const router = useRouter()

// Navigate by path
await router.push('/user/42')

// Navigate by name with params
await router.push({ name: 'user', params: { id: '42' } })

// Navigate by name with query
await router.push({ name: 'search', query: { q: 'pyreon' } })

// Replace current history entry (no new entry in browser history)
await router.replace('/new-path')

// Replace with named route
await router.replace({ name: 'user', params: { id: '42' } })

// Go back / forward / arbitrary delta
router.back()
router.forward()
router.go(-2) // go back 2 steps
router.go(1) // same as forward()
```

**Named navigation:**

Named routes avoid hardcoding paths. Give routes a `name` and navigate with an object:

```ts
const routes = [
  { path: '/user/:id', component: UserPage, name: 'user' },
  { path: '/user/:id/posts/:postId', component: PostPage, name: 'post' },
]

// Navigate by name
router.push({ name: 'user', params: { id: '42' } })
// => /user/42

router.push({ name: 'post', params: { id: '42', postId: '7' } })
// => /user/42/posts/7

// With query params
router.push({ name: 'user', params: { id: '42' }, query: { tab: 'posts' } })
// => /user/42?tab=posts
```

If a named route does not exist, the router logs a warning and navigates to `/`.

**Navigation is async:**

`push()` and `replace()` return promises that resolve after all guards, loaders, and the navigation commit have completed. This is useful for sequential navigation:

```tsx
async function handleLogin() {
  await authenticate()
  await router.push('/dashboard')
  // Navigation is complete, dashboard is rendered
}
```

**Security:**

The router blocks `javascript:` and `data:` URIs in navigation targets. Attempting to navigate to such a URI logs a warning and redirects to `/`.

```ts
router.push('javascript:alert(1)') // blocked, navigates to /
router.push('data:text/html,...') // blocked, navigates to /
```

### Navigation Guards

Guards run before navigation commits and can cancel, redirect, or allow navigation.

#### Guard Execution Order

1. **`beforeLeave`** guards on the current (FROM) route's matched records
2. **`beforeEnter`** guards on the target (TO) route's matched records
3. **Global `beforeEach`** guards

Each group runs in order. If any guard cancels or redirects, subsequent guards do not run.

#### Global Guards

```ts
// Before each navigation
const removeGuard = router.beforeEach(async (to, from) => {
  // Check authentication
  if (to.meta.requiresAuth && !isAuthenticated()) {
    return '/login' // redirect to login
  }
  // return undefined or true to allow
  // return false to cancel
})

// Remove the guard later
removeGuard()
```

```ts
// After each navigation (cannot cancel or redirect)
const removeHook = router.afterEach((to, from) => {
  analytics.trackPageView(to.path)
})

removeHook()
```

`afterEach` hooks run after the navigation has committed. They receive `to` and `from` resolved routes but cannot affect the navigation. Errors thrown in `afterEach` hooks are caught and logged.

#### Per-Route Guards

```ts
const routes = [
  {
    path: '/admin',
    component: AdminLayout,
    beforeEnter: (to, from) => {
      if (!isAdmin()) return '/unauthorized'
    },
    beforeLeave: (to, from) => {
      if (hasUnsavedChanges()) return false // cancel navigation
    },
  },
]
```

**Multiple guards per route:**

```ts
{
  path: "/admin/settings",
  component: AdminSettings,
  beforeEnter: [
    // Guard 1: check auth
    (to, from) => {
      if (!isAuthenticated()) return "/login"
    },
    // Guard 2: check role
    (to, from) => {
      if (!isAdmin()) return "/unauthorized"
    },
  ],
}
```

#### Guard Return Values

| Return      | Effect                |
| ----------- | --------------------- |
| `undefined` | Allow navigation      |
| `true`      | Allow navigation      |
| `false`     | Cancel navigation     |
| `string`    | Redirect to that path |

#### Async Guards

Guards can be async. The router awaits each guard before proceeding. If a newer navigation starts while guards are running, the current navigation is cancelled (stale generation detection).

```ts
router.beforeEach(async (to, from) => {
  // Async check
  const allowed = await checkPermission(to.path)
  if (!allowed) return '/forbidden'
})
```

#### Navigation Guard Types

```ts
type NavigationGuardResult = boolean | string | undefined

type NavigationGuard = (
  to: ResolvedRoute,
  from: ResolvedRoute,
) => NavigationGuardResult | Promise<NavigationGuardResult>

type AfterEachHook = (to: ResolvedRoute, from: ResolvedRoute) => void
```

## Data Loaders

Route loaders run before navigation commits, in parallel with sibling loaders. The result is accessible via `useLoaderData()` inside the route component.

```ts
const routes = [
  {
    path: "/users",
    component: Users,
    loader: async ({ params, query, signal }) => {
      const res = await fetch("/api/users", { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    errorComponent: UsersError, // shown if loader fails
  },
]

function Users() {
  const users = useLoaderData<User[]>()
  return (
    <ul>
      {users.map(u => <li>{u.name}</li>)}
    </ul>
  )
}

function UsersError() {
  return <p>Failed to load users. Please try again.</p>
}
```

### LoaderContext

```ts
interface LoaderContext {
  params: Record<string, string> // Route params
  query: Record<string, string> // Query string params
  signal: AbortSignal // Aborted when a newer navigation starts
}
```

The `signal` is crucial for cancellation: if the user navigates away before the loader finishes, the signal is aborted. Always pass it to `fetch()` and other async operations.

### Loader Behavior

- **Parallel execution:** All loaders in the matched route stack run in parallel via `Promise.allSettled`.
- **Cancellation:** When a new navigation starts, the previous navigation's AbortController is aborted. Loaders that check `signal.aborted` or pass `signal` to `fetch()` will be cancelled.
- **Error handling:** If a loader throws and the route has an `errorComponent`, it is rendered instead of the route component. If no `errorComponent` is defined, the route component renders with `undefined` data.
- **Data cleanup:** Loader data for routes no longer in the matched stack is pruned after each navigation.

### Loaders with Route Params

```ts
const routes = [
  {
    path: "/user/:id",
    component: UserProfile,
    loader: async ({ params, signal }) => {
      const res = await fetch(`/api/users/${params.id}`, { signal })
      return res.json()
    },
  },
  {
    path: "/search",
    component: SearchResults,
    loader: async ({ query, signal }) => {
      const res = await fetch(`/api/search?q=${query.q ?? ""}`, { signal })
      return res.json()
    },
  },
]

function UserProfile() {
  const user = useLoaderData<User>()
  return <h1>{user.name}</h1>
}

function SearchResults() {
  const results = useLoaderData<SearchResult[]>()
  return (
    <ul>
      {results.map(r => <li>{r.title}</li>)}
    </ul>
  )
}
```

### Nested Route Loaders

Each route in the matched stack can have its own loader. All loaders run in parallel.

```tsx
const routes = [
  {
    path: '/org/:orgId',
    component: OrgLayout,
    loader: async ({ params, signal }) => {
      const res = await fetch(`/api/orgs/${params.orgId}`, { signal })
      return res.json()
    },
    children: [
      {
        path: 'members',
        component: OrgMembers,
        loader: async ({ params, signal }) => {
          const res = await fetch(`/api/orgs/${params.orgId}/members`, { signal })
          return res.json()
        },
      },
    ],
  },
]

function OrgLayout() {
  const org = useLoaderData<Organization>()
  return (
    <div>
      <h1>{org.name}</h1>
      <RouterView />
    </div>
  )
}

function OrgMembers() {
  const members = useLoaderData<Member[]>()
  return (
    <ul>
      {members.map((m) => (
        <li>{m.name}</li>
      ))}
    </ul>
  )
}
```

### SSR Data Loaders

For SSR, prefetch loader data before rendering, serialize it into the HTML, and hydrate it on the client:

**Server:**

```tsx
import { createRouter, prefetchLoaderData, serializeLoaderData } from '@pyreon/router'
import { renderToString } from '@pyreon/runtime-server'

// In your SSR handler:
const router = createRouter({ routes, url: req.url })

// Run all loaders for the matched route
await prefetchLoaderData(router, req.url)

// Render the app
const html = await renderToString(<App />)

// Serialize loader data for client hydration
const loaderData = JSON.stringify(serializeLoaderData(router))

// Include in HTML response:
const page = `
<!DOCTYPE html>
<html>
  <body>
    <div id="app">${html}</div>
    <script>window.__PYREON_LOADER_DATA__=${loaderData}</script>
    <script src="/client.js"></script>
  </body>
</html>
`
```

**Client:**

```tsx
import { createRouter, hydrateLoaderData } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'

const router = createRouter({ routes })

// Hydrate loader data so initial render uses server-fetched data
hydrateLoaderData(router, window.__PYREON_LOADER_DATA__ ?? {})

mount(<App />, document.getElementById('app')!)
```

`serializeLoaderData` uses route path patterns as keys (stable across server and client). `hydrateLoaderData` populates the router's internal `_loaderData` map so the initial render uses server-fetched data without re-running loaders.

## Lazy Loading

Use the `lazy()` helper for code-splitting route components:

```ts
import { lazy } from '@pyreon/router'

const routes = [
  {
    path: '/dashboard',
    component: lazy(() => import('./pages/Dashboard'), {
      loading: LoadingSpinner, // shown while loading
      error: LoadError, // shown if all retries fail
    }),
  },
  {
    path: '/settings',
    component: lazy(() => import('./pages/Settings')),
    // No loading or error component -- renders null while loading
  },
]
```

```ts
function lazy(
  loader: () => Promise<ComponentFn | { default: ComponentFn }>,
  options?: { loading?: ComponentFn; error?: ComponentFn },
): LazyComponent
```

### Lazy Loading Features

- **Automatic retries** -- 3 attempts with exponential backoff (500ms, 1s, 2s).
- **Stale chunk detection** -- If a chunk fails with a `TypeError` ("Failed to fetch") or `SyntaxError`, the router assumes a post-deploy stale chunk and triggers a full page reload.
- **Loading component** -- Optional component shown during loading. If not provided, `null` is rendered.
- **Error component** -- Optional component shown after all retries fail. If not provided, `null` is rendered.
- **LRU cache** -- Resolved components are cached in a per-router `Map`. When the cache exceeds `maxCacheSize` (default 100), the oldest entry is evicted.

```tsx
function LoadingSpinner() {
  return <div class="spinner">Loading...</div>
}

function LoadError() {
  return (
    <div class="error">
      <p>Failed to load this page.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  )
}
```

### Lazy Component Resolution

The `lazy()` loader function should return either a component function directly or a module with a `default` export:

```ts
// Default export (standard ESM module)
lazy(() => import('./pages/Dashboard'))
// The router extracts mod.default

// Direct component export
lazy(() => import('./pages/Dashboard').then((m) => m.DashboardPage))
// The router uses the function directly
```

## Scroll Behavior

Control scroll position on navigation:

```ts
const router = createRouter({
  routes,
  scrollBehavior: 'restore',
})
```

### Scroll Options

| Value             | Behavior                                        |
| ----------------- | ----------------------------------------------- |
| `"top"` (default) | Scroll to top on every navigation               |
| `"restore"`       | Restore saved scroll position, fall back to top |
| `"none"`          | Don't touch scroll position                     |

The scroll manager saves `window.scrollY` before each navigation and restores it after the navigation commits.

### Per-Route Scroll Override

Override the global scroll behavior for specific routes via metadata:

```ts
{ path: "/modal", component: Modal, meta: { scrollBehavior: "none" } }
{ path: "/settings", component: Settings, meta: { scrollBehavior: "restore" } }
```

Per-route `meta.scrollBehavior` takes precedence over the global setting.

### Custom Scroll Function

For advanced control, pass a function:

```ts
type ScrollBehaviorFn = (
  to: ResolvedRoute,
  from: ResolvedRoute,
  savedPosition: number | null,
) => 'top' | 'restore' | 'none' | number

const router = createRouter({
  routes,
  scrollBehavior: (to, from, savedPosition) => {
    // Restore position for back/forward navigation
    if (savedPosition !== null) return 'restore'

    // Don't scroll for hash navigation
    if (to.hash) return 'none'

    // Scroll to a specific position
    if (to.path === '/long-page') return 500

    // Default: scroll to top
    return 'top'
  },
})
```

The `savedPosition` parameter is `null` if the target path has no saved position (i.e., it is a new visit, not a back/forward navigation).

Returning a `number` scrolls to that exact pixel offset from the top.

## Router API

The full `Router` interface:

```ts
interface Router {
  /** Navigate to a path or named route */
  push(path: string): Promise<void>
  push(location: {
    name: string
    params?: Record<string, string>
    query?: Record<string, string>
  }): Promise<void>

  /** Replace current history entry */
  replace(path: string): Promise<void>
  replace(location: {
    name: string
    params?: Record<string, string>
    query?: Record<string, string>
  }): Promise<void>

  /** Go back in history */
  back(): void

  /** Go forward in history */
  forward(): void

  /** Navigate by delta steps in history */
  go(delta: number): void

  /** Register a global before-navigation guard. Returns an unregister function. */
  beforeEach(guard: NavigationGuard): () => void

  /** Register a global after-navigation hook. Returns an unregister function. */
  afterEach(hook: AfterEachHook): () => void

  /** Current resolved route (reactive signal -- call it to read) */
  readonly currentRoute: () => ResolvedRoute

  /** True while a navigation (guards + loaders) is in flight */
  readonly loading: () => boolean

  /** Promise that resolves once the initial navigation completes */
  isReady(): Promise<void>

  /** Remove all event listeners, clear caches, abort in-flight navigations */
  destroy(): void
}
```

**The `loading` signal:**

`router.loading()` returns `true` while a navigation is in progress (guards running, loaders fetching). Use it to show global loading indicators:

```tsx
function App() {
  const router = useRouter()

  return (
    <div>
      {router.loading() && <div class="global-loading-bar" />}
      <RouterView />
    </div>
  )
}
```

**The `isReady` method:**

`isReady()` returns a promise that resolves once the initial navigation (including guards and loaders) completes. Use it to delay rendering until the router is fully initialized:

```tsx
const router = createRouter({ routes })

await router.isReady()
mount(<App />, document.getElementById('app')!)
```

**The `destroy` method:**

Call `destroy()` to clean up the router: remove `popstate`/`hashchange` listeners, clear component and loader caches, abort in-flight navigations. `RouterProvider` calls `destroy()` automatically on unmount, so you typically do not need to call it manually.

## Utility Functions

### Query String Utilities

```ts
import { parseQuery, parseQueryMulti, stringifyQuery } from '@pyreon/router'
```

#### `parseQuery`

Parses a query string into a `Record<string, string>`. Duplicate keys are overwritten (last wins).

```ts
parseQuery('name=Alice&age=30')
// { name: "Alice", age: "30" }

parseQuery('key=value&empty&encoded=%20hello')
// { key: "value", empty: "", encoded: " hello" }

parseQuery('')
// {}
```

#### `parseQueryMulti`

Parses a query string preserving duplicate keys as arrays. Single-value keys remain strings.

```ts
parseQueryMulti('color=red&color=blue&size=lg')
// { color: ["red", "blue"], size: "lg" }

parseQueryMulti('tag=a&tag=b&tag=c')
// { tag: ["a", "b", "c"] }

parseQueryMulti('single=value')
// { single: "value" } -- not wrapped in an array
```

#### `stringifyQuery`

Converts a query object to a query string with a leading `?`. Returns an empty string if the object is empty.

```ts
stringifyQuery({ name: 'Alice', age: '30' })
// "?name=Alice&age=30"

stringifyQuery({ q: 'hello world' })
// "?q=hello%20world"

stringifyQuery({})
// ""
```

### Route Resolution Utilities

```ts
import { resolveRoute, buildPath, findRouteByName } from '@pyreon/router'
```

#### `resolveRoute`

Resolve a raw path (including query string and hash) against the route tree. Returns a `ResolvedRoute`.

```ts
const routes = [{ path: '/user/:id', component: User, name: 'user' }]

const resolved = resolveRoute('/user/42?tab=posts#section', routes)
// {
//   path: "/user/42",
//   params: { id: "42" },
//   query: { tab: "posts" },
//   hash: "section",
//   matched: [{ path: "/user/:id", ... }],
//   meta: {}
// }
```

If no route matches, returns an empty resolved route:

```ts
const resolved = resolveRoute('/nonexistent', routes)
// { path: "/nonexistent", params: {}, query: {}, hash: "", matched: [], meta: {} }
```

#### `buildPath`

Build a path string from a route pattern and params. Encodes param values.

```ts
buildPath('/user/:id', { id: '42' })
// "/user/42"

buildPath('/user/:id/posts/:postId', { id: '42', postId: '7' })
// "/user/42/posts/7"

// Splat params preserve slashes
buildPath('/files/:path*', { path: 'docs/readme.md' })
// "/files/docs/readme.md"
```

#### `findRouteByName`

Find a route record by name (recursive search, O(n)). Returns `null` if not found.

```ts
const routes = [
  { path: '/', component: Home },
  { path: '/user/:id', component: User, name: 'user' },
  {
    path: '/admin',
    component: Admin,
    children: [{ path: 'settings', component: Settings, name: 'admin-settings' }],
  },
]

findRouteByName('user', routes)
// { path: "/user/:id", component: User, name: "user" }

findRouteByName('admin-settings', routes)
// { path: "settings", component: Settings, name: "admin-settings" }

findRouteByName('nonexistent', routes)
// null
```

For repeated lookups (e.g., inside navigation), the router internally uses `buildNameIndex()` which creates an O(1) name-to-record `Map` at startup.

## Real-World Patterns

### Authentication-Protected Routes

```tsx
// routes.ts
const routes = [
  { path: '/login', component: LoginPage },
  {
    path: '/dashboard',
    component: DashboardLayout,
    meta: { requiresAuth: true },
    children: [
      { path: 'overview', component: Overview },
      { path: 'settings', component: Settings },
    ],
  },
  { path: '/', redirect: '/dashboard/overview' },
  { path: '(.*)', component: NotFound },
]

// auth.ts
import { createRouter } from '@pyreon/router'

const router = createRouter({ routes, mode: 'history' })

// Global auth guard
router.beforeEach(async (to, from) => {
  if (to.meta.requiresAuth && !isAuthenticated()) {
    // Save the intended destination for post-login redirect
    sessionStorage.setItem('redirect', to.path)
    return '/login'
  }
})

// After login, redirect to saved destination
async function handleLogin(credentials: Credentials) {
  await authenticate(credentials)
  const redirect = sessionStorage.getItem('redirect') || '/dashboard/overview'
  sessionStorage.removeItem('redirect')
  await router.push(redirect)
}
```

### Role-Based Access Control

```tsx
// Extend RouteMeta
declare module '@pyreon/router' {
  interface RouteMeta {
    requiredRole?: 'admin' | 'editor' | 'viewer'
  }
}

const routes = [
  {
    path: '/admin',
    component: AdminPanel,
    meta: { requiresAuth: true, requiredRole: 'admin' },
    beforeEnter: (to, from) => {
      const user = getCurrentUser()
      if (user?.role !== to.meta.requiredRole) {
        return '/unauthorized'
      }
    },
  },
]
```

### Breadcrumbs

```tsx
// Extend RouteMeta with breadcrumb labels
declare module '@pyreon/router' {
  interface RouteMeta {
    breadcrumb?: string
  }
}

const routes = [
  {
    path: '/products',
    component: ProductsLayout,
    meta: { breadcrumb: 'Products' },
    children: [
      { path: '', component: ProductList },
      {
        path: ':id',
        component: ProductDetail,
        meta: { breadcrumb: 'Details' },
        children: [{ path: 'reviews', component: ProductReviews, meta: { breadcrumb: 'Reviews' } }],
      },
    ],
  },
]

function Breadcrumbs() {
  const route = useRoute()

  return (
    <nav class="breadcrumbs">
      {route()
        .matched.filter((r) => r.meta?.breadcrumb)
        .map((r, i, arr) => (
          <span>
            {i > 0 && ' / '}
            {i < arr.length - 1 ? (
              <RouterLink to={buildPath(r.path, route().params)}>{r.meta!.breadcrumb}</RouterLink>
            ) : (
              <span>{r.meta!.breadcrumb}</span>
            )}
          </span>
        ))}
    </nav>
  )
}
```

### 404 Handling

```tsx
const routes = [
  { path: '/', component: Home },
  { path: '/about', component: About },
  // Catch-all: must be last
  { path: '(.*)', component: NotFoundPage, meta: { title: 'Page Not Found' } },
]

function NotFoundPage() {
  const route = useRoute()
  const router = useRouter()

  return (
    <div class="not-found">
      <h1>404 - Page Not Found</h1>
      <p>
        The page <code>{route().path}</code> does not exist.
      </p>
      <button onClick={() => router.push('/')}>Go Home</button>
    </div>
  )
}
```

### Unsaved Changes Warning

```tsx
const routes = [
  {
    path: '/editor',
    component: Editor,
    beforeLeave: (to, from) => {
      // Check for unsaved changes before navigating away
      if (hasUnsavedChanges()) {
        const confirmed = window.confirm('You have unsaved changes. Leave anyway?')
        if (!confirmed) return false // cancel navigation
      }
    },
  },
]
```

### Nested Layout with Shared Sidebar

```tsx
const routes = [
  {
    path: '/app',
    component: AppLayout,
    children: [
      { path: 'inbox', component: Inbox, meta: { title: 'Inbox' } },
      { path: 'sent', component: Sent, meta: { title: 'Sent' } },
      { path: 'drafts', component: Drafts, meta: { title: 'Drafts' } },
      {
        path: 'settings',
        component: SettingsLayout,
        children: [
          { path: 'profile', component: ProfileSettings },
          { path: 'notifications', component: NotificationSettings },
        ],
      },
    ],
  },
]

function AppLayout() {
  return (
    <div class="app-layout">
      <aside class="sidebar">
        <RouterLink to="/app/inbox">Inbox</RouterLink>
        <RouterLink to="/app/sent">Sent</RouterLink>
        <RouterLink to="/app/drafts">Drafts</RouterLink>
        <RouterLink to="/app/settings/profile">Settings</RouterLink>
      </aside>
      <main>
        <RouterView />
      </main>
    </div>
  )
}

function SettingsLayout() {
  return (
    <div class="settings-layout">
      <nav class="settings-tabs">
        <RouterLink to="/app/settings/profile">Profile</RouterLink>
        <RouterLink to="/app/settings/notifications">Notifications</RouterLink>
      </nav>
      <RouterView />
    </div>
  )
}
```

### Analytics Tracking

```tsx
const router = createRouter({ routes })

router.afterEach((to, from) => {
  // Track page views
  analytics.page({
    path: to.path,
    title: to.meta.title,
    referrer: from.path,
  })
})
```

### Loading Indicator

```tsx
function GlobalLoadingBar() {
  const router = useRouter()

  return (
    <div
      class="loading-bar"
      style={{
        opacity: router.loading() ? 1 : 0,
        transition: 'opacity 200ms',
      }}
    />
  )
}
```

### Conditional Redirect Based on State

```tsx
const routes = [
  {
    path: '/onboarding',
    redirect: () => {
      const step = getOnboardingStep()
      if (step === 'complete') return '/dashboard'
      return `/onboarding/step-${step}`
    },
  },
  { path: '/onboarding/step-1', component: OnboardingStep1 },
  { path: '/onboarding/step-2', component: OnboardingStep2 },
  { path: '/onboarding/step-3', component: OnboardingStep3 },
]
```

## SSR Considerations

### Server-Side Routing

On the server, pass the request URL to `createRouter` via the `url` option:

```ts
const router = createRouter({ routes, url: req.url })
```

This is necessary because `window.location` is unavailable on the server. The router uses `url` to resolve the initial route.

### Context Isolation

`RouterProvider` pushes the router into Pyreon's context stack. In SSR with `@pyreon/runtime-server`, contexts are isolated per request via AsyncLocalStorage, so concurrent requests do not share state.

The module-level `_activeRouter` fallback is set by `RouterProvider` for CSR convenience (so `useRouter()` works from event handlers outside the component tree). In concurrent SSR, always use the context-based approach (i.e., ensure `useRouter()` is called within a component tree wrapped by `RouterProvider`).

### SSR Lifecycle

A typical SSR flow:

1. Create the router with `url: req.url`
2. Prefetch loader data with `prefetchLoaderData(router, req.url)`
3. Render the app to string
4. Serialize loader data with `serializeLoaderData(router)` and embed in HTML
5. On the client, create a new router and hydrate with `hydrateLoaderData(router, data)`
6. Mount the app

```tsx
// Server
import { createRouter, prefetchLoaderData, serializeLoaderData } from '@pyreon/router'
import { renderToString } from '@pyreon/runtime-server'

export async function handleRequest(req: Request): Promise<Response> {
  const router = createRouter({ routes, url: new URL(req.url).pathname })

  await prefetchLoaderData(router, new URL(req.url).pathname)

  const html = await renderToString(
    <RouterProvider router={router}>
      <RouterView />
    </RouterProvider>,
  )

  const loaderData = JSON.stringify(serializeLoaderData(router))

  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="app">${html}</div>
        <script>window.__PYREON_LOADER_DATA__=${loaderData}</script>
        <script type="module" src="/client.js"></script>
      </body>
    </html>
  `,
    { headers: { 'content-type': 'text/html' } },
  )
}
```

## Typed Search Params

`useTypedSearchParams` provides type-safe access to URL query parameters with automatic coercion:

```ts
import { useTypedSearchParams } from '@pyreon/router'

const params = useTypedSearchParams({
  page: 'number',
  q: 'string',
  active: 'boolean',
})

params.page() // number (coerced from URL string)
params.q() // string
params.active() // boolean

params.set({ page: 2, q: 'hello' }) // updates URL
```

The type map supports `'string'`, `'number'`, and `'boolean'`. Values are coerced automatically from URL search param strings.

## Route Transitions

`useTransition` provides a reactive signal indicating whether a route transition is in progress:

```tsx
import { useTransition } from '@pyreon/router'

function App() {
  const { isTransitioning } = useTransition()

  return (
    <div>
      {isTransitioning() && <ProgressBar />}
      <RouterView />
    </div>
  )
}
```

The signal is `true` from the start of navigation (guard evaluation, loader fetching) until the route component is mounted.

## View Transitions API

Route navigations are automatically wrapped in `document.startViewTransition()` when the browser supports the View Transitions API. This provides smooth CSS-driven transitions between pages with zero configuration.

To opt out for a specific route, set `meta.viewTransition: false`:

```ts
{
  path: '/modal',
  component: ModalPage,
  meta: { viewTransition: false },
}
```

The `::view-transition-old(root)` and `::view-transition-new(root)` CSS pseudo-elements can be styled for custom transition effects:

```css
::view-transition-old(root) {
  animation: fade-out 200ms ease-in;
}
::view-transition-new(root) {
  animation: fade-in 300ms ease-out;
}
```

## Hash Scrolling

When navigating to a URL with a hash fragment (e.g., `/docs#installation`), the router automatically scrolls to the element with the matching `id`. This works for both initial page load and client-side navigation.

## Route Error Boundaries

The `errorComponent` on a route record catches render errors (not just loader errors). When a route component throws during rendering, the error component is shown instead:

```tsx
{
  path: '/dashboard',
  component: Dashboard,
  errorComponent: (props) => (
    <div>
      <h2>Dashboard Error</h2>
      <p>{props.error.message}</p>
      <button onClick={props.reset}>Retry</button>
    </div>
  ),
}
```

## Middleware Chain

Routes can define middleware that runs before guards and loaders. Middleware receives a context object with a `data` property for passing data downstream:

```ts
import type { RouteMiddleware } from '@pyreon/router'

const authMiddleware: RouteMiddleware = async (ctx) => {
  const user = await getUser(ctx.request)
  ctx.data.user = user
  if (!user) return '/login' // redirect
}

const routes = [
  {
    path: '/admin',
    component: AdminLayout,
    middleware: [authMiddleware],
    children: [
      { path: 'dashboard', component: AdminDashboard },
    ],
  },
]
```

Inside components, read middleware data with `useMiddlewareData()`:

```tsx
import { useMiddlewareData } from '@pyreon/router'

function AdminDashboard() {
  const data = useMiddlewareData<{ user: User }>()
  return <h1>Welcome, {data.user.name}</h1>
}
```

## Typed Route Names

`Router<TNames>` accepts a generic for typed named navigation:

```ts
type RouteNames = 'home' | 'user' | 'settings'

const router = createRouter<RouteNames>({
  routes: [
    { path: '/', component: Home, name: 'home' },
    { path: '/user/:id', component: User, name: 'user' },
    { path: '/settings', component: Settings, name: 'settings' },
  ],
})

// Typed — only 'home' | 'user' | 'settings' allowed:
router.push({ name: 'user', params: { id: '42' } })
// router.push({ name: 'invalid' })  // TypeScript error
```

## Exports Summary

### Functions

<APICard name="createRouter" type="function" signature="createRouter(options: RouterOptions | RouteRecord[]): Router" description="Create a router instance with the given options or shorthand route array." />

<APICard name="lazy" type="function" signature="lazy(loader: () => Promise<ComponentFn | { default: ComponentFn }>, options?: { loading?: ComponentFn; error?: ComponentFn }): LazyComponent" description="Lazy-load a route component with automatic retries and stale chunk detection." />

<APICard name="resolveRoute" type="function" signature="resolveRoute(path: string, routes: RouteRecord[]): ResolvedRoute" description="Resolve a raw path (including query string and hash) against the route tree." />

<APICard name="buildPath" type="function" signature="buildPath(pattern: string, params: Record<string, string>): string" description="Build a path string from a route pattern and params. Handles optional params and splat params." />

<APICard name="buildNameIndex" type="function" signature="buildNameIndex(routes: RouteRecord[]): Map<string, RouteRecord>" description="Pre-build a name→RouteRecord Map for O(1) named navigation lookups." />

<APICard name="findRouteByName" type="function" signature="findRouteByName(name: string, routes: RouteRecord[]): RouteRecord | null" description="Find a route record by name with recursive search." />

<APICard name="parseQuery" type="function" signature="parseQuery(query: string): Record<string, string>" description="Parse a query string into a record of single string values. Duplicate keys are overwritten (last wins)." />

<APICard name="parseQueryMulti" type="function" signature="parseQueryMulti(query: string): Record<string, string | string[]>" description="Parse a query string preserving duplicate keys as arrays." />

<APICard name="stringifyQuery" type="function" signature="stringifyQuery(params: Record<string, string>): string" description="Convert a query object to a query string with a leading '?'. Returns empty string if the object is empty." />

<APICard name="prefetchLoaderData" type="function" signature="prefetchLoaderData(router: Router, url: string): Promise<void>" description="SSR: prefetch all loader data for the matched route at the given URL." />

<APICard name="serializeLoaderData" type="function" signature="serializeLoaderData(router: Router): Record<string, unknown>" description="SSR: serialize the router's loader data for embedding in HTML." />

<APICard name="hydrateLoaderData" type="function" signature="hydrateLoaderData(router: Router, data: Record<string, unknown>): void" description="Client: hydrate serialized loader data into the router so the initial render uses server-fetched data." />

### Components

<APICard name="RouterProvider" type="component" signature="<RouterProvider :router='router'>...</RouterProvider>" description="Provide the router instance to the component tree via context." />

<APICard name="RouterView" type="component" signature="<RouterView />" description="Render the matched route component for the current route. Nest inside layouts for nested routing." />

<APICard name="RouterLink" type="component" signature='<RouterLink to="/path" activeClass="active" exactActiveClass="exact-active">...</RouterLink>' description="Navigation link that applies active classes and supports prefetching on hover/focus." />

### Hooks

<APICard name="useRouter" type="hook" signature="useRouter(): Router" description="Access the router instance from within the component tree." />

<APICard name="useRoute" type="hook" signature="useRoute(): () => ResolvedRoute" description="Access the current resolved route as a reactive signal." />

<APICard name="useLoaderData" type="hook" signature="useLoaderData<T>(): T" description="Read data returned by the current route's loader function." />

<APICard name="useSearchParams" type="hook" signature="useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<void>]" description="Reactive read/write access to URL query parameters with optional defaults." />

<APICard name="useTypedSearchParams" type="hook" signature="useTypedSearchParams<T>(schema: T): TypedSearchParams<T>" description="Type-safe search params with automatic coercion from URL strings." />

<APICard name="useTransition" type="hook" signature="useTransition(): { isTransitioning: () => boolean }" description="Reactive signal indicating whether a route transition is in progress." />

<APICard name="useMiddlewareData" type="hook" signature="useMiddlewareData<T>(): T" description="Read data set by route middleware in the current route's middleware chain." />

<APICard name="useBlocker" type="hook" signature="useBlocker(fn: BlockerFn): { remove(): void }" description="Register a navigation blocker. Returns true to block, false to allow. Also handles beforeunload." />

<APICard name="onBeforeRouteLeave" type="hook" signature="onBeforeRouteLeave(guard: NavigationGuard): () => void" description="In-component guard called before navigating away from the current route." />

<APICard name="onBeforeRouteUpdate" type="hook" signature="onBeforeRouteUpdate(guard: NavigationGuard): () => void" description="In-component guard called when the route changes but the component is reused." />

### Context

<APICard name="RouterContext" type="constant" signature="RouterContext: Context<Router>" description="The router context object for advanced use cases." />

### Types

<APICard name="Router" type="type" signature="interface Router" description="The router instance interface with push, replace, back, guards, and signals." />

<APICard name="RouterOptions" type="type" signature="interface RouterOptions" description="Options for createRouter: routes, mode, scrollBehavior, and url (SSR)." />

<APICard name="RouteRecord" type="type" signature="interface RouteRecord" description="Route record with path, component, name, meta, guards, loader, children, and redirect." />

<APICard name="RouteComponent" type="type" signature="type RouteComponent = ComponentFn | LazyComponent" description="A route component: either a regular component function or a lazy-loaded component." />

<APICard name="LazyComponent" type="type" signature="type LazyComponent" description="Lazy component wrapper returned by the lazy() helper." />

<APICard name="ResolvedRoute" type="type" signature="interface ResolvedRoute" description="A resolved route with path, params, query, hash, matched records, and merged meta." />

<APICard name="RouteMeta" type="type" signature="interface RouteMeta" description="Route metadata interface. Extendable via TypeScript module augmentation." />

<APICard name="NavigationGuard" type="type" signature="type NavigationGuard = (to: ResolvedRoute, from: ResolvedRoute) => NavigationGuardResult | Promise<NavigationGuardResult>" description="Guard function called before navigation commits." />

<APICard name="NavigationGuardResult" type="type" signature="type NavigationGuardResult = boolean | string | undefined" description="Guard return type: true/undefined to allow, false to cancel, string to redirect." />

<APICard name="AfterEachHook" type="type" signature="type AfterEachHook = (to: ResolvedRoute, from: ResolvedRoute) => void" description="Hook function called after navigation commits. Cannot affect navigation." />

<APICard name="LoaderContext" type="type" signature="interface LoaderContext { params: Record<string, string>; query: Record<string, string>; signal: AbortSignal }" description="Context passed to route loader functions." />

<APICard name="RouteLoaderFn" type="type" signature="type RouteLoaderFn = (ctx: LoaderContext) => Promise<unknown>" description="Async loader function for fetching route data before navigation commits." />

<APICard name="ScrollBehaviorFn" type="type" signature='type ScrollBehaviorFn = (to: ResolvedRoute, from: ResolvedRoute, savedPosition: number | null) => "top" | "restore" | "none" | number' description="Custom scroll behavior function for advanced scroll control." />

<APICard name="BlockerFn" type="type" signature="type BlockerFn = (to: ResolvedRoute, from: ResolvedRoute) => boolean | Promise<boolean>" description="Blocker function for useBlocker. Return true to block navigation." />

<APICard name="ExtractParams" type="type" signature="type ExtractParams<T extends string>" description="Utility type that extracts typed param keys from a path pattern string." />

<APICard name="RouterProviderProps" type="type" signature="interface RouterProviderProps" description="Props for the RouterProvider component." />

<APICard name="RouterViewProps" type="type" signature="interface RouterViewProps" description="Props for the RouterView component." />

<APICard name="RouterLinkProps" type="type" signature="interface RouterLinkProps" description="Props for the RouterLink component." />
