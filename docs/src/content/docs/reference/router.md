---
title: "Router — API Reference"
description: "hash+history+SSR, context-based, prefetching, guards, loaders, useIsActive, View Transitions, middleware, typed search params"
---

# @pyreon/router — API Reference

> **Generated** from `router`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [router](/docs/router).

Type-safe client-side router for Pyreon with nested routes, per-route and global navigation guards, data loaders, middleware chain, View Transitions API integration, and typed search params. Context-based (`RouterContext`) with hash and history mode support. Route params are inferred from path strings (`"/user/:id"` yields `{ id: string }`). Named routes enable typed programmatic navigation. SSR-compatible with server-side route resolution. Hash mode uses `history.pushState` (not `window.location.hash`) to avoid double-update. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit), not after animation completion.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`runServerLoaders`](#runserverloaders) | function | The single-fetch data endpoint's worker (server-only — `serverLoader` functions exist only in the SSR module graph). |
| [`createRouter`](#createrouter) | function | Create a router instance with route records, guards, middleware, and mode configuration. |
| [`RouterProvider`](#routerprovider) | component | Provide the router instance to the component tree via `RouterContext`. |
| [`RouterView`](#routerview) | component | Render the matched route's component. |
| [`RouterLink`](#routerlink) | component | Declarative navigation link that renders an `<a>` element. |
| [`useRouter`](#userouter) | hook | Access the router instance for programmatic navigation. |
| [`useRoute`](#useroute) | hook | Access the current resolved route as a reactive accessor. |
| [`useIsActive`](#useisactive) | hook | Returns a reactive boolean for whether a path matches the current route. |
| [`useTypedSearchParams`](#usetypedsearchparams) | hook | Type-safe search params with auto-coercion from URL strings. |
| [`useTransition`](#usetransition) | hook | Returns a reactive accessor for route transition state. |
| [`useMiddlewareData`](#usemiddlewaredata) | hook | Returns a reactive accessor for data set by `RouteMiddleware` in the middleware chain. |
| [`useLoaderData`](#useloaderdata) | hook | Access the data returned by the current route's `loader` function. |
| [`redirect`](#redirect) | function | Throw inside a route loader to redirect the navigation BEFORE the layout renders. |
| [`isRedirectError`](#isredirecterror) | function | Type guard for errors thrown by `redirect()`. |
| [`getRedirectInfo`](#getredirectinfo) | function | Extract the redirect URL and status from a thrown RedirectError. |
| [`useSearchParams`](#usesearchparams) | hook | Access and update URL search params as a reactive tuple. |
| [`useBlocker`](#useblocker) | hook | Block navigation when a condition is true (e.g., unsaved form changes). |
| [`onBeforeRouteLeave`](#onbeforerouteleave) | function | Register a per-component navigation guard that fires when leaving the current route. |
| [`onBeforeRouteUpdate`](#onbeforerouteupdate) | function | Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g.,  |

## API

### runServerLoaders `function`

```ts
router.runServerLoaders(path: string, request?: Request): Promise<{ kind: 'data'; data: Record<number, unknown> } | { kind: 'redirect'; to: string; status: number }>
```

The single-fetch data endpoint's worker (server-only — `serverLoader` functions exist only in the SSR module graph). Runs ONLY the matched chain's `serverLoader` records (NOT isomorphic `loader`s — those run client-side; running them here would double-fire side effects) and keys results by MATCHED-CHAIN INDEX (a layout and its index page share a `path`, so path-keying collided). A `redirect()` thrown by any server loader returns the redirect descriptor instead of data.

**Example**

```tsx
// zero's /_pyreon/data endpoint does exactly this:
const result = await router.runServerLoaders('/dash', ctx.req)
if (result.kind === 'redirect') return jsonRedirect(result)
return json({ data: result.data }) // keyed by matched-chain index
```

**Common mistakes**

- Calling it client-side — `serverLoader` is undefined in the client graph; the client router does the single FETCH instead
- Expecting isomorphic `loader`s to run here — deliberately excluded (double-fire prevention); they run on the client during navigation

---

### createRouter `function`

```ts
createRouter(options: RouterOptions | RouteRecord[]): Router
```

Create a router instance with route records, guards, middleware, and mode configuration. Accepts either an array of route records (shorthand) or a full `RouterOptions` object with `routes`, `mode` (`"history"` | `"hash"`), `scrollBehavior`, `beforeEach`, `afterEach`, and `middleware`. The returned `Router` is generic over route names for typed programmatic navigation.

**Example**

```tsx
const router = createRouter([
  { path: "/", component: Home },
  { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) },
  { path: "/admin", component: Admin, beforeEnter: requireAuth, children: [
    { path: "settings", component: Settings },
  ]},
])
```

**Common mistakes**

- `createRouter({ routes: [...], mode: "hash" })` and using `window.location.hash` elsewhere — hash mode uses `history.pushState`, not `location.hash`. Reading `location.hash` directly will not reflect router state
- Defining route paths without leading `/` in root routes — all root-level paths must start with `/`
- Using `redirect: "/target"` with a guard on the same route — redirects bypass guards. Use `beforeEnter` to conditionally redirect instead
- Forgetting the catch-all route — `{ path: "(.*)", component: NotFound }` should be the last route to handle 404s

**See also:** `RouterProvider` · `useRouter` · `useRoute`

---

### RouterProvider `component`

```ts
<RouterProvider router={router}>{children}</RouterProvider>
```

Provide the router instance to the component tree via `RouterContext`. Must wrap the entire app (or the routed section). Sets up the context stack so `useRouter()`, `useRoute()`, and other hooks can access the router.

**Example**

```tsx
const App = () => (
  <RouterProvider router={router}>
    <nav><RouterLink to="/">Home</RouterLink></nav>
    <RouterView />
  </RouterProvider>
)
```

**See also:** `createRouter` · `RouterView` · `RouterLink`

---

### RouterView `component`

```ts
<RouterView />
```

Render the matched route's component. For nested routes, the parent route component includes a `<RouterView />` that renders the matched child. Each `<RouterView>` renders one level of the route tree.

**Example**

```tsx
// Renders the matched route's component
<RouterView />

// Nested routes: parent component includes <RouterView /> for children
const Admin = () => (
  <div>
    <h1>Admin</h1>
    <RouterView />  {/* renders Settings, Users, etc. */}
  </div>
)
```

**See also:** `RouterProvider` · `createRouter`

---

### RouterLink `component`

```ts
<RouterLink to={path} activeClass={cls} exactActiveClass={cls}>{children}</RouterLink>
```

Declarative navigation link that renders an `<a>` element. Supports string paths or named route objects (`{ name, params }`). Applies `activeClass` when the current route matches the link path (prefix), and `exactActiveClass` for exact matches. Click handler calls `router.push()` and prevents default.

**Example**

```tsx
<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>
```

**Common mistakes**

- `<a href="/about" onClick={() => router.push("/about")}>` — use `<RouterLink to="/about">` instead; it handles the anchor element, active class, and click interception
- `<RouterLink to="/about" target="_blank">` — external navigation bypasses the router; use a plain `<a>` for external links
- `<RouterLink to={dynamicPath}>` without calling the signal — must call: `<RouterLink to={dynamicPath()}>` (or let the compiler handle it via `_rp()`)

**See also:** `useRouter` · `useIsActive`

---

### useRouter `hook`

```ts
useRouter(): Router
```

Access the router instance for programmatic navigation. Returns the `Router` object with `push()`, `replace()`, `back()`, `forward()`, `go()`. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit is complete, new route state is live), NOT after the animation finishes.

**Example**

```tsx
const router = useRouter()

router.push("/settings")
router.push({ name: "user", params: { id: "42" } })
router.replace("/login")
router.back()
router.forward()
router.go(-2)
```

**Common mistakes**

- `router.push("/path")` at the top level of a component body — this is synchronous imperative navigation during render, causing an infinite loop. Wrap in `onMount`, event handler, or `effect`
- `await router.push("/path")` expecting animation completion — `push` resolves after DOM commit (`updateCallbackDone`), not after View Transition animation finishes. Use the returned transition object's `.finished` if you need to wait for animation
- Calling `useRouter()` outside a `<RouterProvider>` — throws because no router context exists

**See also:** `useRoute` · `RouterLink` · `createRouter`

---

### useRoute `hook`

```ts
useRoute<TPath extends string>(): () => ResolvedRoute<ExtractParams<TPath>>
```

Access the current resolved route as a reactive accessor. Generic over the path string for typed params — `useRoute<"/user/:id">()` yields `route().params.id: string`. Returns a function (accessor) that must be called to read the current route — reads inside reactive scopes track route changes.

**Example**

```tsx
// Type-safe params:
const route = useRoute<"/user/:id">()
const userId = route().params.id  // string

// Access query, meta, etc:
route().query
route().meta
```

**See also:** `useRouter` · `useSearchParams` · `useLoaderData`

---

### useIsActive `hook`

```ts
useIsActive(path: string, exact?: boolean): () => boolean
```

Returns a reactive boolean for whether a path matches the current route. Segment-aware prefix matching: `/admin` matches `/admin/users` but NOT `/admin-panel`. Pass `exact=true` for exact-only matching. Updates reactively when the route changes.

**Example**

```tsx
const isHome = useIsActive("/")
const isAdmin = useIsActive("/admin")          // prefix match
const isExactAdmin = useIsActive("/admin", true)  // exact only

// Reactive — updates when route changes:
<a class={{ active: isAdmin() }} href="/admin">Admin</a>
```

**Common mistakes**

- `useIsActive("/admin")` matching `/admin-panel` — this does NOT happen. Matching is segment-aware: `/admin` only matches paths starting with `/admin/` or exactly `/admin`
- `if (useIsActive("/settings")())` at component top level — the outer call returns an accessor; make sure to read it inside a reactive scope for updates
- Using `useIsActive` for complex route matching — it only does path prefix/exact matching. For query-param-aware or meta-aware checks, use `useRoute()` directly

**See also:** `useRoute` · `RouterLink`

---

### useTypedSearchParams `hook`

```ts
useTypedSearchParams<T>(schema: T): TypedSearchParams<T>
```

Type-safe search params with auto-coercion from URL strings. Schema keys define parameter names, values define types (`"string"`, `"number"`, `"boolean"`). Returns an object where each key is a reactive accessor and `.set()` updates the URL.

**Example**

```tsx
const params = useTypedSearchParams({ page: "number", q: "string", active: "boolean" })
params.page()    // number (auto-coerced)
params.q()       // string
params.set({ page: 2 })  // updates URL
```

**See also:** `useSearchParams` · `useRoute`

---

### useTransition `hook`

```ts
useTransition(): () => boolean
```

Returns a reactive accessor for route transition state. The accessor is true during navigation (while guards run + loaders resolve), false when the new route is mounted. Call it inside a reactive scope. Useful for progress bars and global loading indicators.

**Example**

```tsx
const isTransitioning = useTransition()

<Show when={isTransitioning()}>
  <ProgressBar />
</Show>
```

**See also:** `useRouter` · `useRoute`

---

### useMiddlewareData `hook`

```ts
useMiddlewareData(): () => Record<string, unknown>
```

Returns a reactive accessor for data set by `RouteMiddleware` in the middleware chain. Middleware functions receive `ctx` with a mutable `ctx.data` object — properties set there are read by calling the returned accessor inside a reactive scope.

**Example**

```tsx
// Middleware:
const authMiddleware: RouteMiddleware = async (ctx) => {
  ctx.data.user = await getUser(ctx.to)
}

// Component:
const data = useMiddlewareData()
// data().user is available
```

**See also:** `createRouter` · `useLoaderData`

---

### useLoaderData `hook`

```ts
useLoaderData<T>(): T
```

Access the data returned by the current route's `loader` function. The loader runs before the route component mounts; its return value is cached and available synchronously via this hook. Generic over the loader return type.

**Example**

```tsx
// Route: { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) }

const User = () => {
  const data = useLoaderData<UserData>()
  return <div>{data.name}</div>
}
```

**See also:** `useMiddlewareData` · `useRoute`

---

### redirect `function`

```ts
redirect(url: string, status?: 301 | 302 | 303 | 307 | 308): never
```

Throw inside a route loader to redirect the navigation BEFORE the layout renders. On SSR (initial nav), the thrown error is converted by `@pyreon/server`'s handler into a real HTTP `302`/`307` `Location:` response — no layout HTML leaves the server. On CSR (subsequent nav), the redirect propagates through the navigate flow and triggers `router.replace()` before any matched route's component mounts. Replaces the fragile `onMount + router.push()` workaround for auth-gates under nested-layout dev SSR + hydration. Default status is `307` (Temporary Redirect, method-preserving).

**Example**

```tsx
// src/routes/app/_layout.tsx
import { redirect, type LoaderContext } from "@pyreon/router"

export async function loader(ctx: LoaderContext) {
  // SSR: read from request headers; CSR: read from document.cookie
  const cookie = ctx.request?.headers.get("cookie")
    ?? (typeof document !== "undefined" ? document.cookie : "")
  const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookie)?.[1]
  if (!sid) redirect("/login")
  const session = await getSession(sid)
  if (!session) redirect("/login")
  return { session }
}
```

**Common mistakes**

- Calling `redirect()` outside a loader (in a component body, an event handler, etc.) — the helper expects to be caught by the loader-runner. For imperative redirects from event handlers, use `router.replace(target)` instead.
- Forgetting to make `LoaderContext.request` access optional. It's populated only on SSR; CSR loaders see `request: undefined`. Read both: `ctx.request?.headers.get('cookie') ?? document.cookie`.
- Using `redirect()` for control-flow that should be a `<Match>` / `<Show>` conditional — the helper is for redirecting the URL, not for branching the rendered output.
- Returning `redirect()` instead of throwing it. The helper has return type `never` and throws — `return redirect(...)` is misleading and may suppress the throw under TS strict-null checks.
- Picking the wrong status. Default `307` preserves the request method (POST stays POST after redirect). Use `302`/`303` to force GET on the target. Use `301`/`308` for PERMANENT moves (browsers cache them aggressively).
- Assuming `redirect()` cancels every loader in a sibling chain. The first loader to throw wins; later loaders in the same `Promise.allSettled` batch may have already started executing before the redirect short-circuits. Treat them as best-effort.

**See also:** `notFound` · `useLoaderData` · `isRedirectError`

---

### isRedirectError `function`

```ts
isRedirectError(err: unknown): boolean
```

Type guard for errors thrown by `redirect()`. Used internally by the router (CSR) and `@pyreon/server` (SSR) to distinguish redirect-control-flow errors from real failures. Useful in custom error boundaries that should let redirects pass through to the framework instead of catching them.

**Example**

```tsx
import { ErrorBoundary } from "@pyreon/core"
import { isRedirectError } from "@pyreon/router"

<ErrorBoundary fallback={(err, reset) => {
  if (isRedirectError(err)) throw err  // let the framework handle it
  return <ErrorPage error={err} onReset={reset} />
}}>
  <App />
</ErrorBoundary>
```

**See also:** `redirect` · `isNotFoundError` · `getRedirectInfo`

---

### getRedirectInfo `function`

```ts
getRedirectInfo(err: unknown): { url: string; status: 301 | 302 | 303 | 307 | 308 } | null
```

Extract the redirect URL and status from a thrown RedirectError. Returns `null` for non-redirect errors. Used by `@pyreon/server`'s SSR handler to convert the thrown error into a 302/307 `Response`.

**Example**

```tsx
import { getRedirectInfo } from "@pyreon/router"

try {
  await prefetchLoaderData(router, path, request)
} catch (err) {
  const info = getRedirectInfo(err)
  if (info) return new Response(null, { status: info.status, headers: { Location: info.url } })
  throw err
}
```

**See also:** `redirect` · `isRedirectError`

---

### useSearchParams `hook`

```ts
useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<void>]
```

Access and update URL search params as a reactive tuple. Returns `[get, set]` where `get()` reads the current params and `set()` updates them via `replaceState`. For typed params with auto-coercion, prefer `useTypedSearchParams`.

**Example**

```tsx
const [search, setSearch] = useSearchParams({ page: "1", sort: "name" })

// Read:
search().page  // "1"

// Write:
setSearch({ page: "2" })
```

**See also:** `useTypedSearchParams` · `useRoute`

---

### useBlocker `hook`

```ts
useBlocker(shouldBlock: () => boolean): Blocker
```

Block navigation when a condition is true (e.g., unsaved form changes). Returns a `Blocker` object with `proceed()` and `reset()` methods. Also hooks into the browser's `beforeunload` event to warn on tab close. Uses a shared ref-counted listener for `beforeunload` — N blockers share one event handler.

**Example**

```tsx
const blocker = useBlocker(() => form.isDirty())

<Show when={blocker.isBlocked()}>
  <Dialog>
    <p>Unsaved changes. Leave anyway?</p>
    <button onClick={blocker.proceed}>Leave</button>
    <button onClick={blocker.reset}>Stay</button>
  </Dialog>
</Show>
```

**See also:** `useRouter`

---

### onBeforeRouteLeave `function`

```ts
onBeforeRouteLeave(guard: NavigationGuard): void
```

Register a per-component navigation guard that fires when leaving the current route. Return `false` to cancel, a string path to redirect, or `undefined` to allow. Must be called during component setup.

**Example**

```tsx
onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges()) return false  // cancel navigation
})
```

**See also:** `onBeforeRouteUpdate` · `useBlocker`

---

### onBeforeRouteUpdate `function`

```ts
onBeforeRouteUpdate(guard: NavigationGuard): void
```

Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g., param change `/user/1` to `/user/2`). Same return semantics as `onBeforeRouteLeave`.

**Example**

```tsx
onBeforeRouteUpdate((to, from) => {
  if (to.params.id === from.params.id) return  // no change
  // reload data for new ID...
})
```

**See also:** `onBeforeRouteLeave` · `useRoute`

---

## Package-level notes

> **View Transitions — what push() awaits:** `await router.push()` resolves after `updateCallbackDone` (DOM commit), NOT after animation finishes. It does NOT wait for `.finished` (~200-300ms). `.ready` and `.finished` get empty `.catch()` handlers so `AbortError: Transition was skipped` rejections (from interrupted transitions) do not leak as unhandled promise rejections.

> **Hash mode uses pushState:** Hash mode uses `history.pushState` — NOT `window.location.hash` assignment — to avoid double-update from the hashchange event. Reading `location.hash` directly will not reflect router state; use `useRoute()` instead.

> **Imperative navigation in render body:** `router.push()` or `navigate()` called synchronously in the component function body causes an infinite render loop. Wrap in `onMount`, event handlers, `effect`, or any deferred execution context. The `pyreon/no-imperative-navigate-in-render` lint rule catches this.

> **Hook ordering with View Transitions:** `afterEach` hooks and scroll restoration fire AFTER the View Transition callback completes — not before. This means hooks see the NEW route state, which is the correct per-spec behavior but a subtle change from pre-VT versions.

> **For uses by, not key:** `<For>` in route lists uses `by` not `key`. `<For each={routes()} key={r => r.path}>` silently passes the key to VNode reconciliation instead of the list reconciler. Use `by={r => r.path}`.
