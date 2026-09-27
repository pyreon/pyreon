# @pyreon/native-router-kotlin

> **EXPERIMENTAL.** Kotlin runtime implementing [`@pyreon/router`](../../core/router/)'s API surface on top of Compose state primitives. Published to npm — see [Native Packages](https://pyreon.dev/docs/native-packages) for why Kotlin source ships through npm and how a Gradle build resolves it. The Android twin of [`@pyreon/native-router-swift`](../router-swift/).

## Installation

You don't install this directly. `@pyreon/create-multiplatform` (`pyreon new --native`) scaffolds a `package.json` dependency on it, and `pyreon-native wire --android-out` writes it into the resolved `srcDir` list `android/app/build.gradle.kts` reads. `import com.pyreon.router.*` in emitted (or hand-written) Kotlin then resolves against it. See [Native Packages](https://pyreon.dev/docs/native-packages#android--a-generated-srcdir-list) for the full wiring mechanism.

## What's here

Seven Kotlin sources under `src/main/kotlin/com/pyreon/router/`:

| File | What it is |
|---|---|
| `PyreonRouter.kt` | The router model — a `MutableState<List<String>>` path stack, `push`/`replace`/`back`/`forward`/`reset`, `redirect`, `params`/`query`, a `routes: MutableState<List<RouteRecord>>` table, `beforeEachGuards`/`afterEachHooks`, `loaderData`, and `resolveCurrentChain()`. |
| `RouteRecord` (in `PyreonRouter.kt`) | One route definition: `path`, `children` (nested layouts — declared BEFORE `component` in the constructor specifically so Kotlin's trailing-lambda syntax keeps binding to `component`), `beforeEnter` (a per-route guard), then `component` last. |
| `RouterProvider.kt` | `@Composable` container — exposes the router via the `LocalPyreonRouter` `CompositionLocal`. |
| `RouterView.kt` | Renders the matched route at the current nesting depth (`LocalRouterDepth`), with a `notFoundComponent` wildcard fallback and a manual-`when`-dispatch fallback for apps that don't configure `routes`. |
| `Link.kt` | `PyreonLink(to) { navigate -> ... }` — exposes the navigate action to a caller-supplied clickable wrapper, deliberately keeping this package free of `androidx.compose.material*` (see "Why caller-wraps-clickable" below). |
| `Hooks.kt` | `useNavigate()`, `useParams()`, `useLoaderData<T>()` — `@Composable` functions reading from `LocalPyreonRouter`. |
| `RouteLoader.kt` | `PyreonRouteLoader` — wraps a route's Composable, running its `loader` once on first composition and storing the result via `router.setLoaderData`. |
| `PyreonDeepLink.kt` | A process-wide inbound deep-link channel. `PyreonDeepLink.receive(uri: Uri?)` (call from the launch `Intent` and `onNewIntent`) delivers a URI's path to the currently-live router, or holds it as pending for the next router constructed (a cold launch). |

## API parity with `@pyreon/router`

| Web (`@pyreon/router`) | Android (this package) |
|---|---|
| `createRouter({ routes })` | `PyreonRouter(routes = routes)` |
| `<RouterProvider router={router}>` | `RouterProvider(router) { ... }` |
| `<RouterView />` | `RouterView()` |
| `<Link to="/users/123">Profile</Link>` | `PyreonLink("/users/123") { navigate -> ... }` |
| `useNavigate()` | `useNavigate()` |
| `useParams()` | `useParams()` |
| `useLoaderData<T>()` | `useLoaderData()` |
| `router.push(path)` | `router.push(path)` |
| `router.replace(path)` | `router.replace(path)` |
| `router.back()` / `.forward()` | `router.back()` / `.forward()` |
| `router.currentRoute().path` | `router.currentPath` |
| a `loader:` on a route | `PyreonRouteLoader` wrapping the route's Composable |
| inbound app/universal links | `PyreonDeepLink.receive(_:)` |

## Usage

```kotlin
import com.pyreon.router.*

val routes = listOf(
    RouteRecord(
        path = "/app",
        children = listOf(
            RouteRecord(path = "/app/dashboard") { Dashboard() },
            RouteRecord(path = "/app/profile/:id") { Profile() },
        ),
    ) { AppLayout() },
)

@Composable
fun RootView() {
    val router = remember { PyreonRouter(routes = routes) }
    RouterProvider(router) {
        RouterView()   // renders the matched leaf; a nested RouterView() inside
    }                  // AppLayout() picks up the matched child automatically
}

@Composable
fun AppLayout() {
    Column {
        Text("App shell")
        RouterView()
    }
}
```

## Why caller-wraps-clickable for `PyreonLink`?

Compose's foundation-vs-material split makes the cross-platform-parity choice harder than on web (`<a>`) or iOS (`Button`) — Compose has *several* clickable wrappers depending on which Material flavour a host app uses. Pulling `androidx.compose.material:material` into this package would force every consumer onto Material 2 and prevent typechecking against the minimal kotlinc stubs (no Android SDK install required). `PyreonLink(to) { navigate -> content() }` keeps the package free of `material*` deps — the host wraps `navigate` in whatever clickable surface it already uses:

```kotlin
// Foundation
PyreonLink("/users/123") { navigate ->
    Box(Modifier.clickable { navigate() }) { Text("View Profile") }
}

// Material
PyreonLink("/users/123") { navigate ->
    Button(onClick = navigate) { Text("View Profile") }
}
```

## Implementation note: no AndroidX Navigation dependency

`PyreonRouter` keeps its own `MutableState<List<String>>` stack rather than wrapping AndroidX Navigation's `NavController`, for two reasons: it keeps the model symmetric with the web router's reactive path array and the Swift router's `@Observable` one, and it means this package typechecks without an Android SDK install (`kotlinc` against minimal Compose stubs is enough). An app that wants full `NavHost` integration (predictive back, shared-element transitions, type-safe routes) wraps `RouterProvider`'s content with its own `NavHost` reading from `router.path.value`.

## Cross-platform source

The PMTC compiler's canonical-primitive emit table targets this package's symbols — the intent is that the same `.tsx` compiles to this runtime on Android and to [`@pyreon/native-router-swift`](../router-swift/) on iOS:

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

Requires `kotlinc` on `PATH` (Kotlin 2.0+). Optionally a JRE for the smoke runner. Typechecks against minimal Compose stubs — no Android SDK install needed.

```bash
cd packages/native/router-kotlin
bun run test
```

The npm scripts gracefully skip when `kotlinc` isn't on `PATH`, so `bun run --filter='*' test` from the repo root doesn't break on cross-platform setups. Same pattern as `@pyreon/native-runtime-kotlin`.

## What to read next

- [Native Packages](https://pyreon.dev/docs/native-packages) — this package's place among the other five, plus a router usage example next to the Swift twin.
- [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) — the compiler that emits code against this runtime.
