# @pyreon/router

> **Status: Stable.** Covered by the [semver policy](https://pyreon.dev/docs/stability-and-direction). Experimental subpaths, which may change in a minor release: `./native-plugin`.

Type-safe client-side router with nested routes, loaders, View Transitions, middleware, and SSR.

`@pyreon/router` provides `createRouter`, `<RouterProvider>`, `<RouterView>`, `<RouterLink>`, and a suite of hooks (`useRoute`, `useRouter`, `useLoaderData`, `useTransition`, `useIsActive`, `useSearchParams`, `useTypedSearchParams`, `useValidatedSearch`, `useMiddlewareData`, `useBlocker`). Path params are TypeScript-inferred from path strings (`'/user/:id'` → `{ id: string }`); named routes enable typed programmatic navigation. Supports hash, history, and SSR modes; per-route data loaders with TTL cache + in-flight dedup + SWR; navigation guards + middleware; View Transitions integration; `notFound()` / `redirect()` thrown from loaders with discriminated-union helpers; validated typed search params; `lazy(loader)` for code-split route components.

## Install

```bash
bun add @pyreon/router @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import {
  createRouter, RouterProvider, RouterView, RouterLink,
  useRoute, useRouter, useLoaderData, useTypedSearchParams, useTransition,
  notFound, NotFoundBoundary, redirect, lazy,
} from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'

const router = createRouter<'home' | 'user'>({
  routes: [
    { path: '/', component: Home, name: 'home' },
    { path: '/user/:id', component: User, name: 'user',
      loader: ({ params }) => fetchUser(params.id) },
    { path: '/admin', component: AdminLayout,
      children: [{ path: 'users', component: AdminUsers }] },
    { path: '/old-path', redirect: '/new-path' },
    { path: '/dashboard', component: lazy(() => import('./Dashboard')) },
    { path: '(.*)', component: NotFoundPage },
  ],
})

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/" prefetch="intent">Home</RouterLink>
        <RouterLink to={{ name: 'user', params: { id: '42' } }}>Profile</RouterLink>
      </nav>
      <NotFoundBoundary fallback={<p>404</p>}>
        <RouterView />
      </NotFoundBoundary>
    </RouterProvider>
  )
}

function User() {
  const route = useRoute<'/user/:id'>()
  const data = useLoaderData<{ name: string }>()
  const [search] = useTypedSearchParams({ page: 'number', q: 'string' })
  return <h1>{data().name} (id={route().params.id}, page={search().page ?? 1})</h1>
}

mount(<App />, document.getElementById('app')!)
```

## Modes

```ts
createRouter({ routes, mode: 'hash' })    // default; for static hosting; pushState w/ #
createRouter({ routes, mode: 'history' }) // uses pushState (set `base` for sub-path deploys)
createRouter({ routes, url: '/some/path' }) // SSR — pin to a URL for one render
createRouter({ routes, mode: 'memory' })  // location inside the router; the page URL is never touched
```

Hash mode uses `history.pushState` under the hood (not `window.location.hash`) to avoid the double-update jank.

### Memory mode

`mode: 'memory'` keeps the location in an entry stack inside the router, for a
router embedded in a page that already has one (a live demo, a widget), for
tests, and for hosts with no `window`:

```ts
const demo = createRouter({
  routes,
  mode: 'memory',
  initialEntries: ['/', '/users/1'], // default [url ?? '/']
  initialIndex: 1,                   // default: the last entry
})
await demo.push('/users/2') // 'committed' — the page URL and history.length do not change
demo.back()                 // guards, blockers, loaders and afterEach run, as on a real Back
```

- `push` / `replace` / `back` / `forward` / `go` run the full navigation
  pipeline against the stack. A traversal that a guard or blocker cancels
  leaves the position where it was; a step past either end, or `go(0)`, does
  nothing.
- Nothing is read from or written to `window.history` / `location`, no window
  listener is attached, and the router never takes over the page router's
  cancelled-Back restores — two routers (one memory, one browser) share a page
  without disturbing each other. It also works with no `window` at all.
- `<RouterLink>` renders the plain route path as its `href` (`/users/2`), so
  the link stays an accessible anchor; a click navigates the memory router.
  There is no real URL, so "open in new tab" opens that path on the host
  origin.
- Left to the page: `document.title` (`meta.title` is not written), View
  Transitions (not used), and scroll (only with an explicit `scrollBehavior`).
  An external `redirect('https://…')` resolves `'cancelled'` with a dev
  warning instead of navigating the page.
- Native (iOS/Android) routers are in-memory stacks already; `initialEntries`
  / `initialIndex` are ignored there with a compiler warning.

### Navigation results + browser Back/Forward

`router.push()` / `replace()` resolve with a `NavigationResult`:

```ts
const result = await router.push('/checkout')
// 'committed'  — the route (or a redirect it chained into) is now current
// 'cancelled'  — a blocker / guard / middleware refused it
// 'superseded' — a newer navigation started meanwhile and won
```

Browser **Back/Forward (popstate/hashchange) runs the full navigation
pipeline** — loaders re-run (so `useLoaderData()` is populated after Back),
guards + blockers apply, `afterEach` fires (the route announcer announces),
and `meta.title` updates. A traversal cancelled by a guard/blocker restores
the URL and history position (`history.go` when the entry carries the
router's position stamp, `replaceState` otherwise).

Scroll on Back/Forward: with no `scrollBehavior` configured, the browser's
NATIVE scroll restoration owns it (untouched). Configuring `scrollBehavior`
switches `history.scrollRestoration` to `'manual'` and the router's
ScrollManager takes over for traversals too.

## Typed params + named navigation

```tsx
// Params inferred from the path string
const route = useRoute<'/user/:id'>()
route().params.id // string

// Typed names — compile-time-checked
const router = createRouter<'home' | 'user' | 'admin'>({ routes })
router.push({ name: 'user', params: { id: '42' } })
router.push({ name: 'typo' }) // ❌ TypeScript error
```

## RouterLink

```tsx
<RouterLink to="/user/42">Profile</RouterLink>
<RouterLink to={{ name: 'user', params: { id: '42' } }}>Profile</RouterLink>
<RouterLink to="/about" prefetch="hover">About</RouterLink>
<RouterLink to="/feed" prefetch="viewport">Feed</RouterLink>
<RouterLink to="/dashboard" activeClass="is-active">Dashboard</RouterLink>
```

**Prefetch strategies** (default: `"intent"`):

- `"intent"` — prefetches on hover AND focus (keyboard + mouse parity)
- `"hover"` — hover only
- `"viewport"` — once the link enters the viewport (`IntersectionObserver`, scheduled via `requestIdleCallback`)
- `"none"` — disabled

`activeClass` is **merged** with the user-provided `class` via `cx` (not overridden). `aria-current="page"` is set automatically on active links.

`RouterLink` resolves its router the same way the hooks do — the nearest `<RouterProvider>` context, falling back to the active router (`setActiveRouter`). Without ANY router it degrades to a **plain anchor** (plain-path `href`, no click interception → full-load navigation) and warns once per `to` in dev.

**Dev-only full-reload warning:** a plain internal `<a href="/x">` in a router app warns on click (`use <RouterLink to="/x">…`) — `RouterLink` clicks never warn (it `preventDefault()`s the internal clicks it handles). Deliberate full-load links opt out via `target`, `download`, or `data-allow-reload`; the listener is removed by `router.destroy()`.

## Data loaders

```ts
{
  path: '/user/:id',
  component: User,
  loader: async ({ params, request }) => {
    const r = await fetch(`/api/users/${params.id}`)
    if (!r.ok) notFound()
    return r.json()
  },
  loaderKey: ({ params }) => `user-${params.id}`,
  gcTime: 5 * 60_000,            // default; cache expiry
  staleWhileRevalidate: true,    // serve cached, refetch in background
}
```

Loaders run before the route renders. In-flight calls for the same `loaderKey` dedupe; cached results are served until `gcTime` expires. `router.invalidateLoader(key?)` clears entries. `<RouterLink prefetch>` (hover/viewport) routes through the SAME cache + in-flight dedup, so a prefetch and the click that follows share ONE loader run.

Read loader data in the component. `useLoaderData()` returns an accessor: read `data()` in JSX, an `effect` or a `computed`. The page stays mounted when the data changes under the same loader key (a `revalidate()`, an SWR refresh, a server loader re-run on a query-only navigation), and the accessor follows it; a value read once in the body does not.

```ts
const data = useLoaderData<{ name: string }>()
// <h1>{data().name}</h1>
```

`LoaderContext.request?: Request` is populated on SSR (via `prefetchLoaderData(router, path, request)`) and for serverLoaders run by the data endpoint; `undefined` for isomorphic loaders running in the browser.

### Server loaders + single-fetch

- **`serverLoader`** on a `RouteRecord` is a server-only data loader — present as a real function ONLY in the SSR module graph (zero's `.server.ts` sibling convention); it never ships to the client. A record must not have both `loader` and `serverLoader`.
- **`hasServerLoader`** is the serializable marker client builds carry instead — it triggers ONE fetch to the data endpoint for the whole matched chain on client navigations (single-fetch).
- **`runServerLoaders(router, path, request?)`** runs only the matched chain's serverLoaders, keyed by matched-chain index; returns `{ kind: 'data', data }`, `{ kind: 'redirect', to, status }` or `{ kind: 'notFound' }`. Server-side use — it's what the data endpoint's worker calls.

### Preloading for SSR

- **`preloadRoute(router, path, request?)`** prepares a server render: the initial route's guards, the matched lazy components, then the matched loaders. Every SSR/SSG host calls it before rendering.
- **`router.preloadComponents(path)`** loads the matched lazy components only (never loaders) and resolves `false` when the initial guards refuse the route. Zero's hydrating client calls it before `hydrateRoot`, and `<Link>` calls it to warm a chunk.

`preloadRoute` and `runServerLoaders` are free functions rather than router methods so client bundles, which never call them, do not carry them.
- **`dataEndpoint`** (createRouter option, default `` `${base}/_pyreon/data` ``) is the URL the client router fetches server-loader data from; zero's `createServer` auto-mounts it.

### Compiling loaders out

Define `globalThis.__PYREON_ROUTER_LOADERS__` as `false` at build time to drop the loader engine and loader rendering from the bundle (~0.9–1 KB gz) in an app with no loaders. Undefined means on. `@pyreon/zero` sets it for you in production builds, based on its route scan.

## Guards + middleware

```ts
{
  path: '/admin',
  component: AdminLayout,
  beforeEnter: (to, from) => isAdmin() || '/login',
  children: [...],
}

// Middleware is PER-ROUTE (runs for every matched record, root → leaf,
// before guards). It receives ONE ctx argument: { to, from, data }.
{
  path: '/app',
  component: AppLayout,
  middleware: async (ctx) => {
    ctx.data.user = await fetchUser(ctx.to)
    if (!ctx.data.user) return '/login' // string = redirect, false = cancel
  },
  children: [...],
}

// In components (per-navigation; resets when a middleware-less chain commits):
const data = useMiddlewareData()
data().user
```

## notFound() / redirect()

```ts
import { notFound, redirect } from '@pyreon/router'

// In a loader
loader: async ({ params, request }) => {
  const user = await fetchUser(params.id)
  if (!user) notFound()                     // → NotFoundBoundary fallback
  if (!user.isVerified) redirect('/verify') // → router.replace, or HTTP 302/307 on SSR
  return user
}
```

`notFound()` and `redirect()` throw discriminated-union errors. The router catches them; `@pyreon/server`'s SSR handler returns real HTTP `404` / `302` / `307` responses (no layout HTML leaks server-side). Error-boundary code can introspect via `isNotFoundError(err)` / `isRedirectError(err)` / `getRedirectInfo(err)`.

Pair with `<NotFoundBoundary fallback={<NotFoundPage />}>...</NotFoundBoundary>` at your layout root.

### Redirect-target security

`redirect(url)` trusts `url`: a same-origin path is an SPA navigation, an explicit `https://…` URL is a real cross-origin navigation on both server and client. If `url` ever comes from untrusted input (a `?next=` query param, anything a user can influence), validate it first — otherwise `redirect()` is an open redirect. `classifyRedirectTarget(target)` is the classifier the router and the SSR handler both use internally, exported so app code can reuse the same judgment: it returns `{ kind: 'internal' | 'external' | 'block', url }`, blocking protocol-relative targets (`//evil.com`, and the `\\`/`/\`/`\/` variants the URL parser treats identically) and non-`http(s)` schemes (`javascript:`, `data:`, …). `safeRedirectLocation(target)` is the one-line version for the common case — pass it an untrusted target and get back a safe string (block verdicts collapse to `/`).

```ts
import { safeRedirectLocation } from '@pyreon/router'

// `next` is attacker-controlled (a query param) — never redirect to it raw.
loader: async ({ request }) => {
  const next = new URL(request.url).searchParams.get('next') ?? '/'
  redirect(safeRedirectLocation(next))
}
```

## Tab stacks

A tab-bar app gives every tab its own back stack with `routerTabs()` and binds `<Tabs router>` from `@pyreon/primitives`, with a `<RouterView />` in each `<Tab>`:

```ts
import { createRouter, routerTabs } from '@pyreon/router'

const router = createRouter({
  routes,
  tabs: routerTabs([
    { name: 'feed', root: '/feed' },
    { name: 'me', root: '/me' },
  ]),
})
router.selectTab('me') // keeps every stack; re-selecting the active tab pops it to its root
```

`push` acts on the active tab; a path under another tab's root selects that tab. On the web every history entry records its tab and stack, so Back/Forward restore both. `tabs` takes the `routerTabs()` value rather than a plain array so the tab engine is bundled only by apps that use tabs (a plain array throws).

## Pending components

```ts
{
  path: '/dashboard',
  component: Dashboard,
  loader: fetchDashboard,
  pendingComponent: DashboardSkeleton,
  pendingMs: 200,    // delay before showing skeleton (avoid flash)
  pendingMinMs: 500, // minimum display time (avoid flicker)
}
```

Hidden → pending → ready state machine, signal-driven.

## Validated search params

```ts
// Plain function
{ path: '/search', validateSearch: (raw) => ({ page: Number(raw.page) || 1, q: raw.q ?? '' }) }

// Zod
{ path: '/search', validateSearch: z.object({ page: z.coerce.number().default(1), q: z.string() }).parse }

// In component
const search = useValidatedSearch<{ page: number; q: string }>()
search().page // number
```

Structural sharing — returns the same object reference when validated values haven't changed.

For untyped or single-shot reads:

```ts
const [params, setParams] = useSearchParams() // strings
const [typed, setTyped] = useTypedSearchParams({ page: 'number', q: 'string' })
typed().page // number | undefined (undefined when absent or not a number)
setTyped({ page: 2 }) // other query params and the hash are kept
```

## View Transitions

Route changes auto-wrap in `document.startViewTransition()` when supported. Opt out per-route with `meta: { viewTransition: false }`.

**`await router.push()` / `.replace()` resolves on `updateCallbackDone`** — the DOM commit, NOT the full animation:

| Promise | Resolves when | Router awaits? |
|---|---|---|
| `updateCallbackDone` | Callback done; DOM swapped; new state live | ✅ yes |
| `ready` | Snapshot captured, pseudo-elements ready | no — `.catch()` only |
| `finished` | Full animation completed (200-300ms) | no — `.catch()` only |

Blocking every navigation on a 200-300ms animation is unacceptable; `.ready` and `.finished` get `.catch()` handlers so their `AbortError` (when a newer navigation interrupts) doesn't leak as unhandled.

`afterEach` hooks + scroll restoration fire AFTER the VT callback completes — they observe the new route state.

## Component-level hooks

```ts
onBeforeRouteLeave((to, from) => confirm('Leave?') || false)
onBeforeRouteUpdate((to, from) => { /* same-route params changed */ })

// Browser navigation guard for unsaved changes
useBlocker(() => isDirty)
```

## SSR helpers

```ts
import {
  prefetchLoaderData, hydrateLoaderData,
  serializeLoaderData, stringifyLoaderDataForScript,
} from '@pyreon/router'

// Server: pre-fetch + serialize
await prefetchLoaderData(router, url.pathname, request)
const blob = serializeLoaderData(router)
const expr = stringifyLoaderDataForScript(blob)   // for <script>window.__PYREON_LOADER_DATA__=${expr}</script>

// Client: hydrate
hydrateLoaderData(router, window.__PYREON_LOADER_DATA__)
```

`stringifyLoaderData` is the safe serializer: drops `function` / `symbol` values, throws `[Pyreon] Loader returned circular reference at "<path>"` on cycles, and escapes the `<` class plus U+2028/U+2029 so the text is safe inside a `<script>`. It returns JSON text — use it for a JSON response or a `<script type="application/json">` block. For an executable `window.X=…` assignment use `stringifyLoaderDataForScript`: a JavaScript object literal treats a `"__proto__":` key as a prototype setter, so it emits that key in the computed form `["__proto__"]` (output is otherwise byte-identical).

## Match utilities

```ts
import {
  resolveRoute, buildPath, findRouteByName,
  parseQuery, parseQueryMulti, stringifyQuery,
} from '@pyreon/router'

const resolved = resolveRoute('/user/42?tab=settings', routes)
const url = buildPath('/user/:id', { id: '42' })       // '/user/42'
const url2 = buildPath('/blog/:rest*', { rest: 'a/b' }) // '/blog/a/b' — catch-all
```

## Type helpers ("derive, don't annotate twice")

`LoaderData<L>` derives a loader's RESOLVED data type from the loader function itself (type-only, zero runtime bytes):

```ts
import { useLoaderData, type LoaderData } from '@pyreon/router'

export const loader = async () => ({ posts: await fetchPosts() })

function PostsPage() {
  const data = useLoaderData<LoaderData<typeof loader>>()
  // data(): { posts: Post[] } — follows the loader; no second annotation, no drift
}
```

`ExtractParams<Path>` (params from a path pattern, incl. `:id?` optional and `:slug*` splat) and the `RegisteredRoutes` typed-routes augmentation are the pre-existing members of the same family.

## Documentation

Full docs: [pyreon.dev/docs/router](https://pyreon.dev/docs/router) (or `docs/src/content/docs/router.md` in this repo).

## License

MIT

### Native compiler plugin

The native CLI discovers the package's tooling entry from `pyreon.native.plugin`. Direct compiler callers install it explicitly:

```ts
import { createCompiler } from '@pyreon/native-compiler'
import routerPlugin from '@pyreon/router/native-plugin'

const compiler = createCompiler({ plugins: [routerPlugin] })
```

The compiler peer is optional. The runtime entry does not load compiler tooling.
