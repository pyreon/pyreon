---
title: "Router — API Reference"
description: "hash+history+SSR, context-based, prefetching, guards, loaders, useIsActive, View Transitions, middleware, typed search params"
---

# @pyreon/router — API Reference

> **Generated** from `router`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [router](/docs/router).

Type-safe client-side router for Pyreon with nested routes, per-route and global navigation guards, data loaders, middleware chain, View Transitions API integration, and typed search params. Context-based (`RouterContext`) with hash and history mode support. Route params are inferred from path strings (`"/user/:id"` yields `{ id: string }`). Named routes enable typed programmatic navigation. SSR-compatible with server-side route resolution. Hash mode uses `history.pushState` (not `window.location.hash`) to avoid double-update. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit), not after animation completion.

## Features

- Server loaders (zero integration): records carry `serverLoader` (SSR module graph only) / `hasServerLoader` (client marker) — client navigations fetch the whole chain via ONE request to the `dataEndpoint` (default `<base>/_pyreon/data`); redirect() from a server loader arrives as a JSON envelope the client turns into a navigation
- createRouter() — factory with routes, guards, middleware, loaders, hash/history mode
- RouterProvider / RouterView / RouterLink — context-based rendering components
- useRouter / useRoute — programmatic navigation and typed route access
- useIsActive — reactive boolean for path matching (segment-aware prefix)
- useTypedSearchParams — typed search params with auto-coercion
- useTransition — reactive signal for route transition state
- useMiddlewareData — read data set by route middleware chain
- useLoaderData — access route loader results
- View Transitions API — auto-enabled, awaits updateCallbackDone
- Named routes — typed navigation via &#123; name, params &#125;
- Nested routes — recursive matching with child RouterView
- Navigation guards — per-route and global beforeEnter/afterEach hooks

## Complete example

A full, end-to-end usage of the package:

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink, useRouter, useRoute, useIsActive, useTypedSearchParams, useTransition, useLoaderData, useMiddlewareData } from "@pyreon/router"
import { mount } from "@pyreon/runtime-dom"

// Define routes with typed params, guards, loaders, and middleware
const router = createRouter({
  routes: [
    { path: "/", component: Home, name: "home" },
    { path: "/user/:id", component: User, name: "user",
      loader: ({ params }) => fetchUser(params.id),
      meta: { title: "User Profile" } },
    { path: "/admin", component: AdminLayout,
      beforeEnter: (to, from) => isAdmin() || "/login",
      middleware: [authMiddleware, loggerMiddleware], // per-route middleware — runs before guards
      children: [
        { path: "users", component: AdminUsers },
        { path: "settings", component: AdminSettings },
      ] },
    { path: "/settings", redirect: "/admin/settings", component: AdminSettings },
    { path: "(.*)", component: NotFound },
  ],
})

// Mount with RouterProvider
mount(
  <RouterProvider router={router}>
    <nav>
      <RouterLink to="/" activeClass="nav-active">Home</RouterLink>
      <RouterLink to="/user/42">Profile</RouterLink>
    </nav>
    <RouterView />
  </RouterProvider>,
  document.getElementById("app")!
)

