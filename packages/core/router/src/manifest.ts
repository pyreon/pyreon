import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/router',
  title: 'Router',
  tagline:
    'hash+history+SSR, context-based, prefetching, guards, loaders, useIsActive, View Transitions, middleware, typed search params',
  description:
    'Type-safe client-side router for Pyreon with nested routes, per-route and global navigation guards, data loaders, middleware chain, View Transitions API integration, and typed search params. Context-based (`RouterContext`) with hash and history mode support. Route params are inferred from path strings (`"/user/:id"` yields `{ id: string }`). Named routes enable typed programmatic navigation. SSR-compatible with server-side route resolution. Hash mode uses `history.pushState` (not `window.location.hash`) to avoid double-update. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit), not after animation completion.',
  category: 'browser',
  longExample: `import { createRouter, RouterProvider, RouterView, RouterLink, useRouter, useRoute, useIsActive, useTypedSearchParams, useTransition, useLoaderData, useMiddlewareData } from "@pyreon/router"
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
      children: [
        { path: "users", component: AdminUsers },
        { path: "settings", component: AdminSettings },
      ] },
    { path: "/settings", redirect: "/admin/settings" },
    { path: "(.*)", component: NotFound },
  ],
  middleware: [authMiddleware, loggerMiddleware],
})

// Mount with RouterProvider
mount(
  <RouterProvider router={router}>
    <nav>
      <RouterLink to="/" activeClass="nav-active">Home</RouterLink>
      <RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>
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
  const { isTransitioning } = useTransition()
  const params = useTypedSearchParams({ tab: "string", page: "number" })

  return (
    <div>
      <h1>{data.name} (ID: {route().params.id})</h1>
      <Show when={isTransitioning()}>
        <ProgressBar />
      </Show>
      <button onClick={() => router.push("/")}>Go Home</button>
    </div>
  )
}`,
  features: [
    'createRouter() — factory with routes, guards, middleware, loaders, hash/history mode',
    'RouterProvider / RouterView / RouterLink — context-based rendering components',
    'useRouter / useRoute — programmatic navigation and typed route access',
    'useIsActive — reactive boolean for path matching (segment-aware prefix)',
    'useTypedSearchParams — typed search params with auto-coercion',
    'useTransition — reactive signal for route transition state',
    'useMiddlewareData — read data set by route middleware chain',
    'useLoaderData — access route loader results',
    'View Transitions API — auto-enabled, awaits updateCallbackDone',
    'Named routes — typed navigation via { name, params }',
    'Nested routes — recursive matching with child RouterView',
    'Navigation guards — per-route and global beforeEnter/afterEach hooks',
  ],
  api: [
    {
      name: 'createRouter',
      kind: 'function',
      signature: 'createRouter(options: RouterOptions | RouteRecord[]): Router',
      summary:
        'Create a router instance with route records, guards, middleware, and mode configuration. Accepts either an array of route records (shorthand) or a full `RouterOptions` object with `routes`, `mode` (`"history"` | `"hash"`), `scrollBehavior`, `beforeEach`, `afterEach`, and `middleware`. The returned `Router` is generic over route names for typed programmatic navigation.',
      example: `const router = createRouter([
  { path: "/", component: Home },
  { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) },
  { path: "/admin", component: Admin, beforeEnter: requireAuth, children: [
    { path: "settings", component: Settings },
  ]},
])`,
      mistakes: [
        '`createRouter({ routes: [...], mode: "hash" })` and using `window.location.hash` elsewhere — hash mode uses `history.pushState`, not `location.hash`. Reading `location.hash` directly will not reflect router state',
        'Defining route paths without leading `/` in root routes — all root-level paths must start with `/`',
        'Using `redirect: "/target"` with a guard on the same route — redirects bypass guards. Use `beforeEnter` to conditionally redirect instead',
        'Forgetting the catch-all route — `{ path: "(.*)", component: NotFound }` should be the last route to handle 404s',
      ],
      seeAlso: ['RouterProvider', 'useRouter', 'useRoute'],
    },
    {
      name: 'RouterProvider',
      kind: 'component',
      signature: '<RouterProvider router={router}>{children}</RouterProvider>',
      summary:
        'Provide the router instance to the component tree via `RouterContext`. Must wrap the entire app (or the routed section). Sets up the context stack so `useRouter()`, `useRoute()`, and other hooks can access the router.',
      example: `const App = () => (
  <RouterProvider router={router}>
    <nav><RouterLink to="/">Home</RouterLink></nav>
    <RouterView />
  </RouterProvider>
)`,
      seeAlso: ['createRouter', 'RouterView', 'RouterLink'],
    },
    {
      name: 'RouterView',
      kind: 'component',
      signature: '<RouterView />',
      summary:
        'Render the matched route\'s component. For nested routes, the parent route component includes a `<RouterView />` that renders the matched child. Each `<RouterView>` renders one level of the route tree.',
      example: `// Renders the matched route's component
<RouterView />

// Nested routes: parent component includes <RouterView /> for children
const Admin = () => (
  <div>
    <h1>Admin</h1>
    <RouterView />  {/* renders Settings, Users, etc. */}
  </div>
)`,
      seeAlso: ['RouterProvider', 'createRouter'],
    },
    {
      name: 'RouterLink',
      kind: 'component',
      signature: '<RouterLink to={path} activeClass={cls} exactActiveClass={cls}>{children}</RouterLink>',
      summary:
        'Declarative navigation link that renders an `<a>` element. Supports string paths or named route objects (`{ name, params }`). Applies `activeClass` when the current route matches the link path (prefix), and `exactActiveClass` for exact matches. Click handler calls `router.push()` and prevents default.',
      example: `<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>`,
      mistakes: [
        '`<a href="/about" onClick={() => router.push("/about")}>` — use `<RouterLink to="/about">` instead; it handles the anchor element, active class, and click interception',
        '`<RouterLink to="/about" target="_blank">` — external navigation bypasses the router; use a plain `<a>` for external links',
        '`<RouterLink to={dynamicPath}>` without calling the signal — must call: `<RouterLink to={dynamicPath()}>` (or let the compiler handle it via `_rp()`)',
      ],
      seeAlso: ['useRouter', 'useIsActive'],
    },
    {
      name: 'useRouter',
      kind: 'hook',
      signature: 'useRouter(): Router',
      summary:
        'Access the router instance for programmatic navigation. Returns the `Router` object with `push()`, `replace()`, `back()`, `forward()`, `go()`. `await router.push()` resolves after the View Transition `updateCallbackDone` (DOM commit is complete, new route state is live), NOT after the animation finishes.',
      example: `const router = useRouter()

router.push("/settings")
router.push({ name: "user", params: { id: "42" } })
router.replace("/login")
router.back()
router.forward()
router.go(-2)`,
      mistakes: [
        '`router.push("/path")` at the top level of a component body — this is synchronous imperative navigation during render, causing an infinite loop. Wrap in `onMount`, event handler, or `effect`',
        '`await router.push("/path")` expecting animation completion — `push` resolves after DOM commit (`updateCallbackDone`), not after View Transition animation finishes. Use the returned transition object\'s `.finished` if you need to wait for animation',
        'Calling `useRouter()` outside a `<RouterProvider>` — throws because no router context exists',
      ],
      seeAlso: ['useRoute', 'RouterLink', 'createRouter'],
    },
    {
      name: 'useRoute',
      kind: 'hook',
      signature: 'useRoute<TPath extends string>(): () => ResolvedRoute<ExtractParams<TPath>>',
      summary:
        'Access the current resolved route as a reactive accessor. Generic over the path string for typed params — `useRoute<"/user/:id">()` yields `route().params.id: string`. Returns a function (accessor) that must be called to read the current route — reads inside reactive scopes track route changes.',
      example: `// Type-safe params:
const route = useRoute<"/user/:id">()
const userId = route().params.id  // string

// Access query, meta, etc:
route().query
route().meta`,
      seeAlso: ['useRouter', 'useSearchParams', 'useLoaderData'],
    },
    {
      name: 'useIsActive',
      kind: 'hook',
      signature: 'useIsActive(path: string, exact?: boolean): () => boolean',
      summary:
        'Returns a reactive boolean for whether a path matches the current route. Segment-aware prefix matching: `/admin` matches `/admin/users` but NOT `/admin-panel`. Pass `exact=true` for exact-only matching. Updates reactively when the route changes.',
      example: `const isHome = useIsActive("/")
const isAdmin = useIsActive("/admin")          // prefix match
const isExactAdmin = useIsActive("/admin", true)  // exact only

// Reactive — updates when route changes:
<a class={{ active: isAdmin() }} href="/admin">Admin</a>`,
      mistakes: [
        '`useIsActive("/admin")` matching `/admin-panel` — this does NOT happen. Matching is segment-aware: `/admin` only matches paths starting with `/admin/` or exactly `/admin`',
        '`if (useIsActive("/settings")())` at component top level — the outer call returns an accessor; make sure to read it inside a reactive scope for updates',
        'Using `useIsActive` for complex route matching — it only does path prefix/exact matching. For query-param-aware or meta-aware checks, use `useRoute()` directly',
      ],
      seeAlso: ['useRoute', 'RouterLink'],
    },
    {
      name: 'useTypedSearchParams',
      kind: 'hook',
      signature: 'useTypedSearchParams<T>(schema: T): TypedSearchParams<T>',
      summary:
        'Type-safe search params with auto-coercion from URL strings. Schema keys define parameter names, values define types (`"string"`, `"number"`, `"boolean"`). Returns an object where each key is a reactive accessor and `.set()` updates the URL.',
      example: `const params = useTypedSearchParams({ page: "number", q: "string", active: "boolean" })
params.page()    // number (auto-coerced)
params.q()       // string
params.set({ page: 2 })  // updates URL`,
      seeAlso: ['useSearchParams', 'useRoute'],
    },
    {
      name: 'useTransition',
      kind: 'hook',
      signature: 'useTransition(): { isTransitioning: () => boolean }',
      summary:
        'Reactive signal for route transition state. `isTransitioning()` is true during navigation (while guards run + loaders resolve), false when the new route is mounted. Useful for progress bars and global loading indicators.',
      example: `const { isTransitioning } = useTransition()

<Show when={isTransitioning()}>
  <ProgressBar />
</Show>`,
      seeAlso: ['useRouter', 'useRoute'],
    },
    {
      name: 'useMiddlewareData',
      kind: 'hook',
      signature: 'useMiddlewareData<T>(): T',
      summary:
        'Read data set by `RouteMiddleware` in the middleware chain. Middleware functions receive `ctx` with a mutable `ctx.data` object — properties set there are available to all downstream components via this hook.',
      example: `// Middleware:
const authMiddleware: RouteMiddleware = async (ctx) => {
  ctx.data.user = await getUser(ctx.to)
}

// Component:
const data = useMiddlewareData<{ user: User }>()
// data.user is available`,
      seeAlso: ['createRouter', 'useLoaderData'],
    },
    {
      name: 'useLoaderData',
      kind: 'hook',
      signature: 'useLoaderData<T>(): T',
      summary:
        'Access the data returned by the current route\'s `loader` function. The loader runs before the route component mounts; its return value is cached and available synchronously via this hook. Generic over the loader return type.',
      example: `// Route: { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) }

const User = () => {
  const data = useLoaderData<UserData>()
  return <div>{data.name}</div>
}`,
      seeAlso: ['useMiddlewareData', 'useRoute'],
    },
    {
      name: 'useSearchParams',
      kind: 'hook',
      signature:
        'useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<void>]',
      summary:
        'Access and update URL search params as a reactive tuple. Returns `[get, set]` where `get()` reads the current params and `set()` updates them via `replaceState`. For typed params with auto-coercion, prefer `useTypedSearchParams`.',
      example: `const [search, setSearch] = useSearchParams({ page: "1", sort: "name" })

// Read:
search().page  // "1"

// Write:
setSearch({ page: "2" })`,
      seeAlso: ['useTypedSearchParams', 'useRoute'],
    },
    {
      name: 'useBlocker',
      kind: 'hook',
      signature: 'useBlocker(shouldBlock: () => boolean): Blocker',
      summary:
        'Block navigation when a condition is true (e.g., unsaved form changes). Returns a `Blocker` object with `proceed()` and `reset()` methods. Also hooks into the browser\'s `beforeunload` event to warn on tab close. Uses a shared ref-counted listener for `beforeunload` — N blockers share one event handler.',
      example: `const blocker = useBlocker(() => form.isDirty())

<Show when={blocker.isBlocked()}>
  <Dialog>
    <p>Unsaved changes. Leave anyway?</p>
    <button onClick={blocker.proceed}>Leave</button>
    <button onClick={blocker.reset}>Stay</button>
  </Dialog>
</Show>`,
      seeAlso: ['useRouter'],
    },
    {
      name: 'onBeforeRouteLeave',
      kind: 'function',
      signature: 'onBeforeRouteLeave(guard: NavigationGuard): void',
      summary:
        'Register a per-component navigation guard that fires when leaving the current route. Return `false` to cancel, a string path to redirect, or `undefined` to allow. Must be called during component setup.',
      example: `onBeforeRouteLeave((to, from) => {
  if (hasUnsavedChanges()) return false  // cancel navigation
})`,
      seeAlso: ['onBeforeRouteUpdate', 'useBlocker'],
    },
    {
      name: 'onBeforeRouteUpdate',
      kind: 'function',
      signature: 'onBeforeRouteUpdate(guard: NavigationGuard): void',
      summary:
        'Register a per-component navigation guard that fires when the route updates but the same component stays mounted (e.g., param change `/user/1` to `/user/2`). Same return semantics as `onBeforeRouteLeave`.',
      example: `onBeforeRouteUpdate((to, from) => {
  if (to.params.id === from.params.id) return  // no change
  // reload data for new ID...
})`,
      seeAlso: ['onBeforeRouteLeave', 'useRoute'],
    },
  ],
  gotchas: [
    {
      label: 'View Transitions — what push() awaits',
      note: '`await router.push()` resolves after `updateCallbackDone` (DOM commit), NOT after animation finishes. It does NOT wait for `.finished` (~200-300ms). `.ready` and `.finished` get empty `.catch()` handlers so `AbortError: Transition was skipped` rejections (from interrupted transitions) do not leak as unhandled promise rejections.',
    },
    {
      label: 'Hash mode uses pushState',
      note: 'Hash mode uses `history.pushState` — NOT `window.location.hash` assignment — to avoid double-update from the hashchange event. Reading `location.hash` directly will not reflect router state; use `useRoute()` instead.',
    },
    {
      label: 'Imperative navigation in render body',
      note: '`router.push()` or `navigate()` called synchronously in the component function body causes an infinite render loop. Wrap in `onMount`, event handlers, `effect`, or any deferred execution context. The `pyreon/no-imperative-navigate-in-render` lint rule catches this.',
    },
    {
      label: 'Hook ordering with View Transitions',
      note: '`afterEach` hooks and scroll restoration fire AFTER the View Transition callback completes — not before. This means hooks see the NEW route state, which is the correct per-spec behavior but a subtle change from pre-VT versions.',
    },
    {
      label: 'For uses by, not key',
      note: '`<For>` in route lists uses `by` not `key`. `<For each={routes()} key={r => r.path}>` silently passes the key to VNode reconciliation instead of the list reconciler. Use `by={r => r.path}`.',
    },
  ],
})
