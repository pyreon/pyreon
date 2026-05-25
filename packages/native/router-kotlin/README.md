# @pyreon/native-router-kotlin

> **PRIVATE / EXPERIMENTAL.** Kotlin runtime implementing [`@pyreon/router`](../../core/router/)'s API surface on top of Compose state primitives. Phase C2 of the PMTC multiplatform router story. Parallel to [`@pyreon/native-router-swift`](../router-swift/).

## What lives here

5 Kotlin sources under `src/main/kotlin/com/pyreon/router/`:

| File | Purpose | Status |
|---|---|---|
| `PyreonRouter.kt` | Router model — `MutableState<List<String>>` path stack + push/replace/back/reset/params reactivity. | **Real** |
| `RouterProvider.kt` | `@Composable` container — exposes router via `LocalPyreonRouter` `CompositionLocal`. | **Real** |
| `RouterView.kt` | `@Composable` placeholder — host wires per-path content via `when(router.currentPath)` for now. | Scaffold |
| `Link.kt` | `PyreonLink(to) { navigate -> ... }` — exposes navigate action to caller-supplied clickable wrapper. | **Real** |
| `Hooks.kt` | `useNavigate()` / `useParams()` — `@Composable` programmatic navigation + param reading. | **Real** |

The compiler-emitted Kotlin (post-Phase-C3 follow-up) references these symbols 1:1 from a JSX source. Today, hand-written Compose code can already use them — same API the web side ships, different runtime under it.

## API parity with `@pyreon/router`

Same surface the web router exposes, mapped to Compose state + CompositionLocal:

| Web (`@pyreon/router`) | Android (this package) |
|---|---|
| `createRouter({ routes })` | `PyreonRouter()` |
| `<RouterProvider router={router}>` | `RouterProvider(router) { ... }` |
| `<RouterView />` | `RouterView()` |
| `<Link to="/users/123">Profile</Link>` | `PyreonLink("/users/123") { navigate -> ... }` |
| `useNavigate()` | `useNavigate()` |
| `useParams()` | `useParams()` |
| `router.push(path)` | `router.push(path)` |
| `router.replace(path)` | `router.replace(path)` |
| `router.back()` | `router.back()` |
| `router.currentRoute().path` | `router.currentPath` |

## Cross-platform source

Same `.tsx` source, three targets. The PMTC compiler emits matching Swift / Kotlin from a JSX source:

```tsx
import { RouterProvider, RouterView, Link, useNavigate } from '@pyreon/router'
import { Stack, Button, Text } from '@pyreon/primitives'

function App() {
  const router = createRouter()
  return (
    <RouterProvider router={router}>
      <Stack>
        <Link to="/users/123"><Text>View Profile</Text></Link>
        <RouterView />
      </Stack>
    </RouterProvider>
  )
}
```

- **Web** target → real `@pyreon/router` runtime (History API)
- **iOS** target → `@pyreon/native-router-swift` wrapping `NavigationStack`
- **Android** target → this package, host wraps content in their preferred clickable (foundation `Modifier.clickable`, Material `Surface`, Material3 `Button`)

## Why caller-wraps-clickable for `PyreonLink`?

Compose's foundation-vs-material split makes the cross-platform-parity choice harder than on web/iOS. HTML has `<a>`; SwiftUI has `Button`; Compose has *several* clickable wrappers depending on the Material flavour — pulling `androidx.compose.material:material` into this package would force every consumer onto Material 2, AND would prevent typechecking against the minimal kotlinc stubs (no Android-SDK install required).

The current shape — `PyreonLink(to) { navigate -> content() }` — keeps the package free of `material*` deps. The Material-wrapped ergonomic surface (`PyreonLink(to) { content() }` that auto-wraps in a Material `Surface`) lives in a follow-up `@pyreon/native-router-kotlin-material` extension module when real apps need it.

## Implementation note: no AndroidX Navigation dependency

PyreonRouter keeps its own `MutableState<List<String>>` stack rather than wrapping AndroidX Navigation's `NavController`. Two reasons:

1. **PARITY** — the web router carries a plain reactive path-array; the Swift router carries an `@Observable` path-array. Keeping the Kotlin side symmetric makes the cross-platform reasoning trivial.
2. **NO ANDROID-SDK DEPENDENCY** — the package intentionally doesn't depend on AndroidX so it typechecks without an Android SDK install (`kotlinc` against minimal Compose stubs is enough).

Apps that want full `NavHost` integration (back-handler, animations, type-safe routes) wrap `RouterProvider`'s content with their own `NavHost` reading from `router.path.value`. Phase C3+ may add a Compose-Navigation adapter when real apps need it.

## Smoke tests

`src/test/kotlin/com/pyreon/router/PyreonRouterTest.kt` exercises every imperative method on the model — push / replace / back / reset / params reactivity. Composable-level rendering tests defer to per-feature PRs once route handling lands.

## Build / test locally

Requires Kotlin compiler (`kotlinc`) and optionally Java JRE for the smoke runner. The verification harness uses `kotlinc` against minimal Compose stubs — no Android SDK install needed.

```bash
cd packages/native/router-kotlin
bun scripts/verify-kotlin.ts
# → [verify-kotlin] ✓ PyreonRouter + test smoke typecheck against stubs
# → [verify-kotlin] smoke output: ✓ fresh router starts with empty stack
#                                 ✓ push appends to stack
#                                 ... (9 tests)
```

The npm scripts gracefully skip when `kotlinc` isn't on PATH (CI runners without the Kotlin toolchain, etc.), so `bun run --filter='*' test` from repo root doesn't break on cross-platform setups. Same pattern as `@pyreon/native-runtime-kotlin`.

## What's NOT in Phase C2

- **Route definitions** — the `routes: [...]` array the web side passes to `createRouter()`. Phase C3 follow-up.
- **Loaders / guards / view-transition opt-in / active-link styling / prefetch hints** — staged for when TodoMVC + counter examples surface concrete needs.
- **`<RouterView />` REAL per-path rendering** — Phase C2 ships as placeholder; host wires per-path content via `when(router.currentPath)` until Phase C3 adds the route-definition table.
- **AndroidX Navigation adapter** — see "No AndroidX Navigation dependency" above.
- **Material-wrapped `PyreonLink`** — see "Why caller-wraps-clickable" above.
- **PMTC compiler-emit integration** — symbols exist + are reachable, but the canonical-primitive emit table extension to recognise `<RouterProvider>` etc. lives in a separate follow-up PR.

## Why so small (~200 LOC of Kotlin)

Same reasoning as `@pyreon/native-router-swift`: Compose's state primitives + CompositionLocal ARE the routing primitives. This package is the small adapter layer that matches @pyreon/router's component vocabulary — not a reimplementation. Past ~500 LOC the design is wrong.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