// Inside a component — hooks
const User = () => {
  const route = useRoute<"/user/:id">()
  const data = useLoaderData<UserData>()
  const router = useRouter()
  const isAdmin = useIsActive("/admin")
  const isTransitioning = useTransition()
  const [search, setSearch] = useTypedSearchParams({ tab: "string", page: "number" })

  return (
    <div>
      <h1>{data.name} (ID: {route().params.id})</h1>
      <Show when={isTransitioning()}>
        <ProgressBar />
      </Show>
      <button onClick={() => router.push("/")}>Go Home</button>
    </div>
  )
}
```

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
| [`useBlocker`](#useblocker) | hook | Block navigations while a condition holds. |
| [`onBeforeRouteLeave`](#onbeforerouteleave) | function | Register a per-component navigation guard that fires when leaving the current route. |
| [`onBeforeRouteUpdate`](#onbeforerouteupdate) | function | Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g.,  |
| [`useNavigate`](#usenavigate) | function | Returns an imperative navigate function. |
| [`useParams`](#useparams) | function | Returns a SNAPSHOT map of the current route's path params (`{ id: '42' }` for `/user/:id`). |
| [`useValidatedSearch`](#usevalidatedsearch) | function | Returns a REACTIVE ACCESSOR `() => T` for the current route's VALIDATED search params. |
| [`notFound / NotFoundBoundary`](#notfound-notfoundboundary) | function | The Next.js-style 404 pair. |
| [`lazy`](#lazy) | function | Code-split a route component. |

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

**Common mistakes**

- SSR renders a BLANK page for a lazy route when the handler only ran `prefetchLoaderData` — that runs LOADERS ONLY, it does NOT resolve `lazy()` route components. `renderToString` is synchronous, so an unresolved lazy component falls back to its empty loading state. The SSR handler must ALSO call `router.preload(path, req)` (resolves lazy components into `_componentCache`) before rendering.
- Forgetting the inner `<RouterView />` inside a LAYOUT component — nested child routes render by placing a SECOND `<RouterView />` in the layout body, one per depth level. Without it the layout renders but its children never appear (they have no mount point).
- Expecting a param-only navigation (`/user/1 → /user/2`) to re-run the layout body — it does NOT. Each depth is a single atomic `computed` keyed on (matched record, component, its own loader data, route ref); it re-emits only when the matched RECORD or that depth's own loader data changes. A loader-LESS layout mounts ONCE and persists; only the page leaf re-renders (via reactive props). Do not put per-navigation side effects in a layout body expecting them to re-fire.
- Passing the route component as a prop or child to `<RouterView>` — it takes none except `announceRouteChanges` (a11y live-region opt-out). It reads the matched chain from `RouterContext`; configure routes in `createRouter`, never on RouterView.
- In a `*-compat` app, wrapping `<RouterView>` in your OWN layout helper that uses `provide()`/`onMount()`/`effect()` at body scope without marking it `nativeCompat()` — the compat jsx runtime relocates its setup into a wrapper accessor. RouterView itself ships `nativeCompat`-marked; your helpers around it must be too.
- Passing `layout` to `@pyreon/zero`'s `createApp`/`startClient` when fs-router already emits `_layout.tsx` — the layout is a parent route in the matched chain that RouterView renders, so the explicit `layout` mounts it a SECOND time (two navbars / two providers). Let `_layout.tsx` be the canonical registration; do not also pass `layout`.

**See also:** `RouterProvider` · `createRouter`

---

### RouterLink `component`

```ts
<RouterLink to={path} activeClass={cls} exactActiveClass={cls}>{children}</RouterLink>
```

Declarative navigation link that renders an `<a>` element. Applies `activeClass` when the current route matches the link path (prefix), and `exactActiveClass` for exact matches. Only INTERNAL navigations are intercepted (`router.push()` + `preventDefault`); external URLs, `mailto:`/`tel:`, and `#hash` are detected from `to` at runtime and left to the browser — external links auto-get `target="_blank" rel="noopener noreferrer"`. Resolves its router like every hook does (context ?? active router), so links outside the provider subtree still client-navigate; with NO router resolvable it degrades to a plain anchor (plain-path `href`, no click interception → full-load navigation) and warns once per `to` in dev. `to` is generic (`CheckHref<T>`): with routes registered via the `RegisteredRoutes` augmentation, a mistyped internal path is a compile error, while dynamic `string`s and external URLs are always accepted.

**Example**

```tsx
<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to="https://github.com/pyreon">GitHub</RouterLink>{/* auto target=_blank + secure rel */}
```

**Common mistakes**

- `<a href="/about" onClick={() => router.push("/about")}>` — use `<RouterLink to="/about">` instead; it handles the anchor element, active class, and click interception
- Plain internal `<a href="/about">` in a router app — triggers a FULL page reload (dev warns at the document level with the RouterLink replacement). Deliberate full-load links opt out via `target`, `download`, or `data-allow-reload`.
- Rendering `<RouterLink>` with no `<RouterProvider>` ancestor (and no `setActiveRouter`) — the link degrades to a plain anchor: plain-path `href`, full page load on click (dev warns once per `to`). Wrap the tree in `<RouterProvider router={…}>` for client-side navigation.
- Wrapping an external URL in a plain `<a>` to avoid router interception — unnecessary: `<RouterLink to="https://x.com">` already detects it as external, renders `target="_blank" rel="noopener noreferrer"`, and does NOT client-navigate. Override with `external` / `target` / `rel` props or the `createRouter({ links })` config.
- `<RouterLink to={dynamicPath}>` without calling the signal — must call: `<RouterLink to={dynamicPath()}>` (or let the compiler handle it via `_rp()`)

