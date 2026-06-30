---
title: Multi-Platform Pyreon
---

# Multi-Platform Pyreon

> **Status:** PMTC (Pyreon Multi-Target Compiler) is **experimental — demo-quality, self-rated 66/100, not production-ready.** The 15-primitive canonical vocabulary spans all three targets — every primitive has a real web DOM runtime AND emits SwiftUI + Jetpack Compose. **Be precise about what "validated" means**, because the layers differ sharply in strength:
> - **(1) Per-PR gate — SYNTAX-only.** `swiftc -parse` (parse, NOT `-typecheck` — it accepts unresolved types + type mismatches) + `kotlinc` against Compose **stubs** (not real androidx). This gate runs on every PR but **cannot catch type-level corruption** — see the silent-failure cliff below.
> - **(2) Real-toolchain BUILD of the four example apps** — `xcodebuild` (full Swift compile) + `gradle assembleDebug` — via the **opt-in/advisory** `native-device` workflow. This is the only place real type-checking happens, and only for those apps.
> - **(3) Launch + interaction UI smokes** — XCUITest (iOS Simulator) + Compose-instrumented-test (Android Emulator). Strong for the **Tasks/Counter/Router** examples (login validation, store mutation, typed-params nav, content-asserted fetch, Suspense/ErrorBoundary all assert real behaviour); **launch-only for TodoMVC**; **absent for native-analytics**.
>
> Layers 2–3 are **advisory** (the `native-device` label / nightly schedule) and **gate ZERO PRs** — currently green but below their own 14-night promotion bar. So "it compiles" on a PR means "the syntax parsed," not "it builds + runs on a device." Treat native output as demo-grade until the device gate is required.

## The pitch

Write your app once. Run it on the web, iOS, and Android — each rendered with the platform's native primitives. (Web runs live today; iOS/Android are emitted as SwiftUI/Compose and build cleanly for the example apps — read "What runs on native" and the validation Status above for the honest scope, including which packages are web-only.)

```tsx
// examples/native-todomvc-ios/src/TodoApp.tsx — single source, three targets
import { signal, computed } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { Stack, Inline, Text, Field, Button } from '@pyreon/primitives'

export function TodoApp() {
  const todos = useStorage<Todo[]>('todos', [])
  const draft = signal('')

  return (
    <Stack gap="md">
      <Field
        value={draft}
        onChangeText={(text) => draft.set(text)}
        placeholder="What needs to be done?"
      />
      <For each={todos} by={(t) => t.id}>
        {(t) => (
          <Inline gap="sm">
            <Text>{t.text}</Text>
            <Button onPress={() => /* ... */}>Remove</Button>
          </Inline>
        )}
      </For>
    </Stack>
  )
}
```

This single file compiles to:

- **Web** via `@pyreon/runtime-dom` — `<Stack>` becomes `<div style="display:flex;flex-direction:column">`, `<Field>` becomes `<input>`, etc.
- **iOS** via PMTC → SwiftUI — `<Stack>` becomes `VStack`, `<Field>` becomes `TextField("", text: $draft)`, etc.
- **Android** via PMTC → Jetpack Compose — `<Stack>` becomes `Column`, `<Field>` becomes `TextField(value, onValueChange)`, etc.

Same source. Three idiomatic outputs (web rendered live; iOS/Android emitted as SwiftUI/Compose — see the validation reality in the Status note above).

## What runs on native — and what's web-only (read this first)

**PMTC compiles your component *source* — the 15 canonical primitives, `signal`/`computed`/`effect`, and a fixed set of hooks — to SwiftUI/Compose. It does NOT transpile npm packages to native.** So a package runs on iOS/Android only if it is pure reactive logic **with a Swift/Kotlin runtime port** the compiler recognizes. Anything bound to the DOM, a `<canvas>`, the CSSOM, or a JS-only rendering vendor is **web-only by architecture** — no compiler setting changes that.

**✅ Runs on web + iOS + Android today** (real runtime ports + compiler emit):

- `@pyreon/reactivity` (signal/computed/effect), `@pyreon/primitives` (the 15 canonical primitives)
- `@pyreon/store`, `@pyreon/machine`, `@pyreon/state-tree`, `@pyreon/i18n`, `@pyreon/permissions`
- `@pyreon/form` (validated forms — **device-proven**), `@pyreon/storage` (platform-storage backend)
- the native `@pyreon/router` port (`useNavigate`/`useParams`/`useLoaderData`, nested routes, `beforeEnter`)
- the **subset** of `@pyreon/hooks` with ports: `useFetch`, `useOnline`/`useNetworkStatus`, `useClipboard`, `useColorScheme`

