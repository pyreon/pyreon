# Pyreon Multi-Target — Architectural Plan

> **Status**: APPROVED. Phase A in flight; Phases B–E queued for follow-up arcs.
> **Owner**: PMTC team
> **Companion docs**: `docs/docs/multiplatform.md` (end-user-facing), `CLAUDE.md` (agent context summary).

## Context

PMTC (Pyreon Multi-Target Compiler) currently emits typecheck-clean SwiftUI + Compose from one `.tsx` source — Goal A (compile contract) is 100%. But the SHARED-CODE story is incomplete:

1. **JSX vocabulary is SwiftUI-flavored.** TodoMVC uses `<VStack>`/`<HStack>`/`<TextField>`. iOS accepts them natively; Kotlin maps via `SWIFTUI_TO_COMPOSE_LAYOUT_NAMES`; web has no story.
2. **Web isn't a first-class compile target.** Same `.tsx` could in theory run on web via `@pyreon/runtime-dom`, but `<VStack>` doesn't render as anything on web.
3. **Runtime packages exist per-platform (`@pyreon/native-runtime-{swift,kotlin}`)** but are scoped to storage only. No shared abstraction story for router, network, gestures.
4. **`@pyreon/elements` exists as a web-only primitive layer** (`Element`/`Text`/`List`/`Overlay`/`Portal`) built on rocketstyle + styler + unistyle. It's the rich web layer — it does NOT and SHOULD not try to be multi-platform (rocketstyle assumes DOM, styler emits CSS).
5. **Style + event vocabulary diverges per platform.** `onClick` vs `action:` vs `onClick { }`; CSS strings vs SwiftUI modifiers vs Compose Modifier.

The user's framing: *"the best way would be to have as much as possible same code for every platform and then compiled differently. We want fundamentally the easiest DX. Don't copy anyone."*

The opportunity: design a CANONICAL multi-platform primitive vocabulary in a NEW package, layered above platform-native runtimes — letting ONE `.tsx` source compile to THREE targets (web, iOS, Android) with maximum reuse and platform-idiomatic output.

## Architectural Vision — Four-layer model

```text
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Platform escape hatches (per-platform, opt-in)     │
│   <NativeIOS>{...Swift JSX...}</NativeIOS>                  │
│   <NativeAndroid>{...Compose JSX...}</NativeAndroid>        │
│   <Web>{...DOM JSX...}</Web>                                │
├─────────────────────────────────────────────────────────────┤
│ Layer 3b: Web-rich primitives (web-only, EXISTS)            │
│   @pyreon/elements — Element/Text/List/Overlay/Portal       │
│   Built on rocketstyle/styler/unistyle.                     │
│   Stays as-is. NOT cross-platform.                          │
│                                                             │
│ Layer 3a: Canonical multi-platform primitives (NEW, SHARED) │
│   @pyreon/primitives — ~16 primitives                       │
│   <Stack> <Inline> <Layer> <Scroll> <Spacer>                │
│   <Text> <Heading> <Image> <Icon>                           │
│   <Button> <Press> <Link>                                   │
│   <Field> <Toggle> <Modal>                                  │
│   + existing control-flow: <For> <Show> <Match> <Suspense>  │
│   Cross-platform by design.                                 │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Platform-abstracted services (shared API per-impl) │
│   useStorage / useRouter / useFetch / usePermissions        │
│   Pattern: { ServiceBackend interface + factory + concrete } │
│   Established by @pyreon/storage; extends to router/etc.    │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Pure-logic (100% shared)                           │
│   Custom hooks (useDebounce, useToggle, useControllableState)│
├─────────────────────────────────────────────────────────────┤
│ Layer 0: Reactive core (100% shared)                        │
│   signal() / computed() / effect() / batch() / onCleanup()  │
│   PMTC maps to @State (Swift), mutableStateOf (Kotlin)      │
└─────────────────────────────────────────────────────────────┘
```

**Critical architectural decision: split Layer 3 into 3a (canonical multi-platform) + 3b (web-rich).**

