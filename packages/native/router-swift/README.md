# @pyreon/native-router-swift

> **PRIVATE / EXPERIMENTAL.** SwiftPM package implementing [`@pyreon/router`](../../core/router/)'s API surface on top of SwiftUI's `NavigationStack`. Phase C1 of the PMTC multiplatform router story.

## What lives here

Five Swift source files under `Sources/PyreonRouter/`:

| File                   | Purpose                                                                                                       | Status   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| `PyreonRouter.swift`   | `@Observable` router instance — `path` stack, `push` / `replace` / `back` / `reset`, `params` dictionary.     | **Real** |
| `RouterProvider.swift` | Top-level container — wraps `NavigationStack(path:)` + exposes the router via `@Environment(\.pyreonRouter)`. | **Real** |
| `RouterView.swift`     | Active-route view placeholder — SCAFFOLD (host wires per-path content via `.navigationDestination(for:)`).    | Scaffold |
| `Link.swift`           | `PyreonLink("/path") { Text("Label") }` — declarative navigation matching `<Link to="/path">Label</Link>`.    | **Real** |
| `Hooks.swift`          | `useNavigate(router:)` / `useParams(router:)` — programmatic navigation + param-reading.                      | **Real** |

The compiler-emitted Swift (post-Phase-C2 follow-up) references these symbols 1:1 from a JSX source. Today, hand-written iOS code can already use them — same API the web side ships, different runtime under it.

## API parity with `@pyreon/router`

Same surface the web router exposes, mapped to SwiftUI's NavigationStack model:

| Web (`@pyreon/router`)                 | iOS (this package)                             |
| -------------------------------------- | ---------------------------------------------- |
| `createRouter({ routes })`             | `PyreonRouter()`                               |
| `<RouterProvider router={router}>`     | `RouterProvider(router: router) { ... }`       |
| `<RouterView />`                       | `RouterView()`                                 |
| `<Link to="/users/123">Profile</Link>` | `PyreonLink("/users/123") { Text("Profile") }` |
| `useNavigate()`                        | `useNavigate(router:)`                         |
| `useParams()`                          | `useParams(router:)`                           |
| `router.push(path)`                    | `router.push(path)`                            |
| `router.replace(path)`                 | `router.replace(path)`                         |
| `router.back()`                        | `router.back()`                                |
| `router.currentRoute().path`           | `router.currentPath`                           |

## Cross-platform source

Same `.tsx` source, two targets. The PMTC compiler emits matching Swift / Kotlin from a JSX source:

```tsx
import { RouterProvider, RouterView, Link, useNavigate } from '@pyreon/router'
import { Stack, Button, Text } from '@pyreon/primitives'

function App() {
  const router = createRouter()
  return (
    <RouterProvider router={router}>
      <Stack>
        <Link to="/users/123">
          <Text>View Profile</Text>
        </Link>
        <RouterView />
      </Stack>
    </RouterProvider>
  )
}
```

Web target: real `@pyreon/router` runtime (History API). iOS target: this package wrapping `NavigationStack`. Android target: `@pyreon/native-router-kotlin` wrapping AndroidX Navigation `NavHost` (Phase C2).

## Smoke tests

`Tests/PyreonRouterTests/PyreonRouterTests.swift` exercises every public symbol on the imperative router model — push / replace / back / reset / params / useNavigate / useParams. Pure-model tests; View-level rendering tests defer to per-feature PRs.

## Build / test locally

Requires macOS with Xcode 15+ (Swift 5.9, iOS 17 target).

```bash
cd packages/native/router-swift
swift build
swift test
```

The npm scripts gracefully skip when `swift` isn't on PATH (Linux dev machines, CI runners without the Swift toolchain), so `bun run --filter='*' test` from the repo root doesn't break on cross-platform setups.

## What's NOT in this Phase C1

- **Route definitions** — the `routes: [...]` array config the web side passes to `createRouter()`. Phase C2 follow-up adds declarative route definitions matching the web side's shape so the SAME source compiles to both targets.
- **Loaders / guards** — server-side data fetching + per-route auth guards. The web side has full support; iOS-side scaffolding lands when the TodoMVC + counter examples surface concrete needs.
- **`<RouterView />` real rendering** — Phase C1 ships it as a placeholder. The host's `.navigationDestination(for:)` is currently the source of truth for per-path content. Phase C2 wires it up via the route-definition table.
- **Active-link styling / prefetch hints / view-transition opt-in** — staged for later. SwiftUI's `NavigationStack` handles base transitions automatically.
- **Compiler emit integration** — the symbols this package exports are referenced 1:1 by the PMTC compiler-emit table, but the compiler doesn't yet recognise `<RouterProvider>` etc. as canonical. Wiring lives in a separate PR alongside the canonical-primitive emit table extension.

## Why so empty?

Same reasoning as [`@pyreon/native-runtime-swift`](../runtime-swift/README.md):

> SwiftUI's `NavigationStack` IS the routing primitive on iOS 16+. This package is the small adapter layer that matches @pyreon/router's component vocabulary so the SAME source compiles to web (history API) AND iOS (NavigationStack).

Current size: ~250 LOC. Phase 0 risk register flag: past ~500 LOC the design is wrong.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