**See also:** `useRouter` · `useIsActive` · `createRouter`

---

### useRouter `hook`

```ts
useRouter(): Router
```

Access the router instance for programmatic navigation. Returns the `Router` object with `push()`, `replace()`, `back()`, `forward()`, `go()`. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit is complete, new route state is live), NOT after the animation finishes — and resolves WITH a `NavigationResult`: `'committed'` (route changed), `'cancelled'` (a blocker/guard/middleware refused), or `'superseded'` (a newer navigation won). Browser Back/Forward routes through the same pipeline (guards, blockers, loaders, afterEach, scroll, `meta.title`).

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

**Common mistakes**

- `const { params } = useRoute()` — `useRoute()` returns an ACCESSOR (it IS `router.currentRoute`), so this destructures the FUNCTION object (which has no `params`) → `undefined`. Read it: `const route = useRoute(); route().params.id`.
- Reading `route().params.id` OUTSIDE a reactive scope (in the raw component body) captures the value ONCE — it will NOT update on a same-component param change (`/user/1 → /user/2` re-renders the User leaf but the top-level `const` was already evaluated). Read inside JSX / `effect` / `computed` to track.
- Treating the `<TPath>` type param as validated — `useRoute<"/user/:id">()` is your ASSERTION about the mounted path (the impl casts `as never`). A wrong literal gives wrong param types with no runtime error.
- Calling `useRoute()` with no `<RouterProvider>` ancestor and no active router — throws `[Pyreon] No router installed`.

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
useTypedSearchParams<T extends SearchParamSchema>(schema: T): [get: () => InferSearchParams<T>, set: (updates: Partial<InferSearchParams<T>>) => Promise<NavigationResult>]
```

Type-safe search params with auto-coercion from URL strings. Schema keys define parameter names, values define types (`"string"`, `"number"`, `"boolean"`). Returns a `[get, set]` TUPLE (like `useSearchParams`): `get()` reads the coerced values reactively; `set()` merges updates and navigates via `router.replace` (resolving with the navigation's `NavigationResult`). Missing numbers coerce to `0`, booleans accept `"true"`/`"1"`.

**Example**

```tsx
const [params, setParams] = useTypedSearchParams({ page: "number", q: "string", active: "boolean" })
params().page    // number (auto-coerced)
params().q       // string
setParams({ page: 2 })  // updates URL via router.replace
```

**Common mistakes**

- Destructuring an object (`params.page()`) — the hook returns a TUPLE: `const [params, setParams] = useTypedSearchParams(...)`, read via `params().page`
- Expecting `set()` to bypass navigation — it navigates via `router.replace`, so guards/blockers apply (check the resolved `NavigationResult` if you need to know it committed)

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

Returns a reactive accessor for data set by `RouteMiddleware` in the middleware chain. Middleware functions receive `ctx` with a mutable `ctx.data` object — properties set there are read by calling the returned accessor inside a reactive scope. The data is per-navigation: it resets to `{}` when a navigation whose chain has no middleware commits. (Stored on the router at commit time — the in-flight route object never becomes `currentRoute()`, which is why the pre-fix accessor always returned `{}`.)

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

**Common mistakes**

- Getting `undefined` when the route has NO `loader` — it reads `LoaderDataContext` (default `undefined`). The `<T>` generic is an unchecked CAST, not validation; `data.name` then throws on the undefined.
- Wrapping `useLoaderData()` in an `effect` expecting it to re-fire on navigation — it is a plain (non-reactive) context READ, a snapshot at mount, NOT an accessor. RouterView RE-MOUNTS the route component on a real navigation, which re-runs the body and re-reads the hook; there is no signal to subscribe to.
- SSR returning `undefined` at render time — loaders are async but `renderToString` is synchronous, so the handler must run loaders (`prefetchLoaderData` or `router.preload`) BEFORE rendering. An un-prefetched loader has not resolved when the component reads the hook.
- Calling it in a component NOT rendered by `<RouterView>` (a sibling inside `<RouterProvider>`, a portal outside the route tree) — no `LoaderDataProvider` wraps it, so the context is the default `undefined`.
- Expecting a nested LAYOUT's `useLoaderData()` to return the child PAGE's data — each depth is wrapped with its OWN `LoaderDataProvider`, so a layout reads its own loader's data and the page reads the page's. The hook reads the nearest provider, not the leaf.

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
useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<NavigationResult>]
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

**Common mistakes**

- Object-destructuring the return (`params.page()`) — it is a `[get, set]` TUPLE like `useTypedSearchParams`: `const [search, setSearch] = useSearchParams(...)`, read via `search().page`.
- Expecting auto-coerced types — `useSearchParams` values are RAW strings (`search().page` is `"1"`, not `1`). For typed, auto-coerced params (`"number"`/`"boolean"`), use `useTypedSearchParams`.

**See also:** `useTypedSearchParams` · `useRoute`

---

### useBlocker `hook`

```ts
useBlocker(fn: BlockerFn): Blocker
```

Block navigations while a condition holds. `fn(to, from)` is called before EVERY navigation — including browser Back/Forward, which route through the full pipeline — and returning `true` (or resolving to `true`; async blockers are supported, e.g. `confirm()` dialogs) cancels it. A cancelled browser traversal restores the URL/history position. Returns `{ remove() }` to unregister (auto-removed on component unmount). Also installs a shared ref-counted `beforeunload` handler so tab-close shows the browser confirmation while any blocker is active.

**Example**

```tsx
const blocker = useBlocker((to, from) => {
  return form.isDirty() && !confirm('Discard unsaved changes?')
})
// later, e.g. after save:
blocker.remove()
```

**Common mistakes**

- Expecting `proceed()` / `reset()` methods (React Router shape) — Pyreon's blocker is a predicate: return `true` to block, `false` to allow; `remove()` unregisters it
- Returning `false` to block — inverted: `true` means BLOCK (it answers "should this navigation be blocked?")
- Assuming the Back button bypasses blockers — browser traversals run the same pipeline; a blocked Back restores the URL

**See also:** `useRouter` · `onBeforeRouteLeave`

---

### onBeforeRouteLeave `function`

```ts
onBeforeRouteLeave(guard: NavigationGuard): () => void
```

Register a per-component navigation guard that fires when leaving the current route. Return `false` to cancel, a string path to redirect, or `undefined` to allow. Must be called during component setup.

**Example**

```tsx
onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges()) return false  // cancel navigation
})
```

**Common mistakes**

- Return-value inversion vs `useBlocker` — a GUARD returns `false` to CANCEL (and `undefined` to allow), while a BLOCKER returns `true` to BLOCK. They are opposite; mixing them up either lets navigations through or blocks them all.
- Calling it in an event handler or `effect` — it must run during component SETUP (it registers on the current component's lifecycle and auto-removes on unmount). Called later, it never registers.
- Returning a truthy non-string (e.g. an object) expecting a redirect — only a STRING return redirects (to that path); `false` cancels, `undefined` allows.

**See also:** `onBeforeRouteUpdate` · `useBlocker`

---

### onBeforeRouteUpdate `function`

```ts
onBeforeRouteUpdate(guard: NavigationGuard): () => void
```

Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g., param change `/user/1` to `/user/2`). Same return semantics as `onBeforeRouteLeave` — return `false` to cancel, a string path to redirect, or `undefined` to allow.

**Example**

```tsx
onBeforeRouteUpdate((to, from) => {
  if (to.params.id === from.params.id) return  // no change — allow
  if (hasUnsavedChanges()) return false        // cancel: the param change would lose unsaved edits
  // otherwise allow — reload data for the new ID
})
```

**See also:** `onBeforeRouteLeave` · `useRoute`

---

### useNavigate `function`

```ts
useNavigate() => (path: string) => void
```

Returns an imperative navigate function. Resolves the active router (context first, module singleton fallback) and returns `(path) => router.push(path)`. The returned function ALWAYS pushes (never replaces) and is typed `void` — the underlying `push()` Promise&lt;NavigationResult&gt; is dropped. Mirrors the `useNavigate()` shape on the native (Swift/Kotlin) targets for cross-target source parity.

**Example**

```tsx
const navigate = useNavigate()
// call it from an event handler / onMount / effect — never the render body:
const goHome = () => navigate('/')
```

**Common mistakes**

- Awaiting the result — the returned function is typed `void` (it drops `push()`'s Promise). To observe the NavigationResult ('committed' | 'cancelled' | 'superseded'), or to `replace()` instead of push, call `useRouter().push()` / `.replace()` directly.
- Calling `navigate()` synchronously in the component body — that fires during render and infinite-loops. Defer it (event handler, `onMount`, `effect`); the `pyreon/no-imperative-navigate-in-render` lint rule catches this.
- Calling `useNavigate()` before a router exists (outside a `<RouterProvider>` with no module router set) — it throws `[Pyreon] No router installed`.

**See also:** `useRouter` · `RouterLink`

---

### useParams `function`

```ts
useParams<T extends Record<string, string> = Record<string, string>>() => T
```

Returns a SNAPSHOT map of the current route's path params (`{ id: '42' }` for `/user/:id`). Values are always STRINGS at runtime — the generic `T` is caller-supplied typing only, it does NOT coerce. It reads `router.currentRoute().params` once at call time, so the snapshot is captured when the hook runs; to track param changes across navigation, read `useRoute()().params` in a reactive scope instead.

**Example**

```tsx
const params = useParams<{ id: string }>()   // snapshot at setup

