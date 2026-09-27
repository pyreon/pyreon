---
title: Native Packages
description: The six published packages behind PMTC — the compiler, its CLI, and the four Swift/Kotlin runtimes that emitted code links against.
---

The multiplatform story is told from the app's side in [Multi-Platform (PMTC)](/docs/multiplatform). This page is the other side: the **six packages** that story runs on. All six are published to npm; none of them had a page until now, which made them hard to reason about when one showed up in a lockfile or an error message.

:::warning{title="Experimental"}
Every one of these ships with `PRIVATE / EXPERIMENTAL` in its npm description. They are published because the toolchain needs to resolve them — a scaffolded app installs them like any other dependency — not because their APIs are settled. Treat them as internals of the PMTC toolchain rather than libraries to build against directly.
:::

## The six

| Package | Language | What it is |
| --- | --- | --- |
| [`@pyreon/native-compiler`](/docs/multiplatform) | TypeScript | **PMTC** itself. Transforms Pyreon JSX into Swift (SwiftUI) and Kotlin (Jetpack Compose). |
| `@pyreon/native-cli` | TypeScript | The `pyreon-native` binary — walks a source directory and drives the compiler, plus the `check` / `assets` / `stage-web` / `wire` support commands. |
| `@pyreon/native-runtime-swift` | **Swift source** | The CORE Swift package emitted code links against on iOS — reactivity/design-token/style-modifier scaffolding, an HTTP client, a JSON bridge for `<WebView>`, and the native charts engine + canvas renderer. |
| `@pyreon/native-router-swift` | **Swift source** | `@pyreon/router`'s API surface on iOS, on top of SwiftUI's `NavigationStack` — route table (incl. nested layouts + guards), `useNavigate`/`useParams`/`useLoaderData`, per-route loaders, and inbound deep links. |
| `@pyreon/native-runtime-kotlin` | **Kotlin source** | The Android twin of `native-runtime-swift` — same scope (reactivity/tokens/style-modifier scaffolding, HTTP via OkHttp, JSON, the same charts port), plus the dependency-free key/value storage backend layer Android needs and doesn't have a platform default for. |
| `@pyreon/native-router-kotlin` | **Kotlin source** | The Android twin of `native-router-swift`, on Compose state + `CompositionLocal` — same route table, hooks, loaders, and deep-link surface. |

:::note{title="These two packages are the CORE runtime only"}
`native-runtime-swift`/`-kotlin` are small on purpose — SwiftUI's `@State` and Compose's `mutableStateOf` already ARE the reactive primitives Pyreon compiles onto, so there's no separate observable layer to ship. Everything feature-specific (`useStorage`, `useSecureStorage`, `useFieldArray`, `useDatabase`, camera/geolocation/bluetooth/…, `<Flow>`, `<Table>`, sync/CRDT) lives **inside the fundamentals package that owns it** — `packages/fundamentals/storage/native/swift/`, `packages/fundamentals/hooks/native/kotlin/`, and so on — not inside these two packages. See "Why four of them ship source" below for how those co-located directories reach a build.
:::

## Why four of them ship source

The runtime and router packages contain **no JavaScript at all**. `native-runtime-swift` ships `Package.swift` and `Sources/`; `native-runtime-kotlin` ships `src/`. There is no `lib/`, no `main`, nothing a bundler could resolve.

That is deliberate, and it is why they are on npm rather than in SwiftPM's registry or Maven Central. A multiplatform Pyreon app is a **JavaScript project first** — its dependency graph, its lockfile and its version resolution all live in `package.json`. Publishing the Swift and Kotlin sources through the same channel means one `bun install` puts every platform's runtime at a known, version-locked path, instead of asking you to keep three package managers in agreement about which version of Pyreon you are on.

The consequence is that the platform build tools consume them **from `node_modules` by path**, not as registry dependencies — and both the PMTC emit header (`import PyreonRuntime` / `import PyreonRouter` on Swift, `com.pyreon.runtime.*` / `com.pyreon.router.*` on Kotlin) and every co-located feature `native/swift`/`native/kotlin` directory need a constant path to that install, even though the actual `node_modules` layout varies with hoisting and the package manager.