**❌ Web-only by design** (a hard DOM/canvas/vendor dependency the compiler has no path for — these will NOT be *native-rendered* as SwiftUI/Compose; PMTC can't compile echarts/CodeMirror/elkjs/etc. But several CAN be **hosted in a `<WebView>`** — see the bridge escape hatch right after this table):

| Package | Blocking dependency |
|---|---|
| `@pyreon/flow` | `elkjs` layout engine + SVG/CSS-transform pan-zoom + DOM pointer events |
| `@pyreon/charts` | `echarts` (renders to `<canvas>`) |
| `@pyreon/code` | CodeMirror 6 (DOM editor) + a `<canvas>` minimap |
| `@pyreon/dnd` | `@atlaskit/pragmatic-drag-and-drop` (HTML5 drag events on `HTMLElement`) |
| `@pyreon/document` / `@pyreon/document-primitives` | pdfmake/docx/exceljs/pptxgenjs + `Blob`/`document` download |
| `@pyreon/query` | TanStack Query core + SSE/WebSocket hooks (use **`useFetch`** for simple data on native) |
| `@pyreon/table` / `@pyreon/virtual` | TanStack headless cores bound to DOM cells / scroll containers |
| `@pyreon/hotkeys` | `window` keyboard listeners |
| `@pyreon/elements`, `@pyreon/styler`, `@pyreon/rocketstyle`, `@pyreon/coolgrid`, `@pyreon/kinetic`, `@pyreon/unistyle`, `@pyreon/ui-core`, `@pyreon/ui-components` | the web CSS-in-JS / DOM stack (Layer 3b) — native apps use `@pyreon/primitives` (Layer 3a) instead |

**🌉 Escape hatch — host a web-only component in a `<WebView>` (the bridge).** The "❌" packages can't be *native-rendered*, but a `<WebView>` embeds a real browser engine (WKWebView on iOS, Android WebView), so the web component runs *inside* it — echarts' canvas, flow's elkjs+SVG, CodeMirror, a document preview. The bridge is **bidirectional**:

- **Forward** — `data={metrics()}` is pushed into the page as `window.__pyreonData` (+ a `pyreondata` event) so the hosted component updates live, no reload.
- **Reverse** — the page calls `window.pyreonPostMessage(payload)` → your native `onMessage={(m) => …}` closure.

```tsx
// examples/native-analytics — a chart hosted natively, both directions:
<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />
```

This is the **right** answer for charts / diagrams / code editors / doc previews (you wouldn't reimplement echarts in SwiftUI anyway). Caveats: it's a hosted web view (web look-and-feel, not native widgets), pays WebView boot + bundle weight (echarts ~1 MB), and is best for self-contained *panes* — not your whole app. The bridge runtime (`PyreonWebView.swift`/`.kt`) is real + `swift build`-clean and `native-analytics` demonstrates it, but a chart-in-WebView **device** test isn't in the nightly gate yet (the mechanism is proven; the on-device run isn't CI-gated). For your core app UI (nav/forms/lists/layout) use the native primitives; reach for the WebView only for the rich web-island pieces.

**🟡 Logic could port, but no native runtime exists yet:** `@pyreon/rx`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/url-state`, `@pyreon/toast` (the store is pure-logic; the `<Toaster>` renderer is DOM), and `@pyreon/sync`'s engine-neutral core (the Yjs engine + IndexedDB/WebSocket transports are web/Node-only).

### The supported-TypeScript-surface ceiling (and the silent-failure cliff)

PMTC compiles a **deliberately narrow, declarative subset** of TypeScript in component bodies: signal/computed/effect declarations, typed props, the canonical-primitive JSX, `<For>`/`<Show>`, `if`/ternary control flow, array/string method calls, and two `type`-alias shapes (string-literal union → enum, object literal → struct/data class). Inside that lane it emits real, idiomatic SwiftUI/Compose.

**Outside that lane the failure mode is sometimes *silent*, sometimes a named warning — the silent-drop surface is shrinking.** `Map`/`Set`/`Date`, C-style `for (let i…)`, `instanceof`/`in`, optional **index/call** (`a?.[i]` / `f?.()`), multi-spread, and generics in logic are dropped or mis-emitted — some still with no warning. (Destructuring of locals is now lane-precise: **flat** `const {a} = obj` / `const [a, b] = xs` LOWER; **nested / rest / default** patterns — `const {a:{b}} = o`, `const {a, ...r}`, `const [a, ...r]`, `const {a = 1}` — now fail with a NAMED warning pointing at the escape hatch, no longer a silent drop. `try`/`throw` and `class`/`new` already emit a named "unsupported" warning. A JSX **spread on a canonical primitive** — `<Stack {...cfg()}>` — now fails with a NAMED warning too (its layout props were *silently dropped* before: a runtime prop-bag can't apply to a static SwiftUI view / Compose composable, so pass props explicitly — `<Stack gap="md">`); a spread on a USER component still expands against its declared props.) (Recently CLOSED — these now LOWER and are no longer dropped/mis-emitted: **template literals** `` `Hi ${name}` `` → native interpolation; **`for…of`/`while`/`switch`** + **reassignment** (`t = t + x`, `+=`) + **multi-declarator**; **optional chaining** `a?.b` (member); **object destructuring of locals** `const {a} = obj` (body-local + hook-result, e.g. `const { data } = useFetch(url)`); **untyped object / array-of-object signals** → a synthesized struct *with a precise type annotation* (`signal({x:1})` / `signal([{id:1,name:"a"}])` emitted a broken `Any` annotation on Swift, now an inferred struct/`[Struct]`); **`.sort` + chained array-method element inference** (`[...xs()].sort(cmp).slice(0, n)` — `.sort` was inferred `Any`, breaking the chained `.slice`); **`Object.keys()` over a known object shape** → a static key array (`["a","b"]` / `listOf("a","b")`; other `Object.*` reflection — `.values`/`.entries`/non-struct-arg — degrades to a typed-empty array + a warning, never the old silently-uncompilable `Object.keys(...)`); **fractional/Double math** — `signal<number>(9.99)` now emits `var price: Double = 9.99`, not `Int`; **`**`/bitwise** operators; **`Math.*`** functions; **JS truthiness on an OPTIONAL value in a condition** — `const t = todos.find(…)` used as `t ? a : b` / `{t && <X/>}` / `<Show when={t}>` / `if (t)` / `while (t)`, AND the NEGATED `!t` form — now lowers to an explicit `t != nil` / `!t → t == nil` (Swift) and `t != null` / `!t → t == null` (Kotlin) at **every** condition site (the bare optional, and `!optional` itself, were rejected as a non-Bool condition — a clean-parse but uncompilable *silent* mis-emit). The `if`/`while` STATEMENT positions lower any condition whose optionality is resolvable — an inline `if (todos.find(…))` or a component-level `if (optionalComputed())`. The ONE remaining un-lowered site: an `if (opt)` on a **handler-LOCAL** var (`const t = …find(…); if (t)`) — handler-locals aren't seeded into the infer ctx (a separate, deeper change to thread a local type environment through statement emission — tracked follow-up). See the supported-surface tables below for the exact set.) The per-PR validation gate is `swiftc -parse` (syntax-only — it does **not** typecheck) + `kotlinc` against Compose **stubs**, so it cannot catch this class of type-level corruption; the full real-compiler build only runs for the example apps in the **advisory** `native-device` workflow. **Treat native PMTC as demo-quality** (the project self-rates it **66/100**): write components in the restricted declarative style, keep data-structure manipulation in pure-logic helpers, and verify on a real Simulator/Emulator before trusting native output.

## Architecture overview

Pyreon's multi-platform story is built on a **four-layer model**. Code in lower layers is reused unchanged across platforms; code in higher layers gets per-platform implementations behind a shared API.

```text
Layer 4: <NativeIOS> / <NativeAndroid> / <Web>  (escape hatches, opt-in)
Layer 3b: @pyreon/elements                       (web-only rich primitives)
Layer 3a: @pyreon/primitives                     (canonical multi-platform primitives)
Layer 2: useStorage / useRouter / useFetch       (ServiceBackend pattern)
Layer 1: useDebounce / useToggle / ...           (pure-logic hooks, 100% shared)
Layer 0: signal / computed / effect              (reactive core, 100% shared)
```

### Layer 0 — Reactive core (100% shared)

`signal()`, `computed()`, `effect()`, `batch()`, `onCleanup()` — these are the same on every platform. PMTC maps them to `@State` / `@Observable` on iOS and `mutableStateOf` / `derivedStateOf` on Android. On web they're native Pyreon.

### Layer 1 — Pure-logic hooks (100% shared)

Custom hooks composed entirely of signals + business logic. `useDebounce`, `useToggle`, `usePrevious`, `useControllableState` — no DOM, no platform APIs. They work identically on every target.

### Layer 2 — Platform-abstracted services

Services with a shared API surface + per-platform implementation. Established by `@pyreon/storage`:

```ts
// Same code on all three platforms
import { useStorage } from '@pyreon/storage'
const todos = useStorage<Todo[]>('todos', [])
```

Behind the scenes:

- **Web**: backed by `localStorage` via `@pyreon/storage`
- **iOS**: backed by UserDefaults via `@PyreonAppStorage` (from `@pyreon/native-runtime-swift`)
- **Android**: backed by an in-memory or DataStore backend via `rememberPyreonStorage` (from `@pyreon/native-runtime-kotlin`)

The PMTC compiler rewrites `useStorage<T>('key', default)` to the platform-native one-liner on iOS / Android. On web it stays as the standard `@pyreon/storage` call.

Same pattern extends to: `@pyreon/router` (iOS NavigationStack + Android NavHost runtimes are Phase C), network fetching, permissions, lifecycle hooks.

### Layer 3 — UI primitives (the architectural fork)

Two separate primitive layers serve different needs:

#### Layer 3a: `@pyreon/primitives` — canonical multi-platform

The cross-platform vocabulary. 15 semantic primitives designed for **fundamentally the easiest DX** across all three targets:

| Category | Primitives |
|----------|-----------|
| Layout | `<Stack>`, `<Inline>`, `<Layer>`, `<Scroll>`, `<Spacer>` |
| Content | `<Text>`, `<Heading>`, `<Image>`, `<Icon>` |
| Interaction | `<Button>`, `<Press>`, `<Link>` |
| Input | `<Field>`, `<Toggle>`, `<Modal>` |
| Control flow | `<For>`, `<Show>`, `<Match>`, `<Switch>`, `<Suspense>`, `<ErrorBoundary>`, `<Dynamic>`, `<Portal>` (existing, unchanged) |

Designed for cross-platform from scratch. Semantic names (`<Stack>` not `<View>` / `<VStack>` / `<div>`). One canonical event name per concept (`onPress` everywhere). Tokens-first styling (`padding={4}` resolves via theme).

#### Layer 3b: `@pyreon/elements` — web-only rich

The existing web primitive layer (`Element`, `Text`, `List`, `Overlay`, `Portal`). Built on rocketstyle + styler + unistyle — rich responsive props, extendCss, full DOM-coupled styling. **Stays as-is. Web-only.**

Cross-platform apps use `@pyreon/primitives`. Web-only apps that need rocketstyle's rich features use `@pyreon/elements`. The two coexist — no naming collision because imports are explicit.

### Layer 4 — Platform escape hatches

When the canonical vocabulary doesn't reach (Apple Pencil gestures, AR scenes, Android intents, browser-specific APIs), drop into platform-specific code via explicit wrappers:

```tsx
<NativeIOS>
  {/* iOS-only SwiftUI JSX — Compose + web targets ignore this */}
</NativeIOS>
```

## Canonical primitive vocabulary (Layer 3a)

### Layout

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Stack direction?="column"\|"row" gap? align? justify?>` | `<div style="display:flex">` | `VStack` / `HStack` | `Column` / `Row` |
| `<Inline gap?>` (sugar for `<Stack direction="row">`) | flex row | `HStack` | `Row` |
| `<Layer>` (z-stack) | `position:relative` + abs | `ZStack` | `Box` |
| `<Scroll axis?>` | `overflow:auto` | `ScrollView` | `Column(verticalScroll)` |
| `<Spacer />` | `flex:1` | `Spacer()` | `Spacer(weight=1)` |

### Content

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Text>` | `<span>` | `Text` | `Text` |
| `<Heading level={1\|...6}>` | `<h1>`..`<h6>` | `Text(.font(...))` | `Text(style=...)` |
| `<Image src alt fit?>` | `<img>` | `Image` / `AsyncImage` | `AsyncImage` |
| `<Icon name>` | `<svg>` | `Image(systemName:)` | `Icon` |

### Interaction

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Button onPress>` (styled CTA) | `<button>` | `Button` | `Button` |
| `<Press onPress>` (un-styled wrapper) | `<div onClick role=button>` | `Button { }` no chrome | `Box(clickable)` |
| `<Link to external?>` (router-agnostic) | `<a href>` + SPA-nav when `init({ navigate })` is wired | `NavigationLink` | `Box(clickable + navigate)` |

### Input

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Field value onChangeText kind?>` | `<input>` | `TextField` / `SecureField` | `TextField` |
| `<Toggle value onChange>` | `<input type=checkbox>` | `Toggle` | `Switch` |
| `<Modal open onClose>` | `<dialog>` | `.sheet(isPresented:)` | `Dialog` |

## Event model

One canonical event name per concept; the compiler maps it to the platform-native handler:

| Concept | Pyreon canonical | Web | iOS | Android |
|---------|------------------|-----|-----|---------|
| Tap | `onPress` | `onClick` | `action:` | `onClick =` |
| Long press | `onLongPress` | polyfill | `.onLongPressGesture` | `combinedClickable(onLongClick)` |
| Text change | `onChangeText` | `onInput` | text binding | `onValueChange` |
| Submit | `onSubmit` | form `onSubmit` | `.onSubmit { }` | `keyboardActions onDone` |
| Focus / blur | `onFocus` / `onBlur` | same | `.focused()` | `onFocusChanged` |
| Appear / disappear | `onAppear` / `onDisappear` | `IntersectionObserver` | `.onAppear` | `LaunchedEffect` |

Hover events are deferred (mobile platforms don't have hover).

Handlers may be **multi-statement** — `onPress={() => { a.set(1); b.set(2) }}` emits every statement (including `if` blocks) into the native closure on both targets. (Earlier the compiler silently kept only the first statement.) A single-expression handler (`onPress={() => a.set(1)}`) keeps the compact one-line form.

## Style system (v1)

**Tokens-first.** No raw pixels in cross-platform code.

| Prop | Type | Resolves to |
|------|------|-------------|
| `padding`, `margin`, `gap` | `number` (theme.space index) OR `"sm" \| "md" \| "lg"` | Web: inline `style` px; iOS: `.padding()`; Android: `Modifier.padding()` |
| `color` | `"text" \| "surface" \| "primary" \| ...` (theme key) | Per-platform color resolution |
| `background` | theme key | Per-platform background |
| `align` | `"start" \| "center" \| "end"` | Per-platform alignment |
| `justify` | `"start" \| "center" \| "end" \| "between"` | Per-platform main-axis |
| `radius` | `"none" \| "sm" \| "md" \| "lg" \| "full"` | Per-platform corner radius |

**No responsive props in v1.** Web has media queries, iOS has size classes, Android has configuration changes — unifying these is a multi-week design problem deferred to a future arc. Apps that need responsive web layouts use `@pyreon/elements` directly (it has full responsive prop support).

**No animation primitives in v1.** Same reasoning.

**Escape hatch.** `<NativeIOS style={...}>` / `<Web className="...">` for per-platform overrides when the canonical style system doesn't reach.

## Per-platform import resolution

The DX-critical question: how does `import { Stack } from '@pyreon/primitives'` resolve on each target?

- **Web**: `@pyreon/primitives` is a real npm package with real implementations. `Stack` is a `ComponentFn` that renders DOM. Standard module resolution.
- **iOS / Android (via PMTC)**: The PMTC compiler INTERCEPTS JSX with `<Stack>` etc. at compile time and emits platform-native code BEFORE the runtime is involved. The import is type-anchor only — the JSX never calls into `@pyreon/primitives`'s runtime.

The same source file works on all three targets. The compiler-side handling for each target is different but the developer doesn't see it.

## Migration

`@pyreon/primitives` is a NEW package. Adding it breaks nothing.

Existing PMTC source using SwiftUI-flavored names (`<VStack>`, `<HStack>`, `<TextField>`) continues to work via the existing per-target emit. The TodoMVC migration to canonical vocabulary is Phase E — a deliberate, additive port. After migration is proven, deprecation warnings land on SwiftUI-flavored tags. Removal happens in a major-version bump LATER.

## Current state + roadmap

The 5-phase implementation roadmap:

Foundation rollout (A–E):

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | Architectural foundation: canonical primitives package + web runtimes | ✅ Done — **all 15** primitives have web DOM runtimes |
| **B** | PMTC compiler emit for iOS + Android (extends `canonical-primitives.ts` table) | ✅ iOS (Swift) **15/15**; Android (Compose) emit completing via the P2.2 series |
| **C** | `@pyreon/native-router-{swift,kotlin}` runtime adapters + routes emit (path + component) | ✅ Done |
| **D** | Web target for PMTC + `examples/native-todomvc-web/` consuming the shared source | ✅ Done |
| **E** | TodoMVC migration to canonical vocab — closes the cross-platform contract | ✅ Done |

ONE `TodoApp.tsx` source → THREE example apps (web, iOS, Android), all typecheck-clean.

### Beyond the foundation — toward production-grade

The vocabulary is multiplatform; the road to shipping real production apps continues:

| Step | Scope | Status |
|------|-------|--------|
| Real-device CI | Compile the full apps on real Xcode/Gradle (`native-device` workflow), then boot Simulator/Emulator + assert render | 🟡 build gate + iOS XCUITest + Android Compose-instrumented-test landed (opt-in `native-device` label); promote to required once green across nightly runs |
| Router matching | **redirects**, `:param*` splat, `:param?` optional, `*`/`(.*)` whole-route **wildcard 404**, leading/trailing-slash tolerance | ✅ landed (see [Native routing](#native-routing)) |
| Router parity (advanced) | per-route **guards** (`beforeEnter`), **nested routes** (layout-wrapping), `useParams` **destructuring**, loader-data runtime (`useLoaderData`), per-route **loader auto-emit**, **global** `beforeEach`/`afterEach` guards, **throw-redirect** pattern | ✅ guards, nested routes, `useParams` destructure, `loaderData`/`useLoaderData` runtime, **global guards** (#1108), **`router.redirect()` re-entry-safe throw-pattern** (#1109), and **per-route `loader` auto-emit** (v1 — zero-param expression-body loaders; see note) all landed |
| Data + forms | `useFetch` / `useForm` / `usePermissions` / `useOnline` / `useClipboard` / `useColorScheme` as per-service native runtime ports (runtime + emit) | ✅ six hooks landed — **`useForm` v2 is device-proven** (validators + runtime Field bindings + submit gating; the tasks login's error-path smoke); **`useFetch` is device-proven end-to-end** (the tasks Quotes screen fetches + decodes + renders a real HTTP fixture on the CI Simulator/Emulator; web runs the same call through `@pyreon/hooks`); `usePermissions` incl. web-parity `can.not`; `useOnline`; `useClipboard`; `useColorScheme` emit-only by design. `useValidation` planned |
| Compiler diagnostics | Surface silent-drop shapes as parser warnings instead of failing-silent at runtime | ✅ Round-1 (#1094 — `Icon`/`Image`/`Link` missing required props) + Round-2 (#1099 — `Press` without `onPress`, `Link prefetch={…}` on native, `Stack/Inline/Layer align="<typo>"`) landed; both routes ship as `result.warnings`, emit shape unchanged |
| Lifecycle | `<Transition>` + `<TransitionGroup>` (landed); `<Suspense>` / `<ErrorBoundary>` (real semantics, Phase 2); `<KeepAlive>` | ✅ transitions + **real `<Suspense>` / `<ErrorBoundary>`** — both compile to an INLINE conditional in the component body (Swift `Group { if <pending/errored> { fallback } else { children } }`, Kotlin `if (…) { … } else { … }`) reading every `useFetch` container's `isPending` / `error` in that component: Suspense shows its fallback until the fetched data settles, ErrorBoundary swaps to its fallback when a container rejects (the realistic native error surface — SwiftUI/Compose have no try/catch around view construction). The read is inline (not passed to a wrapper) so SwiftUI Observation / Compose recomposition tracks it; on iOS the body wraps in a concrete `ZStack` so the fetch `.task` attaches to a stable host (a transparent `Group` makes SwiftUI cancel+restart the task on every flip → the fetch never settles). Device-proven (the tasks Lifecycle screen: good-fetch content + a deliberately-failing fetch's ErrorBoundary fallback both render on a real Simulator). `<KeepAlive>` stays a graceful pass-through (cache semantics inert; the hardest of the three). |
| DX | `pyreon create-multiplatform` scaffold (✅), asset pipeline | 🟡 scaffold landed **and produces buildable, launchable native apps end-to-end** — the four `@pyreon/native-*` runtimes wire in as SPM (iOS) / Gradle `srcDir` (Android) deps so the emitted `import PyreonRuntime` / `com.pyreon.runtime.*` resolve; proven scaffold → emit → `gradle assembleDebug` / `xcodebuild` → install → **launch (RUNNING)** on both an Android emulator and an iOS Simulator (#1570, which fixed eight project-wiring bugs a real local build surfaced that compile-only validation could not — web-entry-skip, `--kotlin-package`, serialization-plugin version, `ComponentActivity`, SPM `../` paths, source-path nesting, `App.swift` collision, `SwiftUI.App` shadow). **image asset pipeline landed** (`pyreon-native assets` — the shared `assets/` dir materializes to `Assets.xcassets` / `res/drawable-*` density buckets / `public/assets`, and `<Image src="name.png">` dispatches bundled-vs-remote per target; device-proven via the tasks branded header); SF-Symbols/Material icon mapping + fonts are the next arc |

> **Loader auto-emit — v1 landed (zero-param, expression-body).** A
> route's `loader: () => <expr>` now compiles to a runtime
> `PyreonRouteLoader` host wrapping the route's component: its `.task`
> (SwiftUI) / `LaunchedEffect` (Compose) fires the loader ONCE on the
> route's appear and stores the result via `router.setLoaderData(<active
> path>, …)`, where the already-shipped `useLoaderData<T>()` reads it
> (keyed by the runtime active path, so it matches for both literal and
> `:param` routes; the home route keys by its literal path = `currentPath`
> at launch). The store is guarded (`loaderData[path] == nil`) so
> re-renders never re-run it. Realistic native loader bodies are **signal
> / store reads** (`() => globalCache()`) and **sync expressions**
> (`() => buildInitialData()`); both emit correctly.
>
> **Still deferred** (each leaves `loader` undefined + WARNS, so the route
> renders with no loader rather than mis-emitting): a **param-using**
> loader (`(ctx) => fetchUser(ctx.params.id)` — `ctx` has no value source
> in the load closure yet), a **block-body** loader (`() => { … }` — needs
> statement emit), and a truly-**async** body (`async () => await
> fetch(…)` — no `await` lowering / typed-decode generic, the `useFetch<T>`
> territory). `ctx.params` threading + async-loader decode are the next
> arc; until then, fetch-style loaders populate `loaderData` from native
> code (or via a `useFetch` container) as before.

## Native routing

`createRouter({ routes })` compiles to native dispatch — SwiftUI
`NavigationStack` + `.navigationDestination(for:)` on iOS, a Compose
`when (router.currentPath)` block on Android. One route table, both targets.

```tsx
const router = createRouter({
  routes: [
    { path: '/',            component: Home },
    { path: '/users/:id',   component: User },          // path param
    { path: '/files/:rest*', component: Files },         // splat / catch-all
    { path: '/old',         redirect: '/users/1' },      // redirect (alias)
    { path: '/admin',       component: Admin, beforeEnter: () => isAuthed() }, // guard
    { path: '/app',         component: AppLayout, children: [   // nested layout
      { path: 'dashboard',  component: Dashboard },
      { path: 'settings',   component: Settings },
    ] },
    { path: '*',            component: NotFound },        // wildcard 404
  ],
  beforeEach: [requireAuth],                              // global guards run before every nav
  afterEach: [logAnalytics],                              // global hooks fire after every nav
})
return <RouterProvider router={router}><RouterView /></RouterProvider>
```

Inside a route component, read path params via destructuring:

```tsx
function User() {
  const { id } = useParams<{ id: string }>()   // → id reads the active route's param
  return <Text>{id}</Text>
}
```

**Path matching** (mirrors `@pyreon/router`'s `match.ts`, verified by the
native router runtime's own `swift test` / kotlinc smoke):

| Pattern | Matches | Captures |
|---------|---------|----------|
| `/users/:id` | `/users/42` | `id = "42"` |
| `/blog/:rest*` (splat) | `/blog/a/b/c` (one-or-more tail) | `rest = "a/b/c"` |
| `/users/:id?` (optional) | `/users` **and** `/users/42` | `id` absent or set |
| `*` / `(.*)` (wildcard) | any unmatched path | — (renders the 404 component) |

Leading/trailing slashes are tolerated (`/about/` matches `/about`).

**Redirects** are compile-time aliases: `{ path: '/old', redirect: '/new' }`
makes the `/old` dispatch branch render `/new`'s component directly (no
runtime push). Chains (`/a → /b → /c`) resolve transitively; cyclic /
dangling redirects are dropped to the no-match fallback.

**Wildcard 404**: a `*` / `(.*)` route's component becomes the dispatch
**else-branch** — the canonical not-found page for any unmatched path.

**Guards** (`beforeEnter: () => <boolExpr>`) wrap the matched component in
an inline conditional checked at navigation time; on failure the branch
renders the wildcard catch-all (if present) or a denial placeholder.

**Nested routes** (`children: [...]`) compile to a flattened full-path
dispatch where each leaf is wrapped in its layout chain via a **content
slot**: a layout component (a route parent) is emitted with a
`@ViewBuilder content` closure (SwiftUI) / `content: @Composable () -> Unit`
(Compose), and its `<RouterView />` becomes that slot. So `/app/dashboard`
renders `AppLayout { Dashboard() }`; the layout's own `/app` index renders
`AppLayout { EmptyView() }`. Three-plus levels nest outermost-first
(`AppLayout { TeamLayout { Members() } }`). Flat route tables keep the
original dispatch unchanged.

**`useParams()` destructuring** — `const { id } = useParams()` (and
`{ id: userId }` aliasing) binds each field to the active router's param
map: a computed `private var id: String { useParams(router:)["id"] ?? "" }`
on SwiftUI (computed, not stored — it reads `@Environment`), `val id =
useParams()["id"] ?: ""` on Compose.

**Typed `params` prop** — a route component may instead declare
`props: { params: { id: string } }` (the web router's prop-injection
shape). PMTC synthesizes a named type per component — `UserPage` →
`struct UserPageParam: Codable` (SwiftUI) / `data class UserPageParam`
(Compose) — and the dispatcher **constructs** it from the matched path
segments: `UserPage(params: UserPageParam(id: params["id"] ?? ""))` /
`UserPage(params = UserPageParam(id = params["id"] ?: ""))`. `number` /
`boolean` fields coerce from the string segments with safe defaults
(`Int(...) ?? 0`, `== "true"`). If the params shape structurally matches
a struct you declared yourself (`type RouteParams = { id: string }`),
your name is reused instead of synthesizing. Components without a
`params` prop are dispatched with no arguments.

**Loader data** — `PyreonRouter` exposes a `loaderData` store +
`useLoaderData<T>()`; a route's loaded data is keyed by the active path
and read back, typed, by the current route. A route's
`loader: () => <expr>` is now **auto-emitted** (v1): the compiler wraps
the route in a runtime `PyreonRouteLoader` host that fires the loader once
on appear (`.task` / `LaunchedEffect`) and calls `setLoaderData`, so
`useLoaderData<T>()` reads it with no manual wiring. v1 covers zero-param,
expression-body loaders (signal/store reads + sync expressions);
param-using, block-body, and truly-async loaders WARN and emit unloaded —
see the loader-auto-emit note in the roadmap.

**Global guards** (`beforeEach` / `afterEach`) — pass arrays of
identifier-referenced guard/hook functions on the `createRouter({ ... })`
config. The parser extracts the identifiers (inline arrow bodies + non-
array forms are silently dropped — a documented follow-up); the emit
configures the router via a Swift closure-init / Kotlin `apply { }` block.
At runtime, `push` / `replace` wrap the navigation in the guard chain —
any guard returning `false` blocks the navigation, then every `afterEach`
hook fires after a successful commit:

```tsx
const requireAuth = (path: string) => isAuthed() || path === '/login'
const logAnalytics = (path: string) => trackPageView(path)

const router = createRouter({
  routes,
  beforeEach: [requireAuth],   // any → false blocks the nav
  afterEach: [logAnalytics],   // all fire after successful commit
})
```

Falls back to bare init when no guards are configured (back-compat —
existing apps need no changes).

**Throw-redirect pattern** (`router.redirect(path)`) — the native
equivalent of web's `throw redirect("/login")` from a loader/guard,
without the guard-return-type redesign. Inside a `beforeEach`,
`router.redirect(path)` queues a `replace` AND returns false-equivalent
short-circuit semantics; an internal `_inGuard` re-entry flag prevents
the redirect's own navigation from infinite-recursing through the same
guard chain:

```swift
router.beforeEachGuards.append { path in
    if !isAuthed() && path != "/login" {
        router.redirect("/login")  // queues replace, re-entry-safe
        return false               // blocks the original push
    }
    return true
}
```

Same shape on Kotlin (`router.beforeEachGuards.add { path -> … }`). The
runtime addition is ~30 LOC per target; no compiler changes.

> Status: path matching, redirects, wildcard 404, **per-route guards**,
> **nested routes**, **`useParams` destructuring**, the **loader-data
> runtime**, **global `beforeEach` / `afterEach` guards** (#1108), the
> **`router.redirect()` throw-pattern** (#1109), and the **typed
> `params` prop** (synthesized per-component struct/data class +
> dispatcher construction from the matched segments) are all **landed**.
> Loader auto-emit and a typed `useParams<T>()` hook generic are planned.

## Bundled images — the asset pipeline

One `assets/` directory next to your shared `src/` carries the app's
images; the `pyreon-native assets` build step materializes it per
target:

| Target | Output | Mechanism |
|---|---|---|
| iOS | `Assets.xcassets/<name>.imageset` (1x/2x/3x from `@2x`/`@3x` suffixes) | `<Image src="logo.png">` → `Image("logo")` |
| Android | `res/drawable-{mdpi,xhdpi,xxhdpi}` (names sanitized to resource rules) | → `Image(painterResource(pyreonDrawable("logo")))` — a name-keyed runtime lookup, so the generated code never references the host's `R` class |
| Web | `public/assets/` | the web `<Image>` primitive prefixes bare names with `/assets/` |

All 15 primitives compile + render on a REAL Android build, not just
the kotlinc-validate subset: the emit's androidx symbols that live
outside the star-imported packages (`Color`, `RoundedCornerShape`,
`verticalScroll`/`rememberScrollState` for `<Scroll>`, `Dialog` for
`<Modal>`, Coil's `AsyncImage` for remote `<Image>`) each get a
content-keyed conditional import — the kotlinc stubs would otherwise
MASK a missing import (green validate, red `gradle assembleDebug`).

The `src` dispatch is canonical across targets: `http(s)://…` is
remote (`AsyncImage`/Coil/`<img>`), a BARE name (`logo.png`) is a
bundled asset, and a path-style src (`/img/x.png`) is web-only — the
compiler warns and native falls through to the remote emit (visible
failure, never silent). `fit` maps to
`scaledToFill/scaledToFit` (SwiftUI) and `ContentScale.Crop/Fit/
FillBounds/None` (Compose); the web default `cover` holds everywhere.

Asset-name collisions after Android sanitization (`my-logo.png` vs
`my_logo.png` → both `my_logo`) abort the build loudly.

### Icons — the canonical name map

`<Icon name="star">` uses ONE semantic name everywhere: iOS maps it to
an SF Symbol (`Image(systemName: "star.fill")`), Android to a
COMPILE-TIME Material reference (`Icons.Filled.Star` — hosts need only
the small `material-icons-core` artifact, never `-extended`), and web
to the app sprite's symbol id. The curated ~37-glyph map lives in
`canonical-primitives.ts` (`ICON_MAP`: navigation, actions, status).
An UNMAPPED name warns at compile time and stays visible: iOS passes
it through raw (direct SF ids keep working), Android renders the
`warning` placeholder glyph — never a silent blank.

### Custom fonts

Drop `.ttf`/`.otf` files in the same `assets/` dir; the assets step
copies them per target (iOS bundle + `UIAppFonts`; Android `res/font`;
web `public/fonts`). `<Text font="Brand">` / `<Heading font="Brand">`
renders the bundled family. The load-bearing detail iOS gets wrong by
default: `Font.custom` needs the font's POSTSCRIPT NAME (its internal
`name`-table id), NOT the filename — a filename-keyed `Font.custom`
silently falls back to the system font on-device. The CLI reads the
PostScript name from the sfnt table (no dependency) and bakes it into
the emit, so `<Text font="Brand">` → `Font.custom("Trattatello", …)`
even when the file is `Brand.ttf`. Android resolves `res/font` at
runtime via `pyreonFont(name)` (a missing font throws loudly).