- `@pyreon/primitives` (NEW) — semantic, minimal, cross-platform. For apps targeting multiple platforms.
- `@pyreon/elements` (EXISTS, stays as-is) — rocketstyle-powered, responsive-prop-rich, DOM-coupled. Web-only.

Web-only apps use either or both. Cross-platform apps use `@pyreon/primitives` only.

No naming collision because imports are explicit:

```tsx
import { Stack, Text, Button } from '@pyreon/primitives'    // multi-platform
import { Element, Text as RichText } from '@pyreon/elements' // web-only rich
```

In practice cross-platform apps never import elements; web-only apps never need primitives. The two coexist without confusion.

## Canonical primitive vocabulary (Layer 3a)

### Design principles

- **Semantic names, not platform names.** `<Stack>` not `<View>` / `<VStack>` / `<div>`. Name describes what the developer wants.
- **Short common names.** `<Inline>` is sugar for `<Stack direction="row">` — common usage gets its own primitive.
- **Pyreon idioms preserved.** Existing `<For>` / `<Show>` / `<Match>` control flow stays.
- **One canonical event name per concept.** `onPress` everywhere (not `onClick` on web + `action:` on iOS).
- **Tokens-first styling.** `padding={4}` / `gap={2}` resolve through theme; no raw pixels.
- **Minimal first; expand from real-world usage.** 16 primitives initially. Add more (`<Grid>`/`<Sheet>`/`<Drawer>`/etc.) when real apps demand.

### Initial vocabulary (16 primitives)

#### Layout (5)

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Stack direction?="column"\|"row" gap? align? justify?>` | `<div style="display:flex">` | `VStack` / `HStack` | `Column` / `Row` |
| `<Inline gap?>` (sugar for `<Stack direction="row">`) | flex row | `HStack` | `Row` |
| `<Layer>` (z-stack) | `position:relative` + abs | `ZStack` | `Box` |
| `<Scroll axis?>` | `overflow:auto` | `ScrollView` | `Column(verticalScroll)` |
| `<Spacer />` | `flex:1` | `Spacer()` | `Spacer(weight=1)` |

#### Content (4)

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Text>` | `<span>` | `Text` | `Text` |
| `<Heading level={1\|...6}>` | `<h1>`..`<h6>` | `Text(.font(...))` | `Text(style=...)` |
| `<Image src alt fit?>` | `<img>` | `Image` / `AsyncImage` | `AsyncImage` |
| `<Icon name>` | `<svg>` | `Image(systemName:)` | `Icon` |

#### Interaction (3)

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Button onPress>` (styled CTA) | `<button>` | `Button` | `Button` |
| `<Press onPress>` (un-styled) | `<div onClick role=button>` | `Button { } no chrome` | `Box(clickable)` |
| `<Link to>` (router-aware) | `<a>` via @pyreon/router | `NavigationLink` | `Box(clickable + navigate)` |

#### Input (3)

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Field value onChangeText kind?>` | `<input>` | `TextField` / `SecureField` | `TextField` |
| `<Toggle value onChange>` | `<input type=checkbox>` | `Toggle` | `Switch` |
| `<Modal open onClose>` | `<dialog>` | `.sheet(isPresented:)` | `Dialog` |

#### Control flow (unchanged — already canonical)

`<For each by>` `<Show when fallback>` `<Match>` `<Switch>` `<Suspense>` `<ErrorBoundary>` `<Dynamic>` `<Portal>`

### Deferred (not in initial 16)

`<Grid>`, `<Sheet>`, `<Drawer>`, `<Tabs>`, `<List items>` (virtualized), `<Slider>`, `<Pick>`, `<Date>`, `<Video>`, `<SafeArea>`, `<Divider>`, `<Spinner>`, `<Progress>`, `<KeyboardAvoidingView>`. Each adds when a real app needs it — premature inclusion is technical debt.

## Style system (v1)

Tokens-first, no responsive in v1, no animation in v1.

