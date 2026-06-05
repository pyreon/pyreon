---
title: Multi-Platform Libraries — status, plan, and how to author
---

# Multi-Platform Libraries — status, plan, and how to author

> **The 100% same-code promise** in Pyreon means: **the source you write is byte-identical on web + iOS + Android**. Implementation under the API can differ per target. This is the same shape React Native uses for `AsyncStorage` / `NetInfo` / etc., and the same shape Kotlin Multiplatform uses for its `expect`/`actual` declarations.
>
> What it does **not** mean: arbitrary npm packages work on native. That requires an embedded JavaScript engine (the React Native path) and ships a different trade-off.

## The honest constraint

Pyreon's PMTC (Pyreon Multi-Target Compiler) emits real Swift / Kotlin from `.tsx` source. There's no JavaScript runtime on the iOS / Android binary — the app IS native. This means:

- **Anything the compiler understands** → 100% same code across all 3 targets.
- **Anything that's a Pyreon-blessed cross-target service** (`@pyreon/storage`, `@pyreon/router`) → 100% same code, different impl under the hood.
- **Arbitrary npm packages** (TanStack Query, ECharts, CodeMirror, pragmatic-drag-and-drop) → **do not run on native**. They assume a JS runtime that doesn't exist.

For ecosystem growth, **a library wants to be in the first two buckets**, not the third.

## Package-by-package status

The audit below classifies every Pyreon package into four tiers. **Tier 1 + 2 = 100% same code today.** Tier 3 is on the roadmap. Tier 4 is the Layer-4 escape-hatch zone (`<Web>` / `<NativeIOS>` / `<NativeAndroid>` per-target code).

### Tier 1 — works on all 3 targets TODAY

The source you write is identical across targets. PMTC compiles it; native runtime ports provide the implementation.

| Package | What it provides | Native runtime |
|---|---|---|
| `@pyreon/reactivity` | `signal`, `computed`, `effect`, `batch`, `onCleanup`, `untrack` | `PyreonReactivity` Swift + Kotlin |
| `@pyreon/core` | JSX runtime, `<For>`, `<Show>`, `<Match>`, `<Switch>`, `<Suspense>`, `<ErrorBoundary>`, `<Dynamic>`, `<Portal>` | PMTC native emit |
| `@pyreon/primitives` | 15 canonical UI primitives — `<Stack>`, `<Inline>`, `<Text>`, `<Button>`, `<Field>`, `<Toggle>`, etc. | Web DOM + PMTC → SwiftUI / Compose |
| `@pyreon/router` | `createRouter`, `useNavigate`, `useParams`, `useLoaderData` (read), `<RouterProvider>`, `<RouterView>`, `<Link>` | `@pyreon/native-router-{swift,kotlin}` |
| `@pyreon/storage` | `useStorage`, `useSessionStorage`, `useCookie`, `useIndexedDB` (subset) | `@PyreonAppStorage` (Swift) + `rememberPyreonStorage` (Kotlin) |

**Real-world proof**: `examples/native-todomvc-{web,ios,android}` shares ONE `App.tsx` source across all 3 targets. The shared source uses `signal`, `useStorage`, `<Stack>`, `<Inline>`, `<Field>`, `<Toggle>`, `<Button>`, `<For>`, `<Show>` — and renders idiomatically on every target.

### Tier 2 — pure-logic packages (partially verified, blocked on PMTC namespace recognition)

The original audit theory: each Tier-2 package is signal-driven business logic with no DOM dependency, so PMTC should compile each cleanly — verifying it is just mechanical fixture work.