## Native data & services

Data hooks compile to native via per-service **runtime ports** behind the
shared TS API (the `PyreonStorage` pattern — each service has a Swift +
Kotlin runtime the emitted code drives):

- **Platform prerequisites for networked apps** (both device-CI
  findings): Android needs `<uses-permission
  android:name="android.permission.INTERNET" />` in the manifest —
  without it socket creation fails with the opaque
  `SocketException: socket failed: EPERM` — plus a
  network-security-config exception if the endpoint is plain http
  (scope it to loopback/dev hosts only). iOS needs an ATS exception
  for non-HTTPS endpoints (`NSAllowsLocalNetworking` for
  loopback/dev). The `create-multiplatform` scaffold ships the
  INTERNET permission by default.
- **`useFetch<T>('/url')`** → a `PyreonFetch<T>` reactive container
  (`{ data, error, isPending, refetch }`). The compiler emits a mount-time
  `.task { }` (SwiftUI) / `LaunchedEffect` (Compose) that runs the request
  through the container's `begin → resolve | reject` state machine and
  decodes into `T`. Field reads (`x.data`, `x.isPending`) are `@Observable`
  properties on iOS, Compose `MutableState` on Android.
- **`useForm`** → a `PyreonForm` container (per-field values / errors /
  touched + submit state). `const form = useForm({ initialValues })` emits
  `@State PyreonForm(initialValues:[...])` (SwiftUI) / `remember {
  PyreonForm(mapOf(...)) }` (Compose); MutableState field reads append
  `.value` on Compose (except the derived `isValid` getter).
  **v2 (form-binding arc) — device-proven.** `useForm({ initialValues,
  validators, onSubmit })` lowers fully: per-field validators emit as
  native closures ('' = valid), `<Field value={form.values.x}>` binds
  through the runtime (`form.binding("x")` on SwiftUI — a real
  `Binding<String>` whose setter re-validates after an error; a
  value/onValueChange pair through `setValue` on Compose), per-field
  dict access subscripts with typed defaults (`form.errors.x` →
  `form.errors["x"] ?? ""`), and `submit()` gates on `validateAll`
  before invoking `onSubmit`. The web-parity names (`setFieldValue`,
  `handleSubmit`) exist on both runtime ports. SwiftUI nuance handled
  by the emit: an `onSubmit` capturing instance members (navigate,
  store writes) attaches via `.onAppear { form.onSubmit = … }` — a
  @State property initializer runs before `self` exists. The tasks
  showcase's login is the canonical validated form; its device smokes
  assert the ERROR path before the happy path. Open: block-body +
  async validators, schema validation (`@pyreon/validation`
  reachability), `<Form>`/`<Submit>` wrappers.