| Prop | Type | Web | iOS | Android |
|------|------|-----|-----|---------|
| `padding` / `margin` / `gap` | number (theme.space index) OR `"sm"\|"md"\|"lg"` | inline style px | `.padding()` | `Modifier.padding()` |
| `color` | `"text"\|"surface"\|"primary"\|...` | inline `color` | `.foregroundColor()` | `color = theme...` |
| `background` | theme key | inline `backgroundColor` | `.background()` | `Modifier.background()` |
| `align` | `"start"\|"center"\|"end"` | flex `alignItems` | `.frame(alignment:)` | `horizontalAlignment` |
| `justify` | `"start"\|"center"\|"end"\|"between"` | flex `justifyContent` | `Spacer()` insertion | `Arrangement` |
| `radius` | `"none"\|"sm"\|"md"\|"lg"\|"full"` | `border-radius` | `.cornerRadius()` | `Modifier.clip(RoundedCornerShape)` |

**No responsive props in v1.** Web/iOS/Android have wildly different responsive models (media queries / size classes / configuration changes). Unifying them is a multi-week design problem. Apps that need responsive web use `@pyreon/elements` directly (it has full responsive prop support).

**No animation primitives in v1.** Same reasoning.

**Escape hatch**: `<NativeIOS style={...}>` / `<Web className="...">` for per-platform overrides.

## Event model

| Concept | Pyreon canonical | Web | iOS | Android |
|---------|------------------|-----|-----|---------|
| Tap | `onPress` | `onClick` | `action:` | `onClick =` |
| Long press | `onLongPress` | `oncontextmenu` polyfill | `.onLongPressGesture` | `.combinedClickable(onLongClick)` |
| Text change | `onChangeText` | `onInput` | text binding | `onValueChange` |
| Submit | `onSubmit` | `<form onSubmit>` | `.onSubmit { }` | `keyboardActions onDone` |
| Focus / blur | `onFocus` / `onBlur` | same | `.focused()` | `onFocusChanged` |
| Appear / disappear | `onAppear` / `onDisappear` | `IntersectionObserver` | `.onAppear` | `LaunchedEffect` |