**The Tier-2 verification sweep refuted that theory.** PRs [#1317](https://github.com/pyreon/pyreon/pull/1317) (rx) and [#1319](https://github.com/pyreon/pyreon/pull/1319) (machine) shipped fixtures + bisect-verified tests that surface two distinct PMTC bug patterns common to every namespaced Pyreon package:

#### Pattern A — silent-drop (rx)

PMTC sees `rx.filter(todos, fn)` as a `CallExpression` whose callee is a `MemberExpression` (`rx.filter`), not a recognised top-level identifier. The unknown call is **dropped entirely from emit** with no warning. Bisect-locked by [`tier2-rx-silent-drop.test.ts`](https://github.com/pyreon/pyreon/blob/main/packages/native/compiler/src/tests/tier2-rx-silent-drop.test.ts).

#### Pattern B — structurally-broken (machine)

PMTC sees `createMachine(...)` as a `CallExpression` to a non-recognised callee. The binding (`var m`) drops, but the method-call sites (`m.send(...)` / `m.matches(...)`) survive into Swift/Kotlin function bodies — producing emit that references an **undefined** `m`, a hard `swiftc` / `kotlinc` error rather than a silent drop. Bisect-locked by [`tier2-machine-emit-broken.test.ts`](https://github.com/pyreon/pyreon/blob/main/packages/native/compiler/src/tests/tier2-machine-emit-broken.test.ts).

#### Root cause + implication

Both patterns trace to **one root cause**: PMTC's recognition list in [`parse.ts`](https://github.com/pyreon/pyreon/blob/main/packages/native/compiler/src/parse.ts) is hardcoded to ~6 hooks (`signal` / `computed` / `effect` / `useStorage` / `useNavigate` / `useParams` / `useLoaderData`) and the 15 canonical primitives. Every other `@pyreon/*` package falls into Pattern A or B. **Continuing the per-package fixture sweep without first closing the recognition gap yields the same finding 8 more times.**

#### Verified status by package

| Package | Pattern | Verification PR | Strategy (see spec below) |
|---|---|---|---|
| `@pyreon/rx` | A — silent-drop | [#1317](https://github.com/pyreon/pyreon/pull/1317) | Per-method lowering to native collection ops |
| `@pyreon/machine` | B — structurally-broken | [#1319](https://github.com/pyreon/pyreon/pull/1319) | Runtime port (`PyreonMachine`) + binding recognition |
| `@pyreon/store` | B (expected) | — | Runtime port + binding recognition (same shape as machine) |
| `@pyreon/state-tree` | B (expected) | — | Same shape as store |
| `@pyreon/permissions` | partially A | — | `usePermissions` already recognised; `.can(...)` calls need lowering |
| `@pyreon/validation` | A (expected) | — | Per-validator lowering (Zod/Valibot/ArkType each different) |
| `@pyreon/validate` | A (expected) | — | Same as validation |
| `@pyreon/i18n/core` | B (expected) | — | Runtime port + `t(...)` call lowering |
| `@pyreon/feature` | composite | — | Blocked on every dependency below |

**Not "unverified" any more — verified-as-broken until the spec below lands.**

> `@pyreon/sized-map` was [reclassified out of Tier 2](https://github.com/pyreon/pyreon/pull/1317) — it's a generic `Map<K, V>` wrapper used internally by `@pyreon/runtime-dom`'s template cache and `@pyreon/lint`'s AST cache, never in user component code. PMTC compiles `.tsx` component bodies, not standalone classes; sized-map sits outside the multiplatform user-code surface.

### PMTC namespace recognition — spec for closing the gap

This section proposes the architectural fix. It's the unblock for all 10 Tier-2 packages.

#### Two lowering strategies (pick per namespace)

| Strategy | When to use | Cost | Examples |
|---|---|---|---|
| **A — Native-collection lowering** | Pure transforms on signal-carried collections / values; semantics map 1:1 to a native primitive | Low (compile-only) | `rx.filter` → Swift `.filter { }` / Kotlin `.filter { }`; `rx.count` → `.count`; `rx.map` → `.map { }` |
| **B — Runtime port + binding recognition** | The library carries state OR has non-trivial semantics that don't reduce to a native primitive | Higher (runtime impl + binding type) | `machine` → `PyreonMachine` Swift+Kotlin class; `store` → `PyreonStore`; `i18n` → `PyreonI18n` |

#### Strategy A worked example — `@pyreon/rx`

Source PMTC must accept:

```tsx
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

const todos = signal<Todo[]>([])
const active = rx.filter(todos, t => !t.done)
const top5 = rx.take(active, 5)
const activeCount = rx.count(active)
const avgPriority = rx.average(rx.map(active, t => t.priority))
```

**Target Swift emit** (verified clean against `swiftc -parse` — see "Compileability proof" below):

```swift
struct RxProbe: View {
    @State private var todos: [Todo] = []
    private var active: [Todo] { todos.filter { !$0.done } }
    private var top5: [Todo] { Array(active.prefix(5)) }
    private var activeCount: Int { active.count }
    private var avgPriority: Double {
        let xs = active.map { $0.priority }
        return xs.isEmpty ? 0 : Double(xs.reduce(0, +)) / Double(xs.count)
    }
    var body: some View { /* ... */ }
}
```

**Target Kotlin emit** (verified clean against `kotlinc` with Compose stubs — see "Compileability proof"):

```kotlin
@Composable
fun RxProbe() {
    val todos by remember { mutableStateOf<List<Todo>>(emptyList()) }
    val active by remember { derivedStateOf { todos.filter { !it.done } } }
    val top5 by remember { derivedStateOf { active.take(5) } }
    val activeCount by remember { derivedStateOf { active.size } }
    val avgPriority by remember {
        derivedStateOf {
            val xs = active.map { it.priority }
            if (xs.isEmpty()) 0.0 else xs.sum().toDouble() / xs.size
        }
    }
}
```

**Per-method lowering table** (proposed; one row per common rx function):

| rx function | Swift lowering | Kotlin lowering |
|---|---|---|
| `rx.filter(s, p)` | `s.filter { p }` | `s.filter { p }` |
| `rx.map(s, f)` | `s.map { f }` | `s.map { f }` |
| `rx.sortBy(s, k)` | `s.sorted { a, b in a.k < b.k }` | `s.sortedBy { it.k }` |
| `rx.take(s, n)` | `Array(s.prefix(n))` | `s.take(n)` |
| `rx.skip(s, n)` | `Array(s.dropFirst(n))` | `s.drop(n)` |
| `rx.count(s)` | `s.count` | `s.size` |
| `rx.sum(s)` | `s.reduce(0, +)` | `s.sum()` |
| `rx.average(s)` | `s.isEmpty ? 0 : Double(s.reduce(0, +)) / Double(s.count)` | `if (s.isEmpty()) 0.0 else s.sum().toDouble() / s.size` |
| `rx.some(s, p)` | `s.contains(where: { p })` | `s.any { p }` |
| `rx.every(s, p)` | `s.allSatisfy { p }` | `s.all { p }` |
| `rx.find(s, p)` | `s.first(where: { p })` | `s.find { p }` |
| `rx.unique(s)` | (needs `Hashable` — emit `Array(Set(s))`) | `s.distinct()` |
| `rx.reverse(s)` | `s.reversed()` | `s.reversed()` |

(`debounce` / `throttle` / `pipe` / `combine` / `zip` / `merge` need Strategy B — they carry state / scheduling.)

#### Strategy B worked example — `@pyreon/machine`

Source PMTC must accept:

```tsx
import { createMachine } from '@pyreon/machine'

const m = createMachine({
  initial: 'idle',
  states: { idle: { on: { FETCH: 'loading' } }, loading: {...} },
})
const start = () => m.send('FETCH')
const isLoading = () => m.matches('loading')
```

Required deliverables to land this:

1. **Swift runtime**: `PyreonMachine` class in `packages/native/runtime-swift/Sources/PyreonRuntime/`, exposing `init(initial:transitions:)` + `send(_ event: String)` + `matches(_ state: String) -> Bool`.
2. **Kotlin runtime**: `PyreonMachine` class in `packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/`, same surface.
3. **PMTC change**: `parse.ts` recognises `createMachine` calleeName → emits new `DeclIR` kind `machine` → `emit-swift.ts` / `emit-kotlin.ts` emit `let m = PyreonMachine(initial: "idle", transitions: ...)` / `val m = remember { PyreonMachine(...) }`.

Target emit shape:

```swift
@State private var m = PyreonMachine(initial: "idle", transitions: [
    "idle":    ["FETCH": "loading"],
    "loading": ["SUCCESS": "done", "ERROR": "error"],
])
private func start() { m.send("FETCH") }
private func isLoading() -> Bool { m.matches("loading") }
```

#### Compileability proof

To prove these emit shapes are real native code (not a speculation), the rx Swift + Kotlin targets above were hand-written and compiled:

```bash
# Swift — parse-only typecheck
swiftc -parse RxLoweringTarget.swift  # exit 0

# Kotlin — full compile against PMTC's existing Compose stubs
kotlinc compose-stubs.kt RxLoweringTarget.kt -d out  # exit 0, warnings only
```

Both succeed. The proposed emit shapes are **compilable native code today**; the only missing piece is the PMTC parser/emitter rewrite that produces them.

#### Sequencing — the spec → ship path

| Step | Scope | Lands |
|---|---|---|
| **1.** Strategy-A unblock (`rx`) — ✅ **FULL surface shipped** ([#1326](https://github.com/pyreon/pyreon/pull/1326) + RX-2 PR) | `parse.ts` recognises `rx.METHOD` MemberExpression callees; per-target dispatch in `emit-swift.ts` + `emit-kotlin.ts`. v1 covers 21 methods: `filter` / `map` / `reverse` / `count` / `sum` / `min` / `max` / `first` / `last` / `take` / `skip` / `takeWhile` / `dropWhile` / `find` / `some` / `every` / `unique` / `compact` / `flatten` / `reduce` / `average`. | Strategy-A surface of `@pyreon/rx` promoted to Tier 1 (21 methods). Remaining: methods needing tuple/dict emit (partition / groupBy / keyBy / uniqBy / mapValues / sortBy-with-string-key / chunk / sample) — per-method follow-ups; Strategy-B methods (pipe / debounce / throttle / combine / zip / merge / scan / distinct / search) — separate workstream needing runtime ports. |
| **2.** Strategy-B unblock #1 (`machine`) | `PyreonMachine` runtime ports (Swift + Kotlin) + `parse.ts` `createMachine` recognition + new `DeclIR.machine` kind | Promotes `machine` to Tier 1; ~1-week PR |
| **3.** Strategy-B unblock #2 (`store`) | Same shape as machine — `PyreonStore` runtime ports + `defineStore` recognition | Promotes `store` to Tier 1; ~1-week PR |
| **4.** Strategy-B unblock #3 (`i18n/core`) | `PyreonI18n` runtime ports + `createI18n` recognition; `t(...)` call lowering | Promotes `i18n/core` to Tier 1; ~1-week PR |
| **5.** Composite (`feature` / `state-tree`) | Builds on steps 2-3 | Promotes `feature` / `state-tree` to Tier 1; ~1-week PR |
| **6.** Strategy-A residuals (`validation` / `validate`) | Per-validator lowering (Zod-only as proof; Valibot/ArkType as follow-ups) | Promotes a subset; multi-week |

Total ~4-6 weeks of focused PMTC work to bring all 10 Tier-2 packages into Tier 1. Tracks alongside Tier-3 work (`@pyreon/query`-native, `@pyreon/form` native, etc.); the two streams don't conflict.

### Tier 3 — needs Pyreon-blessed native impl (the Storage pattern at scale)

These have an obvious cross-target API surface but the implementation is fundamentally per-platform. Following `@pyreon/storage`'s model: one shared API, three impls.

| Package | Shared API surface | Web impl | iOS impl needed | Android impl needed |
|---|---|---|---|---|
| `@pyreon/query` | `useQuery({ queryKey, queryFn })`, `useMutation`, `useInfiniteQuery` | TanStack Query | `URLSession` + `Codable` + the cache as Swift `@Observable` | `ktor` / OkHttp + Kotlin serialization + Compose `MutableState` cache |
| `@pyreon/form` | `useForm`, `useField`, `<Form>`, `<Submit>` | Pure JS + DOM | Pure logic compiles via PMTC; `<Form>` and `<Submit>` are JSX components that PMTC needs to emit | Same |
| `@pyreon/toast` | `toast()`, `toast.success/error/etc()`, `<Toaster />` | Portal + CSS transitions | `UIAlertController` / banner overlay | Compose snackbar / banner |
| `@pyreon/hotkeys` | `useHotkey('cmd+k', handler)` | `keydown` listener | `keyboardShortcut(modifiers:)` SwiftUI view modifier | `Modifier.onKeyEvent` |
| `@pyreon/url-state` | `useUrlState(key, default)` | `URLSearchParams` + replaceState | Per-target deep-link API + path-segment state | Same |
| `@pyreon/rx` | `rx.filter`, `rx.sortBy`, `rx.take`, `rx.pipe`, `rx.average`, ... (signal-aware reactive transforms) | TS source compiles directly | Either PMTC parser learns the `rx.*` namespace (cheapest path — emits `rx.filter(s, p)` as `computed(() => s().filter(p))`) OR per-target Swift rx runtime port | Same shape for Kotlin |

Each of these is **multi-week work per package**. Same architectural shape as Storage (which already shipped).

### Tier 4 — DOM-aware hooks that need native equivalents

`@pyreon/hooks` has 34 hooks; some are pure-logic (compile to native today) and some are DOM-aware (need per-target native impls).

**Tier-1 today (pure-logic)**:
- `useToggle`, `usePrevious`, `useLatest`, `useControllableState`
- `useDebouncedValue`, `useDebouncedCallback`, `useThrottledCallback`, `useInterval`, `useTimeout`, `useTimeAgo`
- `useMergedRef`, `useUpdateEffect`

**Tier-3 needed (DOM-aware)**:
- `useEventListener` — needs per-target gesture/event abstraction
- `useClickOutside` — per-target tap-outside detection
- `useFocus`, `useHover` — per-target focus / hover state
- `useFocusTrap` — different per platform (mostly N/A on touch UIs)
- `useElementSize`, `useWindowResize` — `GeometryReader` / Compose `BoxWithConstraints`
- `useIntersection` — visibility tracking per target
- `useScrollLock` — different per platform
- `useBreakpoint`, `useMediaQuery`, `useColorScheme`, `useReducedMotion` — read from system traits (`UIScreen.traitCollection` / Compose `LocalConfiguration`)
- `useClipboard` — `UIPasteboard` / `ClipboardManager` (a `PyreonClipboard` runtime port already exists, needs hook integration)
- `useDialog` — `<dialog>` is web-only; native equivalent is `sheet(isPresented:)` / `ModalBottomSheet`
- `useKeyboard`, `useOnline` — system traits per target

Same scope as Tier 3 packages — each needs a per-target impl.

### Tier 5 — inherently web-medium-specific (Layer 4 escape hatch)

These packages target a web-only medium where the native equivalent isn't "the same library on a different runtime" but **an entirely different concept**.

| Package | Why it's web-only | Native answer |
|---|---|---|
| `@pyreon/charts` | ECharts is canvas-based JS | Swift Charts (iOS 16+); Compose-charting or MPAndroidChart |
| `@pyreon/code` | CodeMirror 6 is a web editor | iOS / Android each have different code-editor SDKs |
| `@pyreon/flow` | SVG pan/zoom + DOM | SwiftUI `Canvas` or Compose `Canvas` |
| `@pyreon/document` | pdfmake / docx / xlsx — web-native JS libs | iOS `PDFKit` / `PDFDocument`; Android `PdfDocument` |
| `@pyreon/dnd` | `@atlaskit/pragmatic-drag-and-drop` HTML5 DnD | `DragGesture` SwiftUI; Compose `Modifier.draggable` |
| `@pyreon/table` | TanStack Table — DOM measurement, web-DOM-aware | SwiftUI `Table` (limited); Compose `LazyColumn` patterns |
| `@pyreon/head` | SSR meta tags, OG / hreflang | Native apps don't have HTML `<head>`; metadata is per-platform (Info.plist on iOS, AndroidManifest on Android) |
| `@pyreon/connector-document` | Bridges `@pyreon/document` to ui-system | Inherits document's web-only constraint |
| `@pyreon/document-primitives` | Rocketstyle-wrapped doc components | Web-only |
| `@pyreon/storybook` | Story renderer | Web-only (dev tool) |
| ui-system packages (`@pyreon/elements`, `@pyreon/styler`, `@pyreon/rocketstyle`, `@pyreon/coolgrid`, `@pyreon/kinetic`, `@pyreon/unistyle`, `@pyreon/ui-core`, `@pyreon/attrs`) | Web-only by design (Layer 3b — rocketstyle/styler/unistyle stack) | Use `@pyreon/primitives` (Layer 3a) on native |

Cross-platform apps that need any of these reach for **Layer 4** — write the affected screen separately per target with `<Web>` / `<NativeIOS>` / `<NativeAndroid>` per-target JSX siblings.

## Roadmap — what it takes to reach 100% for Pyreon-authored packages

The goal: every Pyreon user-facing package is in Tier 1 or Tier 2 (or explicitly Tier 5 with a documented native answer).

| Phase | Scope | Effort |
|---|---|---|
| **Verify Tier 2** | Write PMTC integration fixtures for each of the 10 packages classified "should work, unverified." Promote those that pass into Tier 1. Document any compiler gaps that surface. | 1–3 days |
| **Ship `@pyreon/query`-native** | Cross-target API mirroring TanStack Query's surface for the common cases (`useQuery`, `useMutation`, `useInfiniteQuery`). iOS `URLSession`+`Codable`; Android `ktor`. Web continues to use TanStack under the hood. | 2–3 weeks |
| **Ship `@pyreon/form` native** | Lift pure-logic core (already mostly there); emit `<Form>` and `<Submit>` JSX components to SwiftUI / Compose native forms. | 1–2 weeks |
| **Ship `@pyreon/toast` native** | `<Toaster />` becomes `UIAlertController` overlay / Compose `Snackbar`. | 1 week |
| **Ship DOM-aware `@pyreon/hooks` natives** | The 12 hooks listed above, each as a per-target runtime impl behind the existing API. | 2–3 weeks |
| **Ship `@pyreon/hotkeys` + `@pyreon/url-state` natives** | Per-target keyboard / deep-link implementations. | 1–2 weeks |

**Total effort**: ~8–12 focused weeks of engineering to reach 100% on Pyreon-authored packages.

After all of this: a Pyreon developer can write a typical app (signal-driven UI + data fetching + forms + persistent state + routing) and the SOURCE file is byte-identical on web + iOS + Android. The runtime implementations differ, the experience is target-idiomatic, the developer experience is one-source.

## How to write a multi-target library

This section is for library authors who want to publish a Pyreon package that works on all three targets.

### Decision tree — does your library belong in Tier 1, 2, or 3?

```
Does your code touch DOM globals (document.*, window.*, addEventListener)?
├── No  → Is it pure logic on top of @pyreon/reactivity?
│         ├── Yes → TIER 2 (PMTC compiles it directly. No per-target work.)
│         └── No  → Does it need OS APIs (network / storage / sensors / OS chrome)?
│                   ├── Yes → TIER 3 (shared API + per-target runtime impl)
│                   └── No  → Probably tier 1 or 2; verify with PMTC.
└── Yes → Can the DOM concept be re-expressed at a higher abstraction?
          ├── Yes (e.g. "tap outside") → TIER 3
          └── No  (e.g. "set innerHTML") → TIER 5 (web-only by design)
```

### Tier 2 — pure-logic library authoring

If your library is signal-driven business logic with no DOM dependencies, **you don't need to do anything special**. PMTC compiles it.

**Constraints**:
- Stick to the supported TypeScript surface. See `docs/docs/pmtc-supported-typescript.md` for the exact subset (it's most of TS but excludes things like dynamic `import()` and full Proxy semantics).
- Don't import DOM globals. Use the framework's abstractions (e.g. `@pyreon/storage`, not `localStorage`).
- Don't import other npm packages with complex internals. PMTC can't see their source; they'll either fail to compile or compile to nothing useful.

**Verification**:
```bash
# Write a fixture that exercises your library
echo 'import { yourThing } from "@pyreon/your-package"
import { signal } from "@pyreon/reactivity"
export function Probe() { const s = signal(0); yourThing(s); return null }' > /tmp/probe.tsx

# Check it compiles on both targets
bun -e "
const fs = require('fs')
const { transform } = await import('@pyreon/native-compiler')
const src = fs.readFileSync('/tmp/probe.tsx', 'utf8')
console.log('Swift:', transform(src, { target: 'swift' }).code.length, 'chars')
console.log('Kotlin:', transform(src, { target: 'kotlin' }).code.length, 'chars')
"
```

### Tier 3 — cross-target library authoring (the Storage pattern)

If your library needs OS-level APIs (network, persistence, sensors, OS chrome), follow the **Layer-2 service pattern**:

#### 1. Define the shared TypeScript API surface

```ts
// packages/your-lib/src/index.ts
import { signal, type Signal } from '@pyreon/reactivity'

export interface YourBackend {
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
}

let _backend: YourBackend = createWebBackend() // default

export function setYourBackend(b: YourBackend): void {
  _backend = b
}

export function useYourThing(key: string): Signal<string | null> {
  const s = signal<string | null>(null)
  _backend.read(key).then(v => s.set(v))
  return s
}
```

This file is **the SAME on all 3 targets**. It defines the contract.

#### 2. Provide a web implementation

```ts
// packages/your-lib/src/web.ts
function createWebBackend(): YourBackend {
  return {
    read: async (key) => fetch(`/api/${key}`).then(r => r.text()),
    write: async (key, v) => { await fetch(`/api/${key}`, { method: 'POST', body: v }) },
  }
}
```

#### 3. Author Swift + Kotlin runtime ports

```swift
// packages/native/runtime-your-lib-swift/Sources/PyreonYourLib/PyreonYourBackend.swift
public class PyreonYourBackend {
  public static let shared = PyreonYourBackend()
  public func read(_ key: String) async throws -> String? {
    // URLSession impl
  }
  public func write(_ key: String, _ value: String) async throws {
    // URLSession impl
  }
}
```

```kotlin
// packages/native/runtime-your-lib-kotlin/src/main/kotlin/.../PyreonYourBackend.kt
object PyreonYourBackend {
  suspend fun read(key: String): String? {
    // ktor impl
  }
  suspend fun write(key: String, value: String) {
    // ktor impl
  }
}
```

#### 4. Teach PMTC to emit calls to your native runtime

The compiler (`packages/native/compiler/src/parse.ts`) recognises a fixed set of "Layer-2 hook calls" — `useStorage`, `useNavigate`, etc. Adding `useYourThing` to this list requires a PMTC change. **This is the friction point** for third-party authors: you can't ship a Tier-3 library entirely outside the compiler.

The honest workaround today is to **PR your hook into PMTC's recognised list** and ship the runtime port alongside. This is how `@pyreon/storage`'s `useStorage` and `@pyreon/router`'s `useNavigate` got into the compiler.

#### 5. Document the API + the per-target backends

Every Tier-3 library should have a README section listing:
- The user-facing API (one block, "this is what you write")
- The web backend (one block)
- The iOS backend (one block)
- The Android backend (one block)

So users + reviewers can see the parity at a glance.

### Tier 5 — web-only library authoring

Some libraries can't reasonably be cross-platform. ECharts is web canvas; Apple's Swift Charts is a fundamentally different API; building a "unified chart API" that maps to both well is a multi-month research project, not a library.

**Be honest about this in the README**:

```markdown
> **Web only.** This package targets the web DOM medium. For native targets, use platform-native equivalents under a Layer-4 escape hatch:
>
> ```tsx
> <Web><Chart options={chartOptions} /></Web>
> <NativeIOS><SwiftChart /></NativeIOS>
> <NativeAndroid><ComposeChart /></NativeAndroid>
> ```
```

This is the existing `<Web>` / `<NativeIOS>` / `<NativeAndroid>` Layer-4 contract. The user accepts per-target code for that one screen.

## The Hermes / embedded-JS-engine path (and why we haven't taken it)

The architectural alternative is React Native's path: embed a JavaScript engine (Hermes is the modern choice) inside the iOS + Android binary, and run arbitrary npm packages as-is.

**What you'd gain**:
- TanStack Query, RxJS, zod, lodash, date-fns, ANY pure-logic npm package — works unchanged on all 3 targets.
- Ecosystem grows with npm itself, not Pyreon's effort.
- Tier 3 mostly evaporates — you can use the web library on native too.

**What you'd lose**:
- **Binary size**: Hermes adds ~10 MB to each platform binary.
- **Native-perf differentiator**: every JS-resident library call crosses the bridge. The faster-than-RN positioning erodes.
- **Cold start**: JS engine init adds ~100ms to launch.
- **Memory**: JS heap + native heap on the same device.
- **Debugging**: error stacks span two languages.
- **Engineering effort**: months. The bridge design, the marshalling, the GC interplay, the developer experience — all need original work. RN took ~5 years to stabilise its bridge.

**The right shape if Pyreon ever takes this path**: **selective Hermes**, not blanket. Compile UI + signals to native (fast path). Embed Hermes only for "opt-in pure-logic libraries the user explicitly asks for." Most apps wouldn't ship Hermes; only those using `@pyreon/lib-via-hermes`.

That's still multi-quarter work. Not on the current roadmap.

**The decision**: Pyreon's bet today is **compile-to-native with a growing cross-target service layer** (Tier 3 packages). The Layer-4 escape hatch handles the long-tail (Tier 5). If the framework gains traction and the absence of npm becomes the binding constraint, the Hermes-selective path remains open as a future architectural option — but it's a different framework, not the next sprint.

## Reading order for library authors

1. Read [`docs/docs/multiplatform.md`](./multiplatform.md) for the 4-layer model + canonical primitives.
2. Read [`docs/docs/pmtc-supported-typescript.md`](./pmtc-supported-typescript.md) for what TS syntax PMTC handles.
3. Read [`docs/docs/pmtc-per-target-setup.md`](./pmtc-per-target-setup.md) for the per-target build flow.
4. Look at `@pyreon/storage`'s source for the canonical Tier-3 implementation pattern.
5. Look at `@pyreon/router`'s source for a more complex Tier-1+3 hybrid (the routing primitives + the navigation hooks).
6. Write your library, choose your tier, verify with the appropriate test:
   - Tier 2: PMTC integration fixture (above).
   - Tier 3: per-target runtime port + PMTC parser update.