- **`usePermissions`** → a `PyreonPermissions` container (RBAC
  `can`/`cannot`/`all`/`any` with `"x.*"` wildcards). `const can =
  usePermissions([...])` seeds the grant set; reads are method calls (no
  `.value` rewrite).
- **`useOnline`** → a `PyreonNetworkStatus` container with a reactive
  `isOnline` flag (real `NWPathMonitor` on iOS; the Compose side takes the
  app's connectivity callback). `net.isOnline` reads plainly on SwiftUI,
  `.value` on Compose.
- **`useClipboard`** → a `PyreonClipboard` container with a `copy(text)`
  method + a reactive `copied: Bool` flag that auto-resets to false ~2s
  after each copy (matches the web `@pyreon/hooks` contract). Wraps
  `UIPasteboard.general.string` on iOS (cross-platform UIKit/AppKit —
  #1096 split out the macOS `NSPasteboard` path so the Swift runtime
  builds on both Apple platforms) and the system `ClipboardManager` on
  Android. Reads are plain method calls + a plain Bool/Boolean field
  — no `.value` rewrite. Kotlin emit is a two-line shape — `val cbCtx =
  LocalContext.current` hoisted out of the `remember { … }` lambda (the
  lambda is non-Composable; `LocalContext.current` can't be read inside
  it) + `val cb = remember { PyreonClipboard(cbCtx) }`. The Swift
  container's `deinit` now cancels the in-flight reset Task (#1107 —
  Class I leak fix) so a view that disappears mid-copy doesn't leak a
  pending 2-second timer. BOTH the single-binding shape `const cb =
  useClipboard()` AND the destructure form `const { copy, copied } =
  useClipboard()` compile (PR1 — destructure lowers to a synthetic
  single-binding container + per-field aliases; see "Binding idioms").