Hover events deferred (mobile platforms don't have hover).

## Per-platform import-resolution

The DX-critical question: how does `import { Stack } from '@pyreon/primitives'` resolve on each target?

**Web**: `@pyreon/primitives` is a real npm package with real implementations. `Stack` is a `ComponentFn` that renders DOM. Standard module resolution.

**iOS / Android (via PMTC)**: The PMTC compiler INTERCEPTS JSX with `<Stack>` etc. at compile time and emits platform-native code BEFORE the runtime is involved. The `@pyreon/primitives` import IS still present in source — but the JSX never calls into it. Effectively the import is a TYPE-ONLY anchor for the JSX runtime.

In practice: the same source file works on all three targets. Per-target handling:

- **Web**: pass through normally; `<Stack>` calls the `@pyreon/primitives` `Stack` function.
- **iOS / Android**: PMTC compiler maps `<Stack>` to native code in `emit-{swift,kotlin}.ts`'s `canonical-primitives.ts` table.

The iOS / Android compiler emit currently special-cases `For` / `Show` / `Text` / `Button`. Phase B PRs grow that table to cover all 16 primitives.

## Router architecture (Phase C)

Single canonical API surface mirrors `@pyreon/router`'s web shape (`RouterProvider` / `RouterView` / `Link` / `useNavigate` / `useParams`). Per-platform runtime adapters implement it.

```tsx
// Same source — all three targets
import { RouterProvider, RouterView, Link } from '@pyreon/router'
import { Stack, Inline, Text } from '@pyreon/primitives'

function App() {
  return (
    <RouterProvider router={router}>
      <Stack>
        <Inline gap={2}>
          <Link to="/">Home</Link>
          <Link to="/users/123">User</Link>
        </Inline>
        <RouterView />
      </Stack>
    </RouterProvider>
  )
}
```

Adapters:

- Web (existing): `@pyreon/router` — History API / hash routing
- iOS: `@pyreon/native-router-swift` (NEW) — wraps SwiftUI `NavigationStack`
- Android: `@pyreon/native-router-kotlin` (NEW) — wraps AndroidX Navigation `NavHost`

## Compiler emit architecture

The PMTC compiler grows ONE new responsibility: **the canonical-primitive emit table**.

`packages/native/compiler/src/canonical-primitives.ts` — single source of truth:

```ts
export const CANONICAL_PRIMITIVES = {
  Stack:   { swift: 'VStack', kotlin: 'Column', propTransform: stackPropMap },
  Inline:  { swift: 'HStack', kotlin: 'Row',    propTransform: stackPropMap },
  Layer:   { swift: 'ZStack', kotlin: 'Box',    propTransform: layerPropMap },
  Text:    { swift: 'Text',   kotlin: 'Text',   propTransform: textPropMap },
  // ... 16 entries
}
```

`propTransform` per primitive maps canonical props (`onPress`, `padding`, etc.) to per-target prop names + value translations.

`emit-swift.ts` `emitSwiftJsx()` and `emit-kotlin.ts` `emitKotlinJsx()` consult this table BEFORE falling through to generic emit. Generic emit (unknown JSX tag) stays as today — that's the user-defined-component path.

Existing `SWIFTUI_TO_COMPOSE_LAYOUT_NAMES` becomes redundant (deprecated, replaced by canonical-primitives table). The TodoMVC migration in Phase E removes `<VStack>` / `<HStack>` source references the old mapping table existed to handle.

## Migration path

Additive, not breaking.

- `@pyreon/primitives` is a NEW package. Adding it breaks NOTHING.
- Existing `<VStack>` / `<HStack>` / `<TextField>` in PMTC source continue to work via the existing per-target emit (SwiftUI: native acceptance; Kotlin: `SWIFTUI_TO_COMPOSE_LAYOUT_NAMES` mapping). No regression.
- Migration of `examples/native-todomvc-{ios,android}/src/TodoApp.tsx` to canonical vocab is a SEPARATE PR (Phase E). After migration, the SAME source ALSO works on web (Phase D).
- After migration is proven, deprecation warnings on SwiftUI-flavored tags. Removal in a major-version bump LATER.

## Implementation roadmap (10 PRs, 5 phases)

### Phase A — Foundation (canonical primitives + web runtime) [3 PRs]

| PR | Scope | Files | Tests |
|----|-------|-------|-------|
| **A1** Architectural plan as docs | This doc + `CLAUDE.md` section + `docs/docs/multiplatform.md` | `.claude/plans/multiplatform-architecture.md`, `CLAUDE.md`, `docs/docs/multiplatform.md` | Doc-only |
| **A2** `@pyreon/primitives` package + types | New workspace package. Type definitions for 16 primitives. No runtime yet. | `packages/core/primitives/` (new) | TypeScript compile-only |
| **A3** Web runtime — 6 proof-of-concept primitives | Implement `<Stack>` / `<Inline>` / `<Text>` / `<Button>` / `<Press>` / `<Field>` on web. Token resolution via existing `@pyreon/styler`. | `packages/core/primitives/src/web/*.tsx` | Real-Chromium browser smoke + happy-dom unit |

Rest of the 16 primitives ship in follow-up PRs as the canonical vocab grows from real-world usage.

### Phase B — PMTC emit (iOS + Android) [2 PRs]

| PR | Scope | Files |
|----|-------|-------|
| **B1** Canonical primitive emit — iOS | `canonical-primitives.ts` table + `emitSwiftJsx()` integration. | `packages/native/compiler/src/canonical-primitives.ts`, `emit-swift.ts` |
| **B2** Canonical primitive emit — Android | Parallel to B1 for Kotlin/Compose. Deprecate `SWIFTUI_TO_COMPOSE_LAYOUT_NAMES`. | `packages/native/compiler/src/emit-kotlin.ts`, `kotlin-stubs.ts` |

### Phase C — Router runtimes (iOS + Android) [2 PRs]

| PR | Scope | Files |
|----|-------|-------|
| **C1** `@pyreon/native-router-swift` | `RouterProvider` / `RouterView` / `Link` / `useNavigate` / `useParams` on top of `NavigationStack`. | `packages/native/router-swift/` (new) |
| **C2** `@pyreon/native-router-kotlin` | Parallel for AndroidX Navigation `NavHost`. | `packages/native/router-kotlin/` (new) |

### Phase D — Web target for PMTC + cross-platform example [2 PRs]

| PR | Scope | Files |
|----|-------|-------|
| **D1** Web example dir consuming SHARED source | `examples/native-todomvc-web/` mirrors iOS/Android. Vite + `@pyreon/primitives`. Reads from shared source. | `examples/native-todomvc-web/` (new) |
| **D2** `verify-modes` cell for web target | CI matrix cell that builds + asserts. | `scripts/verify-modes.ts` |

### Phase E — TodoMVC migration to canonical vocab [1 PR]

| PR | Scope | Files |
|----|-------|-------|
| **E1** Migrate TodoApp.tsx | Replace `<VStack>` → `<Stack>`, `<HStack>` → `<Inline>`, `<TextField>` → `<Field>`, etc. | `examples/native-todomvc-ios/src/TodoApp.tsx` (shared source) |

After Phase E: ONE TodoApp.tsx source, THREE example apps (web, iOS, Android), all consuming it, all typecheck-clean, all running.

## Critical files / patterns to reuse

- **`packages/fundamentals/storage/src/`** — `StorageBackend` interface pattern is the blueprint for every Layer-2 service.
- **`packages/native/compiler/src/emit-swift.ts:emitSwiftJsx` + `emit-kotlin.ts:emitKotlinJsx`** — dispatcher entry points; canonical-primitive table dispatch slots in here BEFORE generic-emit fallthrough.
- **`packages/native/compiler/src/kotlin-stubs.ts`** — Compose stub harness.
- **`packages/core/runtime-dom/src/template.ts`** — `_tpl()` / `_bind()` fast path; web primitives compile down to this (no perf regression).
- **`packages/native/runtime-swift/Sources/PyreonRuntime/PyreonStorage.swift`** — established SwiftPM pattern; router-swift follows.
- **`packages/native/runtime-kotlin/scripts/verify-kotlin.ts`** — CI-friendly kotlinc validation; reuse for router-kotlin.
- **`packages/ui-system/elements/src/`** — REFERENCE only; canonical primitives do NOT depend on elements (different architectural tier).

## Open architectural questions (resolved)

| Question | Resolution |
|----------|-----------|
| New package vs extend `@pyreon/elements`? | NEW package `@pyreon/primitives`. Elements stays web-only-rich; primitives is multi-platform-minimal. Different architectural layers. |
| Naming: RN-style (`<View>`) or Pyreon-native (`<Stack>`)? | Pyreon-native. Semantic names, not platform names. User said "don't copy anyone". |
| Inline emit vs runtime wrapper in compiler? | Inline emit. Matches current compiler shape; runtime packages stay focused on STATEFUL services (storage, router). |
| Style system scope for v1? | Tokens-first, no responsive, no animation. Web apps that need responsive use `@pyreon/elements` directly. |
| Initial primitive count? | 16 named in spec; 6 implemented in Phase A3. Rest extend on real-world demand. |
| Per-platform import resolution? | Compiler intercepts on iOS/Android (import is type-anchor only). Web runs the real implementation. Same source. |

## Out of scope (deferred to future arcs)

- **Layer 4 escape hatches** — `<NativeIOS>` / `<Web>` defined in spec but no concrete implementation. Real apps don't need them for TodoMVC.
- **Responsive style props** — multi-week design challenge. Apps that need responsive web use `@pyreon/elements` directly.
- **Animation primitives** — wait for real-app demand.
- **Form primitives** — `@pyreon/form` exists for web; native form runtime is a separate arc.
- **Real iOS Simulator + Android emulator CI** — Apple-hardware-class blocker, multi-week external infra.
- **Migration of `@pyreon/ui-components`** — out of scope. Those stay web-only on `@pyreon/elements`.
- **Vocab expansion beyond 16** — extended as real apps demand each.