// for params that update on navigation, use the reactive route accessor:
const route = useRoute<'/user/:id'>()
// route().params.id re-reads on every navigation
```

**Common mistakes**

- Treating the returned object as LIVE — it is a one-time snapshot from the component body. On a `/user/1` -&gt; `/user/2` navigation (same component stays mounted), the captured object does NOT update. Read `useRoute()().params` in a reactive scope to track changes.
- Assuming param values are typed — at runtime they are always strings; `useParams<{ id: number }>()` types but does NOT coerce. Parse yourself (`Number(params.id)`).

**See also:** `useRoute` · `useNavigate`

---

### useValidatedSearch `function`

```ts
useValidatedSearch<T extends Record<string, unknown> = Record<string, unknown>>() => () => T
```

Returns a REACTIVE ACCESSOR `() => T` for the current route's VALIDATED search params. It takes NO argument — validation is configured on the ROUTE record via `validateSearch(raw)` (run during navigation; supports arbitrary validators like Zod / Valibot), and this hook surfaces its result off `currentRoute().search` (an empty `{}` when no `validateSearch` is set). Structural sharing (shallow-equal caching) means unrelated query-param changes do not re-trigger downstream reads.

**Example**

```tsx
// route config: { path: '/search', validateSearch: (raw) => schema.parse(raw) }
const search = useValidatedSearch<{ q: string; page: number }>()
// read the accessor inside a reactive scope:
const page = () => search().page
```

**Common mistakes**

- Passing a schema to the hook — it takes NO argument. The schema goes on the route record's `validateSearch` config; `useValidatedSearch()` only READS the already-validated result.
- Confusing it with the other two search hooks: `useTypedSearchParams(schema)` takes a `{ key: 'string' | 'number' | 'boolean' }` shape, coerces primitives itself, and returns a `[get, set]` tuple; `useSearchParams(defaults?)` returns raw strings with no coercion. `useValidatedSearch` is READ-ONLY (no setter), argument-less, and defers to the route validator (arbitrary shapes).
- Reading the accessor once and caching the value — call `search()` inside a reactive scope so it re-reads on navigation.

**See also:** `useTypedSearchParams` · `useSearchParams`

---

### notFound / NotFoundBoundary `function`

```ts
notFound(message?: string) => never · NotFoundBoundary(props: { fallback: ComponentFn | VNodeChild; children?: VNodeChild }) => VNodeChild
```

The Next.js-style 404 pair. `notFound()` THROWS a branded Error (message defaults to 'Not Found') from inside a loader or component; `isNotFoundError` detects the brand (`Symbol.for('pyreon.notFound')`, realm-shared). `NotFoundBoundary` wraps the core `ErrorBoundary`: it renders `children` normally, and when a `notFound()` is thrown in its subtree it renders `fallback` (invoked as a component with `{ error, reset }` when its arity is &lt;= 1, else returned as a plain VNodeChild). It RE-THROWS any non-notFound error so real errors still propagate to an outer error boundary.

**Example**

```tsx
async function loadUser(params: { id: string }) {
  const user = await fetchUser(params.id)
  if (!user) notFound()          // throws — code below is unreachable
  return user
}

