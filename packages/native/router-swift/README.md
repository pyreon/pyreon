# @pyreon/native-router-swift

> **EXPERIMENTAL.** SwiftPM package implementing [`@pyreon/router`](../../core/router/)'s API surface on top of SwiftUI's `NavigationStack`. Published to npm — see [Native Packages](https://pyreon.dev/docs/native-packages) for why a Swift package ships through npm and how a scaffolded Xcode project resolves it.

## Installation

You don't install this directly. `@pyreon/create-multiplatform` (`pyreon new --native`) scaffolds a `package.json` dependency on it, and `pyreon-native wire --ios-out` symlinks the resolved install into the Xcode project's `PyreonPackages/` directory:

```yaml
packages:
  PyreonRouter:
    path: PyreonPackages/native-router-swift
```

`import PyreonRouter` in emitted (or hand-written) Swift then resolves against it.

## What's here

Seven source files under `Sources/PyreonRouter/`:

| File | What it is |
|---|---|
| `PyreonRouter.swift` | The router model — `@Observable`, `path: [String]` stack, `push`/`replace`/`back`/`forward`/`reset`, `redirect`, `params`/`query`, `setQueryParam`, a `routes: [RouteRecord]` table, `beforeEachGuards`/`afterEachHooks`, `loaderData`, and `resolveCurrentChain()` — the nested-route resolver `RouterView` renders against. |
| `RouteRecord` (in `PyreonRouter.swift`) | One route definition: a `path` pattern (literal segments, `:name`, `:name?`, `:name*` splat), a `component` factory, optional `children` for nested layouts, and an optional `beforeEnter` guard. |
| `RouterProvider.swift` | Top-level container — wraps `NavigationStack(path:)`, exposes the router via `@Environment(\.pyreonRouter)`. |
| `RouterView.swift` | Renders the matched route at the current nesting depth (`@Environment(\.routerDepth)`), with a `notFoundComponent` wildcard fallback and a no-routes-configured fallback for apps that wire their own `.navigationDestination(for:)`. |
| `Link.swift` | `PyreonLink("/path") { Text("Label") }` — declarative navigation. Named `PyreonLink`, not `Link`, to avoid colliding with SwiftUI's own URL-opening `Link` type. |
| `Hooks.swift` | `useNavigate(router:)`, `useParams(router:)`, `useLoaderData<T>(router:)`. |
| `RouteLoader.swift` | `PyreonRouteLoader` — wraps a route's component, running its `loader` closure exactly once on first appear and storing the result via `router.setLoaderData`, matching the web router's "loader runs once per navigation" contract. |
| `PyreonDeepLink.swift` | A process-wide inbound deep-link channel. `PyreonDeepLink.receive(_ url: URL)` (call from `onOpenURL` / `application(_:open:options:)`) delivers a URL's path to the currently-live router, or holds it as `pending` for the next router constructed if none exists yet (a cold launch). |

## API parity with `@pyreon/router`

| Web (`@pyreon/router`) | iOS (this package) |
|---|---|
| `createRouter({ routes })` | `PyreonRouter(routes:)` |
| `<RouterProvider router={router}>` | `RouterProvider(router: router) { ... }` |
| `<RouterView />` | `RouterView()` |
| `<Link to="/users/123">Profile</Link>` | `PyreonLink("/users/123") { Text("Profile") }` |
| `useNavigate()` | `useNavigate(router:)` |
| `useParams()` | `useParams(router:)` |
| `useLoaderData<T>()` | `useLoaderData(router:)` |
| `router.push(path)` | `router.push(path)` |
| `router.replace(path)` | `router.replace(path)` |
| `router.back()` / `.forward()` | `router.back()` / `.forward()` |
| `router.currentRoute().path` | `router.currentPath` |
| a `loader:` on a route | `PyreonRouteLoader` wrapping the route's component |
| inbound universal/app links | `PyreonDeepLink.receive(_:)` |

## Usage

```swift
import SwiftUI
import PyreonRouter

let routes = [
    RouteRecord(
        path: "/app",
        component: { AnyView(AppLayout()) },
        children: [
            RouteRecord(path: "/app/dashboard", component: { AnyView(Dashboard()) }),
            RouteRecord(path: "/app/profile/:id", component: { AnyView(Profile()) }),
        ],
    ),
]

struct RootView: View {
    @State private var router = PyreonRouter(routes: routes)
    var body: some View {
        RouterProvider(router: router) {
            RouterView()   // renders the matched leaf; a nested RouterView() inside
        }                  // AppLayout() picks up the matched child automatically
    }
}

struct AppLayout: View {
    var body: some View {
        VStack {
            Text("App shell")
            RouterView()
        }
    }
}
```

`useNavigate` / `useParams` / `useLoaderData` read from the same router via `@Environment(\.pyreonRouter)`:

```swift
struct DashboardLink: View {
    @Environment(\.pyreonRouter) private var router

    var body: some View {
        Button("Go to dashboard") {
            useNavigate(router: router)("/app/dashboard")
        }
    }
}
```

## Cross-platform source

The PMTC compiler's canonical-primitive emit table targets this package's symbols — the intent is that the same `.tsx` compiles to this runtime on iOS and to [`@pyreon/native-router-kotlin`](../router-kotlin/) on Android:

```tsx
import { createRouter, RouterProvider, RouterView, RouterLink, useNavigate } from '@pyreon/router'

function App() {
  const router = createRouter()
  return (
    <RouterProvider router={router}>
      <RouterLink to="/users/123">View Profile</RouterLink>
      <RouterView />
    </RouterProvider>
  )
}
```

## Build / test locally

Requires macOS with Xcode 15+ (Swift 5.9, iOS 17 deployment target).

```bash
cd packages/native/router-swift
swift build
swift test
```

The npm `test` script gracefully skips when `swift` isn't on `PATH`, so `bun run --filter='*' test` from the repo root doesn't break on cross-platform setups.

## What to read next

- [Native Packages](https://pyreon.dev/docs/native-packages) — this package's place among the other five, plus a router usage example next to the Kotlin twin.
- [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) — the compiler that emits code against this runtime.
