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

### Tier 2 — pure-logic packages (should compile via PMTC, unverified end-to-end)

These packages are signal-driven business logic with no DOM dependency. They should compile cleanly via PMTC, but most haven't been **explicitly verified** through the swiftc + kotlinc gates yet. Each needs a dedicated TodoMVC-shape integration test before we can confidently claim 100%.

| Package | What it provides | Verification status |
|---|---|---|
| `@pyreon/store` | `defineStore`, composition stores returning `StoreApi<T>` | Unverified |
| `@pyreon/state-tree` | `model({ state, views, actions })` | Unverified |
| `@pyreon/machine` | `createMachine` constrained signals | ⚠️ Moved to Tier 3 — see [audit correction below](#audit-corrections-june-2026). |
| `@pyreon/permissions` | `createPermissions`, RBAC + ABAC checks | Unverified |
| `@pyreon/validation` | Standard Schema adapters (Zod / Valibot / ArkType) | Unverified — depends on whether the underlying validator compiles |
| `@pyreon/validate` | DX overlay on Standard Schema | Unverified |
| `@pyreon/i18n/core` | `createI18n` + `interpolate` + plural rules | Unverified (the `/core` entry is intentionally framework-agnostic; the JSX `<Trans>` component needs PMTC's JSX path) |
| `@pyreon/feature` | Schema-driven CRUD primitives | Composes other Tier-2/3 packages; verify after dependencies |

#### Audit corrections (June 2026)

The following packages were initially classified as Tier-2 but verification surfaced they belong elsewhere:

- **`@pyreon/rx`** — moved to **Tier 3**. PMTC transform silently drops all `rx.*` calls from the emitted output. The user writes `rx.filter(signal, predicate)` and gets nothing on native. This is a silent correctness bug, not a compile failure. Adding rx support means either teaching PMTC's parser the `rx.*` namespace (so `rx.filter(sig, pred)` emits as `computed(() => sig().filter(pred))`) OR shipping per-target rx runtime ports. Regression-locked by `packages/native/compiler/src/tests/tier2-rx-silent-drop.test.ts`.

- **`@pyreon/machine`** — moved to **Tier 3**. PMTC silently drops the `const m = createMachine({...})` binding but PRESERVES the call sites `m.send(...)` and `m.matches(...)` — yielding emit that references undefined `m`. This is a **hard swiftc/kotlinc compile error** at the platform-compile layer, with **no warning at the PMTC-transform layer**. Worse-than-rx in that the emit is structurally broken (not just behaviourally wrong); better-than-rx in that the bug is loud once you actually run the platform compiler. Fix paths same as rx: PMTC parser learns `createMachine` (cheapest — lowers binding to `@State`/`mutableStateOf` + native equivalents for `.send`/`.matches`) OR per-target Swift/Kotlin machine runtime ports. Regression-locked by `packages/native/compiler/src/tests/tier2-machine-emit-broken.test.ts`.

- **`@pyreon/sized-map`** — **removed from Tier-2 classification**. SizedMap is a `class SizedMap<K, V>` data structure backed by a generic `Map<K, V>`. It's used INTERNALLY by `@pyreon/runtime-dom`'s template cache and `@pyreon/lint`'s AST cache — not in user component code. PMTC compiles `.tsx` component bodies, not generic standalone classes. This package is **internal infrastructure**, outside the multiplatform user-code surface; it doesn't need a tier.

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