const app = (
  <NotFoundBoundary fallback={() => <h1>404 — not found</h1>}>
    <RouterView />
  </NotFoundBoundary>
)
```

**Common mistakes**

- Expecting code after `notFound()` to run — it THROWS (`=> never`) and never returns, so a guard-then-continue pattern does not work (everything after it is unreachable).
- Using `NotFoundBoundary` as a general error boundary — it ONLY handles `notFound()` throws; every other error is RE-THROWN to the nearest outer `ErrorBoundary`.
- Confusing `notFound()` with the route-record `notFoundComponent` / fs-router `_404.tsx` — those are the route-level no-match fallback; `notFound()` drives the `NotFoundBoundary` in the rendered subtree (a different mechanism).

**See also:** `redirect` · `RouterView`

---

### lazy `function`

```ts
lazy(loader: () => Promise<ComponentFn | { default: ComponentFn }>, options?: { loading?: ComponentFn; error?: ComponentFn; hmrId?: string }) => LazyComponent
```

Code-split a route component. Returns a LazyComponent DESCRIPTOR (a branded object, NOT a rendered component) to assign as a route `component`. The loader may resolve a bare component OR an ES-module `{ default }` namespace (so `() => import('./Page')` works). `options.loading` / `options.error` supply Suspense fallbacks; `options.hmrId` is the dev-only module id fs-router emits for hot-swap. The ROUTER caches resolved chunks in a bounded LRU (`maxCacheSize`, default 100); `lazy()` itself does not dedupe.

**Example**

```tsx
const routes = [
  { path: '/reports', component: lazy(() => import('./Reports')) },
]
```

**Common mistakes**

- Calling the result like a component (`lazy(...)()`) — it is an inert DESCRIPTOR; assign it to a route `component` and the router resolves it (into `_componentCache`) on navigation.
- Assuming `lazy()` dedupes concurrent imports — it does not; the router owns caching (bounded LRU, default 100; `router.preload()` warms it before SSR renderToString, which is required so a lazy route is not blank on the server).

**See also:** `createRouter` · `RouterView`

---

## Package-level notes

> **View Transitions — what push() awaits:** `await router.push()` resolves after `updateCallbackDone` (DOM commit), NOT after animation finishes. It does NOT wait for `.finished` (~200-300ms). `.ready` and `.finished` get empty `.catch()` handlers so `AbortError: Transition was skipped` rejections (from interrupted transitions) do not leak as unhandled promise rejections.

> **Hash mode uses pushState:** Hash mode uses `history.pushState` — NOT `window.location.hash` assignment — to avoid double-update from the hashchange event. Reading `location.hash` directly will not reflect router state; use `useRoute()` instead.

> **Imperative navigation in render body:** `router.push()` or `navigate()` called synchronously in the component function body causes an infinite render loop. Wrap in `onMount`, event handlers, `effect`, or any deferred execution context. The `pyreon/no-imperative-navigate-in-render` lint rule catches this.

> **Hook ordering with View Transitions:** `afterEach` hooks and scroll restoration fire AFTER the View Transition callback completes — not before. This means hooks see the NEW route state, which is the correct per-spec behavior but a subtle change from pre-VT versions.

> **For uses by, not key:** `<For>` in route lists uses `by` not `key`. `<For each={routes()} key={r => r.path}>` silently passes the key to VNode reconciliation instead of the list reconciler. Use `by={r => r.path}`.