A fixed `../node_modules/@pyreon/native-runtime-swift` path (what an unhoisted, single-package install produces) only works in that one layout. Under a monorepo, pnpm's non-flat `node_modules`, or a workspace that hoists dependencies up a level, the package lives somewhere else entirely — and XcodeGen fails the spec outright with `Invalid local package`. `pyreon-native wire` exists to resolve that gap at build time, and the scaffolded project consumes its output rather than a hardcoded path.

### iOS — resolved symlinks, staged sources

The pre-build script a scaffolded `ios/project.yml` runs on every build includes:

```bash
npx pyreon-native wire --ios-out="${PROJECT_DIR}/ios"
```

`wire --ios-out` writes into two directories the Xcode project references by a FIXED relative path, regenerated on every build so a moved package can't go stale:

- **`ios/PyreonPackages/`** — a symlink per base runtime package (`native-runtime-swift`, `native-router-swift`), pointing at wherever the install actually resolved it. `project.yml`'s `packages:` block references the link, never the real path:
  ```yaml
  packages:
    PyreonRuntime:
      path: PyreonPackages/native-runtime-swift
    PyreonRouter:
      path: PyreonPackages/native-router-swift
  ```
  A symlink rather than a copy — an SPM package is a build input Xcode resolves and builds in place, so copying it would duplicate the whole package per app and break incremental builds.
