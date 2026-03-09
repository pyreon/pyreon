# Router

`@pyreon/router` is a client-side router with hash and history mode support, navigation guards, lazy routes, and typed param/query access.

## Installation

```bash
bun add @pyreon/router
```

## Quick Start

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink } from "@pyreon/router"
import { lazy, Suspense } from "@pyreon/core"

const router = createRouter({
  mode: "history",
  routes: [
    { path: "/",        component: Home },
    { path: "/about",   component: About },
    { path: "/user/:id", component: UserPage },
    { path: "/settings", component: lazy(() => import("./Settings")) },
  ],
})

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
      <Suspense fallback={<p>Loading…</p>}>
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
|---|---|---|---|
| `mode` | `"hash" \| "history"` | `"hash"` | URL strategy |
| `routes` | `Route[]` | required | Route definitions |
| `base` | `string` | `""` | Base path prefix for history mode |

### Route Definition

```ts
interface Route {
  path: string               // e.g. "/user/:id", "/files/*"
  component: ComponentFn | LazyComponent
  meta?: Record<string, unknown>
}
```

**Path patterns:**

| Pattern | Matches |
|---|---|
| `/about` | Exact match |
| `/user/:id` | `/user/42`, `/user/alice` |
| `/files/*` | `/files/a/b/c` |
| `*` | Catch-all / 404 |

## RouterProvider

Wraps the application and makes the router available to all descendants via context.

```tsx
<RouterProvider router={router}>
  {/* App content */}
</RouterProvider>
```

There must be exactly one `RouterProvider` in the application.

## RouterView

Renders the component matched by the current URL. Place it wherever the page content should appear.

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

`RouterView` is reactive — when the URL changes, it unmounts the current component and mounts the matched one.

## RouterLink

Renders an `<a>` tag that navigates without a full page reload. Automatically adds an `active` class when the link's `to` matches the current path.

```tsx
<RouterLink to="/about">About</RouterLink>
<RouterLink to="/user/42" class="nav-item">User 42</RouterLink>
```

### Props

| Prop | Type | Description |
|---|---|---|
| `to` | `string` | Target path |
| `replace` | `boolean` | Use `history.replaceState` instead of `pushState` |
| `class` | `string` | Extra CSS classes |
| `activeClass` | `string` | Class applied when active (default: `"active"`) |

## useRouter

Returns the router instance. Use it for programmatic navigation.

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
|---|---|---|
| `push` | `push(path: string): void` | Navigate to path, add history entry |
| `replace` | `replace(path: string): void` | Navigate to path, replace history entry |
| `back` | `back(): void` | Go back in history |
| `forward` | `forward(): void` | Go forward in history |
| `beforeEach` | `beforeEach(guard): RemoveFn` | Register a navigation guard |

## useRoute

Returns a reactive object representing the current route match.

```tsx
import { useRoute } from "@pyreon/router"

function UserPage() {
  const route = useRoute()

  return (
    <div>
      <h1>User {() => route.params.id}</h1>
      <p>Query: {() => route.query.tab ?? "overview"}</p>
    </div>
  )
}
```

### Route Object

| Property | Type | Description |
|---|---|---|
| `path` | `() => string` | Current path (reactive getter) |
| `params` | `Proxy<Record<string, string>>` | URL params (reactive) |
| `query` | `Proxy<Record<string, string>>` | Query string params (reactive) |
| `meta` | `() => Record<string, unknown>` | Route meta from definition |
| `matched` | `() => Route` | The matched route definition |

`params` and `query` are reactive proxies — reading any property inside an effect or computed registers a dependency.

## Navigation Guards

Guards run before each navigation and can redirect, cancel, or allow it.

```ts
router.beforeEach((to, from) => {
  // Allow: return nothing or true
  // Redirect: return a path string
  // Cancel: return false
  if (to.path.startsWith("/admin") && !isAdmin()) {
    return "/login"
  }
})
```

### Guard Signature

```ts
type NavigationGuard = (
  to: NavigationTarget,
  from: NavigationTarget
) => string | false | void | Promise<string | false | void>
```

Guards can be async. Navigation is deferred until the promise resolves.

```ts
router.beforeEach(async (to, from) => {
  if (to.meta.requiresAuth) {
    const user = await checkAuth()
    if (!user) return "/login"
  }
})
```

### Removing a Guard

`beforeEach` returns a function that removes the guard:

```ts
const removeGuard = router.beforeEach(guard)
// Later:
removeGuard()
```

## Lazy Routes

```ts
import { lazy } from "@pyreon/core"

const router = createRouter({
  routes: [
    { path: "/dashboard", component: lazy(() => import("./Dashboard")) },
    { path: "/reports",   component: lazy(() => import("./Reports")) },
  ],
})
```

Pair with `Suspense` at the `RouterView` level to show a loading state during navigation.

## Hash vs History Mode

**Hash mode** (default): URLs look like `/#/about`. No server configuration needed.

**History mode**: URLs look like `/about`. Requires the server to serve `index.html` for all paths. In Vite dev, this works automatically.

```ts
// Vite — history mode fallback
// vite.config.ts
export default defineConfig({
  plugins: [novaPlugin()],
  server: {
    historyApiFallback: true,
  },
})
```

## Programmatic Navigation

```ts
const router = useRouter()

// Push a new entry
router.push("/about")
router.push(`/user/${userId}`)

// Replace current entry
router.replace("/login")

// With query string
router.push("/search?q=nova+framework")

// Go back/forward
router.back()
router.forward()
```

## Nested Routes (Manual)

Nova's router does not have built-in nested route configuration. For nested layouts, nest `RouterView` components and manage path matching manually:

```tsx
function AdminLayout() {
  const route = useRoute()
  const isUsers = computed(() => route.path().startsWith("/admin/users"))
  const isReports = computed(() => route.path().startsWith("/admin/reports"))

  return (
    <div class="admin">
      <AdminSidebar />
      <main>
        {() => isUsers()   && <AdminUsers />}
        {() => isReports() && <AdminReports />}
      </main>
    </div>
  )
}
```

## Gotchas

**`useRouter()` and `useRoute()` must be called inside a `RouterProvider`.** Calling them outside throws.

**Hash mode and `<base>` tags conflict.** Do not use both.

**Guards that redirect can loop.** Ensure redirect conditions are not true for the redirect target itself.

```ts
// Infinite loop if /login also requiresAuth:
router.beforeEach(to => {
  if (!isAuthed() && to.path !== "/login") return "/login"
})
```

**Params are strings.** URL params are always strings. Parse numbers explicitly.

```ts
const id = Number(route.params.id)  // not route.params.id directly
```
