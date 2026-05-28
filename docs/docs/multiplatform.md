# Multi-Platform Pyreon

> **Status:** PMTC (Pyreon Multi-Target Compiler) is **experimental**. The full **15-primitive canonical vocabulary** now spans all three targets: every primitive has a real web DOM runtime, every primitive emits typecheck-clean SwiftUI (iOS), and the Jetpack Compose (Android) emit is completing via the P2.2 series (layout + content + Modal). Validation today is **compile-time** (`swiftc -parse` / `kotlinc` against Compose stubs); an **opt-in** real-toolchain build gate (the `native-device` workflow) additionally compiles the full example apps on real Xcode/Gradle. End-to-end Simulator/Emulator **launch-and-render** is the next milestone.

## The pitch

Write your app once. Run it on the web, iOS, and Android — each rendered with the platform's native primitives, each typecheck-clean against the platform's compiler.

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

Same source. Three idiomatic, typecheck-clean outputs.

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

The cross-platform vocabulary. 16 semantic primitives designed for **fundamentally the easiest DX** across all three targets:

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
| Real-device CI | Compile the full apps on real Xcode/Gradle (`native-device` workflow), then boot Simulator/Emulator + assert render | 🟡 build gate landed (opt-in); launch-and-render next |
| Router parity | loaders / guards / nested routes / redirects / typed `useParams<T>` on native | ⏳ planned |
| Data + forms | `useFetch` (URLSession / ktor), `<Form>`/`useForm` on native | ⏳ planned (per-service native ports) |
| Lifecycle | `<Suspense>` / `<ErrorBoundary>` / `<Transition>` on native | ⏳ planned |
| DX | `pyreon create-multiplatform` scaffold, asset pipeline | ⏳ planned |

## Verifiable today (compile contract)

- **Web**: `@pyreon/runtime-dom` renders any Pyreon JSX. Full ecosystem available.
- **iOS**: `pyreon-native build --target=ios --source=./src --out=./generated` produces typecheck-clean Swift (verified via `swiftc -parse` in the `native-validate` CI). The **opt-in** `native-device` workflow additionally runs `xcodegen` + `xcodebuild` to compile the full example app on a real Xcode/Simulator SDK. End-to-end Simulator launch-and-render is the next step.
- **Android**: `pyreon-native build --target=android --source=./src --out=./generated` produces typecheck-clean Kotlin (verified via `kotlinc + Compose stubs`). The same opt-in `native-device` workflow runs `gradle assembleDebug` against the real Android toolchain. End-to-end emulator launch-and-render is the next step.

The runtime packages exist:

- `@pyreon/native-runtime-swift` — `@PyreonAppStorage` Codable property wrapper + `PyreonStorage` helpers
- `@pyreon/native-runtime-kotlin` — `rememberPyreonStorage` Composable + pluggable `PyreonStorageBackend`

## Reference

- Compiler source: `packages/native/compiler/src/` — `emit-swift.ts` / `emit-kotlin.ts` per-target emit; `canonical-primitives.ts` shared name maps + token resolution
- Native runtime packages: `packages/native/runtime-swift/`, `packages/native/runtime-kotlin/`
- Web runtime: `packages/core/primitives/src/web/` — all 15 canonical primitives
- Example apps: `examples/native-todomvc-{ios,android,web}/` + `examples/native-router-demo-{ios,web}/`
- Real-device build gate: `.github/workflows/native-device.yml` (opt-in via the `native-device` label / dispatch)
- CLAUDE.md "PMTC Multi-Target Architecture" section — agent-context summary of the layered model + roadmap