- **`ios/PyreonNative/`** — every co-located feature `native/swift/` directory (no `Package.swift` of its own, so it can't be a local SPM package) COPIED in and compiled straight into the app target, referenced in `project.yml`'s `sources:` as one `optional: true` group.

Both directories are `.gitignore`d — they're derived from `node_modules`, so committing them pins one machine's install layout into the repo.

### Android — a generated `srcDir` list

The equivalent Android step:

```bash
npx pyreon-native wire --app="${PROJECT_DIR}" --android-out="${PROJECT_DIR}/android/app/pyreon-native.srcdirs"
```

`--android-out` writes a plain newline-separated list of absolute, already-resolved Kotlin source directories — the base runtime, the router, and every co-located feature `native/kotlin/` directory, in dependency order, deduplicated. `android/app/build.gradle.kts` reads it at Gradle **configure** time and falls back to the fixed `node_modules` paths only when the file doesn't exist yet (a flat install, or before `wire` has run once):

```kotlin
sourceSets {
    getByName("main") {
        kotlin {
            val resolved = file("pyreon-native.srcdirs")
                .takeIf { it.exists() }
                ?.readLines()
                ?.filter { it.isNotEmpty() && !it.startsWith("#") }
                ?: emptyList()
            if (resolved.isNotEmpty()) {
                resolved.forEach { srcDir(it) }
            } else {
                // Fallback — flat layout, or `wire` hasn't run yet.
                srcDir("../../node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin")
                srcDir("../../node_modules/@pyreon/native-router-kotlin/src/main/kotlin")
            }
        }
    }
}
```

Kotlin aggregates any number of `srcDir`s into one compilation, so — unlike iOS, where a co-located feature directory needs its OWN staging step because it can't be an SPM package — every Kotlin source root, base or co-located, is just another `srcDir` on the same list.

:::note{title="`pyreon-native wire` computes this list for you"}
The set of source roots grows as you use more libraries — each fundamentals package that crosses to native contributes its own `native/kotlin/` directory. `pyreon-native wire` resolves them in dependency order, deduplicated, and can write the Android list to a file for Gradle to read. Hand-maintaining that list is how a co-located runtime goes missing and the app fails to compile with an unresolved reference.
:::

## The router packages, hand-written

Compiler emit is the primary consumer, but `native-router-swift` / `native-router-kotlin` are ordinary Swift/Kotlin — nothing stops you from importing `PyreonRouter`/`PyreonRoute*` directly, e.g. while prototyping a screen before the matching `.tsx` source exists. Both platforms share one shape: `RouteRecord` (path pattern + component factory, optionally nested `children` for layouts, optionally a `beforeEnter` guard), wired through `RouterProvider` + `RouterView`.

```swift
// iOS — Sources/…, import PyreonRuntime, PyreonRouter
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
            RouterView()          // renders the matched leaf; nested RouterView() inside
        }                          // AppLayout() picks up the child automatically
    }
}
```

```kotlin
// Android — import com.pyreon.router.*
val routes = listOf(
    RouteRecord(path = "/app", children = listOf(
        RouteRecord(path = "/app/dashboard") { Dashboard() },
        RouteRecord(path = "/app/profile/:id") { Profile() },
    )) { AppLayout() },
)

@Composable
fun RootView() {
    val router = remember { PyreonRouter(routes = routes) }
    RouterProvider(router) { RouterView() }
}
```

`useNavigate()` / `useParams()` / `useLoaderData<T>()` read from the same `PyreonRouter` via `@Environment(\.pyreonRouter)` (iOS) or `LocalPyreonRouter` (Android); `PyreonLink("/app/profile/42") { … }` pushes on tap. Both platforms also accept inbound deep links through a process-wide `PyreonDeepLink.receive(url)` (Swift) / `PyreonDeepLink.receive(uri)` (Kotlin) — call it from `onOpenURL` / `application(_:open:options:)` on iOS, from the launch `Intent` and `onNewIntent` on Android — so a universal link, app link, or notification tap can open the app directly at a route. Both a cold launch (no router constructed yet — the path is held and consumed by the next one) and a warm hand-off (a router already exists) are handled.

## `pyreon-native` — the CLI

```text
pyreon-native build     --target=<ios|android|all> --source=<dir> --out=<dir>
pyreon-native check     [--target=<ios|android>] [--typecheck] [--watch] [--json] --source=<file|dir>
pyreon-native check     --lsp
pyreon-native assets    --target=<ios|android|web> --source=<dir> --out=<dir>
pyreon-native stage-web --target=<ios|android> --source=<dir> --out=<dir>
pyreon-native wire      [--app=<dir>] [--android-out=<file>] [--json]
```

| Command | Does |
| --- | --- |
| `build` | Compiles a source tree to Swift and/or Kotlin, writing files. |
| `check` | The **authoring-loop** command — runs the compiler for both targets **in memory**: no build, no xcodegen, no gradle, no file writes. Reports transform errors and unsupported-TypeScript-subset warnings per file. |
| `assets` | Materializes bundled images and fonts into the platform's expected layout. |
| `stage-web` | Stages a web bundle for the [WebView host](/docs/multiplatform). |
| `wire` | Resolves the native source roots an app needs (see above). |

Exit codes: `0` success, `1` usage error, `2` a compiler error on a source file.

### `check` is the one to reach for

`build` needs somewhere to write and is bound to a platform toolchain. `check` needs neither, which makes it the fast inner loop: it answers "does this file lower to both targets, and what does it warn about?" without leaving the editor.

`--typecheck` additionally runs `swiftc -typecheck` over the Swift emit, catching what the transform cannot — a lowering that is syntactically fine and does not compile. `--lsp` runs the same thing as a stdio LSP server, so the warnings arrive as editor diagnostics instead of terminal output.

## What to read next

- [Multi-Platform (PMTC)](/docs/multiplatform) — the architecture, the primitive vocabulary, the capability matrix.
- [PMTC Supported TypeScript](/docs/pmtc-supported-typescript) — the subset the compiler lowers, and what it refuses.
- [PMTC Library Status & Authoring](/docs/multiplatform-libraries) — which `@pyreon/*` packages cross to native, and how a package declares that it does.
- [PMTC Per-Target Setup](/docs/pmtc-per-target-setup) — the Xcode and Gradle side in full.
- [Create Multi-Platform](/docs/create-multiplatform) — the scaffolder that wires all of the above.