- **`useColorScheme()`** → returns `"light"` | `"dark"` reactively from
  the platform's preferred-color-scheme channel. **No runtime port
  needed** — both SwiftUI (`@Environment(\.colorScheme)`) and Compose
  (`isSystemInDarkTheme()`) ship the primitive directly, so PMTC emit is
  a thin per-target wrapper: Swift injects `@Environment(\.colorScheme)
  private var pyreonColorScheme` on the View struct + a computed `private
  var <name>: String { pyreonColorScheme == .dark ? "dark" : "light" }`;
  Kotlin emits `val <name> = if (isSystemInDarkTheme()) "dark" else
  "light"` inline. Same `"light" | "dark"` string contract the web hook
  uses — `scheme === 'dark'` works identically across all three targets
  (#1103).
- **Data/services hooks (Phase 5 — #1689):** seven more `@pyreon/*` hooks
  now compile to their runtime containers, instantiated + read exactly like
  `useOnline` (Swift `@State private var x = PyreonX()` with bare
  `@Observable` reads; Kotlin `val x = remember { PyreonX() }` with `.value`
  on the `MutableState` fields, bare on `Bool` getters + methods):
  `useAuth<User>()` → `PyreonAuth<User>` (status / user / error +
  `isAuthenticated`); `useDatabase()` → `PyreonDatabase` (insert / get / all
  / find / delete / count); `useGeolocation()` → `PyreonGeolocation` (lat /
  lon / accuracy / isAuthorized); `useMap()` → `PyreonMapState` (camera /
  markers / selectedMarkerId); `useWebSocket('wss://…')` → `PyreonWebSocket`
  (lastMessage / messages / isConnected; URL must be a string literal);
  `usePush()` → `PyreonPushNotifications` (token / lastNotification /
  isAuthorized); `usePayments()` → `PyreonPayments` (products /
  ownedProductIds / purchasing). This unblocks **writing** the finance,
  analytical, maps, and realtime/uber archetypes from one `.tsx` — verified
  at the compile rung: an archetype component using all seven emits
  typecheck-clean Swift (`swiftc`) **and** Kotlin (`kotlinc`).
  **Two honest limits:**
  (1) **Lifecycle auto-start is NOT yet emitted** — the binding + reactive
  reads ship, but `geolocation.start()` / `websocket.connect()` /
  `push.start()` on mount do not. The web hooks auto-start; on native today
  you call `.start()` / `.connect()` from an effect or native host. Full
  auto-start is **blocked on the real Kotlin transport backends** (the
  Kotlin containers take an app-injected source — `FusedLocationProvider` /
  OkHttp — which the compiler can't synthesize), so it lands with that
  Android-CI backend work, not before.
  (2) **`useSecureStorage()` is deferred** (warns + drops) — the Kotlin
  secret store needs an app-injected `EncryptedSharedPreferences` backend, so
  auto-instantiation isn't clean cross-target. Use the runtime container from
  native host code, or keep secrets in a `<Web>`-only branch, until the
  backend-injection emit lands.
  As with every native service, the **runtime behavior is compile-verified,
  not device-proven** — the nightly device gate + example apps are the
  runtime-proof layer.

> Status: `useForm` (v2 — validated forms, device-proven via the tasks
> showcase's error-path smoke), `useFetch` (device-proven — the
> networked Quotes screen), `usePermissions`,
> `useOnline`, `useClipboard`, and `useColorScheme` are **landed**
> (runtime port + compiler emit — `useColorScheme` is emit-only
> because the platform primitive is enough). `useFetch`'s open item is
> a device-scope NETWORK proof (the UITest gates don't run a backend
> yet). `useValidation` reachability planned.

### The supported TypeScript surface

PMTC compiles a deliberate SUBSET of TypeScript — the shapes the
canonical examples exercise, enumerated here so you know where the
boundary is BEFORE the compiler tells you. Outside the subset, the
contract is: a **warning naming the construct** + either a conservative
passthrough (the native compiler then errors loudly at the site) or a
whole-decl bail — never silent misbehavior. `pyreon-native build` prints
every warning; treat any warning as "this construct is outside v1."

**Declarations (component body)**
| Shape | Notes |
|---|---|
| `const x = signal(init)` / `signal<T>(init)` | un-annotated literals infer string/number/boolean; enum-typed signals get native enums |
| `const c = computed(() => expr)` | expression OR block body (block: `let` + `if`/`return`) |
| `const f = (args) => …` | functions; expression or block body |
| `const x = <expr>` (plain value) | non-call / non-arrow inits — string / number / boolean / arithmetic / member / signal-read — emit as a body-local `let` (Swift, in `body`) / `val` (Kotlin); captures-once like a JS const (#1691) |
| `useStorage<T>('key', default)` | literal string key required |
| `createRouter({ routes })` / `useNavigate()` / `useParams()` / `useLoaderData<T>()` | literal route arrays; guards as expression-body arrows |
| `useFetch<T>(url)` / `usePermissions([...])` / `useOnline()` / `useClipboard()` / `useColorScheme()` | see the services section for per-hook status |
| `useAuth<User>()` / `useDatabase()` / `useGeolocation()` / `useMap()` / `useWebSocket('wss://…')` / `usePush()` / `usePayments()` | Phase 5 (#1689) — container + reactive reads; `useWebSocket` needs a literal URL; lifecycle auto-start + `useSecureStorage` deferred (services section) |
| `createI18n({...})` / `createMachine({...})` / `defineStore(id, setup)` / `model({...}).create()` | literal configs; store v2 setup bodies take signals + expression-body computeds + arrow methods |
| `rx.METHOD(source, …)` | 21 collection methods (Strategy-A lowering) |

**Binding idioms — one requirement, one convenience that now lowers:**

- **Hook results → single-binding OR destructure (both work now).** Bind
  the hook's result to one name and read fields off it (`const q =
  useFetch<T>(url); q.data()` / `q.isPending`), OR destructure it directly
  (`const { data, isPending } = useFetch<T>(url)`). The destructure form
  **lowers** (PR1) to a synthetic single-binding container
  (`const __pyHookN = useFetch<T>(url)`) + one field alias per key, so each
  local rewrites to `__pyHookN.<field>` at its use sites — producing
  **byte-identical native output to the single-binding form** on both
  targets, with the call form preserved (accessor `data()` vs plain
  `isPending`). Covers `useFetch` / `useForm` / `useClipboard` /
  `useStorage` / `usePermissions` / `useOnline` / `useColorScheme` /
  `useNetworkStatus` / the seven Phase-5 data/services hooks. `useParams`
  keeps its own per-key lowering (router section). **Still warn-drop:** a
  rest element (`const { data, ...rest } = …`) or a nested pattern
  (`const { user: { id } } = …`) — v1 lowers all-simple destructures only;
  and `useLoaderData`'s destructure (its read returns an opaque `T` with no
  field shape to alias).
- **Destructured function/arrow params → lowered.** A helper with a
  destructured param — `const dist = ({ x, y }: Point): number => x + y`,
  `const apply = ({ id }: T) => { remove(id) }` — synthesizes a positional
  param `__pN` (typed from the pattern's annotation — a named type resolves
  to the declared struct) + prepends `let x = __pN.x` per key, so the body
  references `x`/`y` as written. Works for **void handlers** and functions
  with an **explicit return-type annotation**. A value-returning destructured
  function WITHOUT a return annotation should annotate it
  (`({ x }: P): number => x`) — an unannotated value return infers `Unit` on
  Kotlin (a separate, pre-existing return-inference limit, not specific to
  destructuring). Rest / nested patterns warn + stay un-destructured.
- **Store reads → inline OR aliased (both work).** Read store state
  inline through the hook (`useApp().store.tasks()`) OR bind the hook to a
  local first (`const app = useApp(); app.store.tasks()`) — the alias
  **lowers** to a `useApp()` call at every use site, producing
  byte-identical native output to the inline form. (Aliasing previously
  failed the native build with `Unresolved reference 'app'`; it now
  compiles.)
- **Static attrs → literal OR module-level `const`.** A native-mapped
  static attribute (`<Image src=…>`, `<WebView src=… />` / `html=`, font,
  background, …) accepts an inline string literal OR a **module-level
  `const` string/number/boolean binding** referenced by name:

  ```tsx
  const CHART_URL = "https://x.example/c.png"
  // both emit AsyncImage(url:) / Coil AsyncImage(model=) identically:
  <Image src="https://x.example/c.png" alt="chart" />
  <Image src={CHART_URL} alt="chart" />
  ```

  A `let` (mutable) binding, a non-literal init (`const x = f()`), or a
  component-scope / unknown identifier is NOT resolved — it falls through
  to the normal "needs static" emit path. (Component-scope const +
  transitive `const B = A` resolution are tracked follow-ups.)

**Expressions**
| Shape | Notes |
|---|---|
| literals, identifiers, calls, member access | |
| string / array methods → native idioms | `map` / `filter` / `find` / `findIndex` / `some` / `every` / `reduce` / `sort` / `includes` / `indexOf` / `join` / `concat` / `flatMap` (arrays) and `startsWith` / `endsWith` / `split` / `repeat` / `trim` / `toUpperCase` / `toLowerCase` (strings) lower to the platform idiom — e.g. `join`→`joined(separator:)` / `joinToString`, `findIndex`→`(firstIndex(where:) ?? -1)` / `indexOfFirst` (JS `-1`-sentinel preserved), `split`→`components(separatedBy:)` / native split. `slice` / `replace` / `Number()` are NOT yet lowered (type-ambiguity / first-vs-all / coercion subtleties — tracked). |
| `xs[i]` index access | arrays/lists; element-typed inference |
| `+ - * / %`, comparisons, `&& \|\|`, `!`, ternary | `===`/`!==` coalesce to native `==`/`!=`; `/` is always float division (→ `Double`, like JS) |
| `**` (exponent) | → `pow(Double(a), Double(b))` (Swift) / `Math.pow((a).toDouble(), (b).toDouble())` (Kotlin); result is `Double` (matches JS), right-associative |
| `& \| ^ << >>` (bitwise) | Swift keeps the symbols; Kotlin uses the infix functions `and`/`or`/`xor`/`shl`/`shr` (compound operands parenthesized to preserve JS grouping). `>>>` is NOT lowered |
| `a?.b` (optional chaining) | **member access** lowers to native `?.` (and **propagates** down the chain — `a?.b.c` → `a?.b?.c` — required for Kotlin). Optional **index** (`a?.[i]`) and optional **call** (`f?.()`) are NOT supported (they diverge per target) |
| `Math.<fn>(…)` | `abs/min/max/floor/ceil/round/sqrt/cbrt/pow/hypot/sin/cos/tan/atan2/log/log10/log2/exp/trunc` + `PI`/`E`/`random` lower to native (Foundation free fns on Swift; java.lang.Math / kotlin.math with `.toDouble()` arg coercion on Kotlin). `Math.sign` lowers on Kotlin only (no clean Foundation equivalent — Swift tracked) |
| `{cond && <View/>}` conditional render | lowers to `if cond { view }` (SwiftUI) / `if (cond) { view }` (Compose) — the same form `<Show>` emits; parens are seen through so `{cond && (a ? <X/> : <Y/>)}` lowers too. (A value-only `a && b` with no view RHS stays a value expression.) |
| `x++` / `x--` | value-position degrades to `x + 1` (side effect dropped — warning); statement-position composes via `.update` |
| `sig.set(v)` / `sig.update(fn)` | lower to native assignment; `.update` needs a single-param expression-body arrow whose param isn't shadowed |
| object literals | construct declared structs / synthesized types; an **anonymous all-scalar-literal** object (`{ id: 1, name: 'a' }`) matching no declared struct **synthesizes** a module-scope struct (Swift `Codable`) / data class (Kotlin), deduped by field name:type shape (`__Obj0`, …; cross-target names align) — replaces the old labelled-tuple emit (illegal single-field Swift tuple; tuple key-paths break `ForEach(id:)`). A **non-literal field whose type INFERS to a scalar** (`{ id: count(), name: label() }` — signal reads) now synthesizes too; only a non-scalar (array / nested-object / typeRef) field keeps the tuple emit. `{ ...t, field: v }` single-spread becomes Swift IIFE-copy / Kotlin `.copy(...)` |
| array literals + spreads | `[...xs, item]` → concatenation |
| zero-param accessor arrows in condition positions | unwrap to their body (`when={() => cond()}`) |

**Types**
| Shape | Notes |
|---|---|
| `string` / `number` / `boolean`, arrays, `T \| null` | **`number` infers `Int` OR `Double`** from literal evidence: a fractional literal (`12.5`) → `Double`, integer literals stay `Int`. Applies to scalars (`signal(12.5)` / `signal<number>(12.5)`), struct fields, array elements (`signal([12.5, 8.3])` → `[Double]`), and `reduce` seeds (a Double accumulation flips the seed to `0.0`). Whole-number elements in a Double array render `15.0` so `[Double]` / `List<Double>` stays homogeneous. |
| `type X = {...}` / interfaces | become Codable structs / @Serializable data classes |
| string-literal unions | become native enums |
| anonymous object types in props | synthesize named structs (`UserPage`+`params` → `UserPageParam`); declared structs win on structural match |
| generics beyond the recognized hooks' `<T>` slots | NOT supported |

**Statements (function/computed bodies)**: `const`/`let` (incl.
**multi-declarator** `const a = 1, b = 2` → split into one decl each),
`return`, `if`/`else`, **`for…of` / `while` / `switch`** (→ native `for in` /
`while` / `switch`·`when`), and **reassignment** — `t = t + x`, `+= -= *= /=
%=` (a reassigned local is emitted `var`, not `let`/`val`, automatically), so
an imperative loop body can accumulate. C-style `for (let i = 0; …; …)` is NOT
in v1 — use `for…of` over an array or `while`. **Array** destructuring of
locals (`const [a, b] = xs`) is NOT in v1 — the binding is silently dropped,
leaving later references undefined; index explicitly (`xs()[0]`) instead.
(**Object** destructuring `const {a, b} = obj` DOES lower — body-local,
component-param, and hook-result forms, e.g. `const { data } = useFetch(url)`.)
`<For>` remains the idiom for RENDERING a list; these loops are for
in-body data work.

**JSX**: the 15 canonical primitives, `<For each by>`, `<Show when>`,
`<Suspense fallback>`, `<ErrorBoundary fallback>`, `<KeepAlive when>`,
`<Transition show>`, `<Modal open>`, `<RouterProvider>`/`<RouterView>`/
`<Link>`. `data-testid` flows to `accessibilityIdentifier` / `testTag`
(containers gain the queryability semantic automatically). The
cross-platform a11y vocabulary on `@pyreon/primitives` lowers the same
way on every target — write the neutral prop once:
`accessibilityLabel="…"` → web `aria-label` / SwiftUI
`.accessibilityLabel(…)` (the VoiceOver name) / Compose
`.semantics { contentDescription = … }` (the TalkBack name); and
`accessibilityHidden` → web `aria-hidden="true"` / SwiftUI
`.accessibilityHidden(true)` / Compose `.clearAndSetSemantics { }`
(clears the node + subtree from the a11y tree — `clearAndSetSemantics` is
stable in the targeted Compose 1.7 BOM, vs the experimental
`invisibleToUser()`); and `accessibilityRole` (`"button"` / `"image"` /
`"header"` — the values that map 1:1 to every target's role model) → web
`role="button"`/`"img"`/`"heading"` / SwiftUI
`.accessibilityAddTraits(.isButton / .isImage / .isHeader)` / Compose
`.semantics { role = Role.Button / Role.Image }` (and `heading()` for
headers). Component children must be JSX or value
expressions (auto-wrapped in `Text`).

**Module scope**: `let`/`const` primitives (non-reactive on native),
type aliases, the recognized factory calls. Module-scope `signal()` is
NOT lowered — declare signals inside components or stores.

### Consuming compiler diagnostics

The parser warnings introduced by Round-1 (#1094 — `Icon` / `Image` /
`Link` missing required props) and Round-2 (#1099 — `Press` without
`onPress`, native `Link prefetch={…}`, `Stack/Inline/Layer
align="<typo>"`) flow through the same `result.warnings` channel as
every other parse warning. Read them programmatically from the
compiler:

```ts
import { transform } from '@pyreon/native-compiler'

const { code, warnings } = transform(source, { target: 'swift' })
for (const w of warnings) console.warn(w)
```

The shipped surface today is the `pyreon-native build` CLI, which
aggregates warnings per file and prints them to stderr as
`[pyreon-native] N warning(s):` after each build. There is **no
Vite-plugin / LSP / editor-diagnostic surfacer yet** — that's an
explicit Phase 6 DX follow-up. The package is `@pyreon/native-compiler`
(private / workspace-only); consumers using `transform()` directly are
the path until a public published API lands.

## WebView host — embedding web-only-rich viz (charts / flow)

Some libraries are **structurally web-only** — `@pyreon/charts` (ECharts),
`@pyreon/flow` (elkjs), `@pyreon/code` (CodeMirror), `@pyreon/document`
(pdfmake) all wrap a browser-runtime engine and cannot compile to SwiftUI
/ Compose. The multiplatform answer is a **hybrid**: a substantial native
shell (the canonical primitives) with the heavy viz hosted in a
`<WebView>` — `WKWebView` on iOS, Android `WebView`, an `<iframe>` on web.

```tsx
<NativeIOS><WebView html={CHART_HTML} /></NativeIOS>
<NativeAndroid><WebView html={CHART_HTML} /></NativeAndroid>
<Web>{/* render the chart inline — it's already web */}</Web>
```

`<WebView>` takes `html` (inline page — `loadHTMLString` / `srcdoc`) OR
`src` (a LOCAL bundled asset — preferred, policy-safe — or a remote URL).
For App Store / Play Store review, prefer bundled local assets so the viz
is app content, not remote code.

### The two-way data bridge

A hosted chart isn't a static screenshot — it stays live in BOTH
directions, over a **unified JS API** the runtime wires per platform:

**Forward — native → page (`data`).** Pass a signal; the runtime
JSON-encodes it and PUSHES it into the already-loaded page as
`window.__pyreonData`, firing a `pyreondata` event, WITHOUT reloading — so
the chart updates in place (no flicker, zoom/animation preserved). A
`data`-only change never reloads; only an `html`/`src` change does.

```tsx
const metrics = signal<Metric[]>([…])
<WebView html={CHART_HTML} data={metrics()} />
```

```js
// In the hosted page:
function render() { const d = window.__pyreonData || []; /* draw d */ }
window.addEventListener('pyreondata', render); render()
```

**Reverse — page → native (`onMessage`).** The page calls
`window.pyreonPostMessage("payload")`; the string is delivered to the
native `onMessage` callback, so a tap inside the chart drives a native
signal. (iOS `WKScriptMessageHandler`; Android a main-thread-marshalled
`@JavascriptInterface`; web the parent defines `window.pyreonPostMessage`
on the iframe.) The payload is a plain string — JSON-stringify structured
data and parse it in the handler.

```tsx
const selected = signal('')
<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />
<Text>Selected: {selected()}</Text>
```

```js
// In the hosted page — a tapped bar reports back:
bar.addEventListener('click', () => window.pyreonPostMessage(region))
```

Together these make a webview-hosted chart a first-class interactive
member of the native app: live native data flows in, user events flow
back out. `examples/native-analytics` is the canonical end-to-end proof
(native data table + aggregation + an interactive WebView chart from ONE
`.tsx`). **Web caveat:** both bridges are same-origin / `srcdoc` only — a
cross-origin remote `src` can't be reached from the parent frame (the
native targets reach remote content via `evaluateJavaScript` / the script
handler).

## DX surfaces on native (honest scope)

The "one source" promise extends to **WRITING** the source, not just
shipping it. Pyreon ships several developer-experience surfaces;
which of them work on the native targets is a structural question —
some are pre-emit (source-level) and target-agnostic, others depend
on the Pyreon runtime that PMTC erases when emitting Swift/Kotlin.

### Works on native source (✅ — same DX as web)

These analyze your `.tsx` source BEFORE PMTC emits anything, so they
are target-agnostic by construction.

- **Reactivity Lens** (`analyzeReactivity` from `@pyreon/compiler`).
  Returns the same structural reactivity facts (`reactive` /
  `reactive-prop` / `static-text` / `hoisted-static`) and footgun
  findings (`props-destructured`, `signal-write-as-call`, …) on a
  PMTC source file as it does on a web-only source. Verified end-to-
  end against a `<Stack>`/`<Button>`/`<Text>` Counter fixture: the
  Lens correctly flags `const { x } = props` as `footgun` and the
  signal reads inside `{count()}` as `reactive`, identical to the
  output it produces for the same shape in a web component.
- **`@pyreon/lint` rules + `pyreon doctor`**. Every rule runs on the
  source AST; none of them load the runtime. `pyreon/no-window-in-
  ssr`, `pyreon/signal-write-as-call`, `pyreon/props-destructured`,
  `pyreon/no-iterate-children-without-resolve`, the islands audit,
  the SSG audit, the test-environment audit — all surface the same
  findings on a PMTC source file. The `pyreon/no-window-in-ssr`
  rule is actually MORE valuable on native sources (the emit target
  literally has no `window`), but the surface is the same.
- **Static type checking + `audit-types`**. `tsc --noEmit` and the
  typed-but-unimplemented gate care only about TypeScript types, so
  they work identically across targets.
- **MCP tools** (`validate`, `get_api`, `get_pattern`,
  `get_anti_patterns`, `get_changelog`, `audit_test_environment`,
  `audit_islands`). All operate on source / repo metadata, not the
  runtime. An AI agent driving a native source through `validate`
  gets the same anti-pattern catalog as it would for a web file.

### Web-only by structural design (❌ — not coming to native)

These surfaces depend on the Pyreon RUNTIME (signal registry,
effect graph, devtools hook). PMTC erases that runtime when it
emits to SwiftUI `@State` / Compose `mutableStateOf` — there is no
Pyreon-side data structure to introspect on a native target;
SwiftUI's `_GraphInputs` and Compose's `SlotTable` own the reactive
graph end-to-end. This is **structural-infeasibility**, not
engineering effort.

- **LPIH** (Live Program Inlay Hints — fire counts / re-run
  counters at the source line). Requires the dev-mode
  `@pyreon/reactivity` registry (`activateReactiveDevtools` +
  `getFireSummaries`) to be alive in the running app. On native
  builds the entire reactivity package is tree-shaken — the
  `signal(0)` call you wrote is emitted as `@State var count = 0`,
  there is no Pyreon-side wrapper to count fires. **Use on web
  during development; the inlay hints don't reach a running iOS /
  Android build, by design.**
- **Devtools panel** (the Chrome extension under
  `packages/tools/devtools`). Connects to
  `window.__PYREON_DEVTOOLS__` (a hook attached by
  `@pyreon/runtime-dom`'s `installDevTools()`) to walk the
  component tree, highlight nodes, watch signals fire. On a native
  build there is no `window`, no `__PYREON_DEVTOOLS__`, and no
  Pyreon component tree — SwiftUI and Compose own the view
  hierarchy. For native runtime debugging use **Xcode's View
  Hierarchy Debugger** (iOS) and **Android Studio's Layout
  Inspector** (Android); they're the native equivalents of the
  Pyreon devtools panel and they work on the emitted view tree
  directly.
- **Pyreon HMR + `@pyreon/vite-plugin` signal-preserving HMR**.
  Web-only by construction (Vite is a web dev server). iOS uses
  Xcode's incremental compile + Simulator hot-reload; Android uses
  Gradle's incremental build + Compose's `LiveLiterals` /
  `recomposeHighlighter`. These are platform-native HMR equivalents
  — there is no shared Pyreon HMR surface across targets.

### Partial — works for the source-level part, runtime part is on the platform

- **`pyreon-native build` warnings** (the silent-drop diagnostic
  surface from PRs #1235 / #1441). Pre-emit warnings about dropped
  `useLoaderData()` reads, dropped `<Suspense fallback>` props,
  etc. ARE shown — they're emitted at compile time, surfaced via
  `transform()` `result.warnings` and the CLI's
  `[pyreon-native] N warning(s)` stderr aggregation. The actual
  runtime-state debugging is per-target (Xcode + Android Studio
  above).

If you adopt PMTC for a real production app, the practical
workflow is: write + debug source-level concerns on web (Lens,
devtools, HMR, lint) where the iteration loop is fastest; verify +
debug native-runtime concerns on the device with the platform's
own tooling. Same `.tsx`, two debugging surfaces.


## Verifiable today (compile contract)

- **Web**: `@pyreon/runtime-dom` renders any Pyreon JSX. Full ecosystem available.
- **iOS**: `pyreon-native build --target=ios --source=./src --out=./generated` produces typecheck-clean Swift (verified via `swiftc -parse` in the `native-validate` CI). The **opt-in** `native-device` workflow additionally runs `xcodegen` + `xcodebuild` to compile the full example app on a real Xcode/Simulator SDK, then `xcodebuild test` boots the iPhone 15 Simulator + runs `PyreonTodoMVCUITests` to assert `accessibilityIdentifier("todo-app")` renders within 30s.
- **Android**: `pyreon-native build --target=android --source=./src --out=./generated` produces typecheck-clean Kotlin (verified via `kotlinc + Compose stubs`). The same opt-in `native-device` workflow runs `gradle assembleDebug` against the real Android toolchain, then boots a Pixel-6 emulator (API 33, google_apis, x86_64, via `reactivecircus/android-emulator-runner`) + runs `gradle connectedCheck` which executes `TodoAppInstrumentedTest`'s `composeRule.onNodeWithTag("todo-app").assertIsDisplayed()`.

### TodoMVC reference walkthrough (locally verified, June 2026)

The `examples/native-todomvc-{web,ios,android}` apps form the **canonical proof** of the single-source contract. The shared TodoApp source (`examples/native-todomvc-ios/src/TodoApp.tsx`) renders on all three targets without modification.

**Web** (a real running app in the browser):

```bash
cd examples/native-todomvc-web
bun run build      # 88 modules → 35 KB JS bundle, 13 KB gzipped
bun run dev        # http://localhost:5173/
```

Then in a browser: type, hit Enter, toggle, filter All/Active/Completed, click Clear completed. Zero console errors. Web fully working.

**iOS Swift emit**:

```bash
bash examples/native-todomvc-ios/scripts/build.sh
# → examples/native-todomvc-ios/generated/TodoApp.swift
```

The emitted file opens with the import preamble (`import SwiftUI` / `PyreonRuntime` / `PyreonRouter`) and emits idiomatic SwiftUI: `@PyreonAppStorage("pyreon-todomvc:todos")` for persistence, `@State` for local signals, `VStack(spacing: 8)` / `HStack` for layout, `TextField(..., text: $draft)` with `.onSubmit { addTodo() }`, `ForEach` keyed by id, `Button(action:)`. The `data-testid="todo-app"` JSX attribute becomes `.accessibilityIdentifier("todo-app")` so the same string works on the iOS UI test.

Verify it compiles against the real SwiftUI SDK:

```bash
swiftc -typecheck \
  -target arm64-apple-macos14.0 \
  packages/native/runtime-swift/Sources/PyreonRuntime/*.swift \
  packages/native/router-swift/Sources/PyreonRouter/*.swift \
  examples/native-todomvc-ios/generated/TodoApp.swift
# → exit 0 (zero errors)
```

**Android Kotlin emit**:

```bash
bash examples/native-todomvc-android/scripts/build.sh
# → examples/native-todomvc-android/app/src/main/kotlin/com/pyreon/generated/TodoApp.kt
```

The emitted file opens with `package com.pyreon.generated`, the Compose import preamble (`androidx.compose.runtime.*` / `material.*` / `kotlinx.serialization.Serializable` / `com.pyreon.runtime.*`), and emits idiomatic Compose: `var todos by rememberPyreonStorage<List<Todo>>(...)`, `var filter by remember { mutableStateOf(Filter.all) }`, `val visible by remember { derivedStateOf { ... } }`, `Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("todo-app"))`, `TextField` with `KeyboardOptions(imeAction = ImeAction.Done)` + `KeyboardActions(onDone = { addTodo() })`, `LazyColumn { items(visible, key = { it.id }) { ... } }`, `Button(onClick = ...)`.

Verify against the framework's `validateKotlin` (same Compose stub set the `validate-kotlin.test.ts` gate uses):

```bash
bun -e "
  import('./packages/native/compiler/src/validate.ts').then(async (m) => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('examples/native-todomvc-android/app/src/main/kotlin/com/pyreon/generated/TodoApp.kt', 'utf8')
    // Strip the package + wildcard imports (the stub set is in default package).
    const stripped = src.split('\n')
      .filter(l => !l.startsWith('package ') && !l.startsWith('import androidx') && !l.startsWith('import kotlinx') && !l.startsWith('import com.pyreon'))
      .join('\n')
    console.log(JSON.stringify(m.validateKotlin(stripped), null, 2))
  })
"
# → { "ok": true }
```

**One source. Three targets. Verified locally** on macOS 14 with Xcode 15 + JDK 21 + Kotlin 2.x.

The runtime packages exist, with one reactive container per data/service hook:

- `@pyreon/native-runtime-swift` — `@PyreonAppStorage` + `PyreonStorage`, `PyreonFetch<T>`, `PyreonForm`, `PyreonPermissions`, `PyreonNetworkStatus` (`@Observable` containers)
- `@pyreon/native-runtime-kotlin` — `rememberPyreonStorage` + the same `PyreonFetch` / `PyreonForm` / `PyreonPermissions` / `PyreonNetworkStatus` / `PyreonClipboard` containers (Compose `MutableState`); PR #1104 closed the last untested service by adding the Kotlin `PyreonClipboard` test suite, bringing every container to parity test coverage
- `@pyreon/native-router-{swift,kotlin}` — `PyreonRouter` (path stack, `matchPath`, `params`, `loaderData`) + `useNavigate` / `useParams` / `useLoaderData` hooks

## Reference

- Compiler source: `packages/native/compiler/src/` — `emit-swift.ts` / `emit-kotlin.ts` per-target emit; `canonical-primitives.ts` shared name maps + token resolution
- Native runtime packages: `packages/native/runtime-swift/`, `packages/native/runtime-kotlin/`
- Web runtime: `packages/core/primitives/src/web/` — all 15 canonical primitives
- Example apps: `examples/native-todomvc-{ios,android,web}/` + `examples/native-router-demo-{ios,web}/` — `native-router-demo-ios` ships a full XcodeGen host shell (#1105) so `bash scripts/build.sh` produces a buildable Xcode project, not a source-only stub. `examples/native-todomvc-web/README.md` was also corrected (#1106) so it no longer references a fictional `src/TodoApp.tsx` — the one-source contract (Phase E3) keeps the shared TodoApp source in `examples/native-todomvc-ios/src/`.
- Real-device build gate: `.github/workflows/native-device.yml` (opt-in via the `native-device` label / dispatch)
- CLAUDE.md "PMTC Multi-Target Architecture" section — agent-context summary of the layered model + roadmap
