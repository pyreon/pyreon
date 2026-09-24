# Pyreon multiplatform (PMTC)

The Pyreon Multi-Target Compiler (`packages/native/compiler`) emits SwiftUI and Jetpack Compose from one `.tsx` source.

## What "done" means

- The emit vocabulary is complete: every canonical primitive maps to both targets.
- That does not mean every package works on native, that every capability is device-proven, or that the output is production-ready.
- The one authoritative score is the capability matrix in `docs/src/content/docs/multiplatform.md`. `scripts/check-multiplatform-matrix.ts` recomputes the headline from the table. Never quote a number from memory; edit the table and paste the headline the gate prints.

## Reality checks

1. **PMTC compiles a declarative TypeScript subset.** Outside it, the usual outcome is a named warning, not a silent drop. The live per-construct status is in `docs/src/content/docs/multiplatform.md`; do not copy the list here.
   - Lowered and typechecked on both toolchains: local object/array literals, destructuring, `Map`/`Set`, common control flow, template literals, optional chaining, fractional math, string/array methods, `JSON.stringify` (emitted structs are `Codable` / `@Serializable`).
   - A top-level object-shape `interface X { … }` becomes a struct/data class, like a `type X = { … }` alias (`parse.ts:tryStructFromInterface`).
   - Warned by name: `enum`, `class`, generic or `extends` interfaces, `try`/`throw`, `JSON.parse`, regex literals, JSX spread on a primitive, computed object keys, call-argument spreads.
   - Remaining gaps: generics in logic, and shapes outside the tested corpus.
2. **Validation gates.**
   - Per PR on Linux: `validateSwiftWithStubs` (`src/validate.ts`) runs `swiftc -typecheck` against `src/swift-stubs.ts`, and Kotlin is compiled against `src/kotlin-stubs.ts`. The Swift stub strips the emit's `import SwiftUI`/`PyreonRuntime`/`PyreonRouter`, drops any stub type the emit itself declares (so a user component named `Toggle` does not collide), and mirrors SwiftUI's generic constraints exactly (`animation<V: Equatable>`). Locked by `src/tests/validate-swift-typecheck.test.ts`.
   - Stubs must mirror the real library surface exactly. A superset stub hides real breakage; a narrower one rejects correct code.
   - These run in the `Validate emitted Swift + Kotlin` job of `.github/workflows/native-validate.yml` (`bun run --filter='@pyreon/native-compiler' test` with `PYREON_REQUIRE_NATIVE_VALIDATE=1`). Verdicts are content-addressed and cached (`src/validate-cache.ts`).
   - Real SDK: the `Validate emitted Swift (real-SDK typecheck, macOS)` job runs the same suite on macOS, where the `it.skipIf(!isSwiftUIAvailable())` blocks execute. It adds cover for types a stub cannot fake (the `@Observable` / Observation surface).
3. **Device proof.** `iOS — xcodebuild (Simulator SDK)` and `Android — gradlew assembleDebug` (`.github/workflows/native-device.yml`) and the macOS real-SDK job are required checks. Only the gated example apps get this treatment; a capability no gated app uses ships on stub-typecheck strength. `scripts/check-native-primitive-coverage.ts` reports primitives no example uses.
4. **Rich web packages' JSX hosts** (flow's `<Flow>`, code, document, virtual, the CSS-in-JS ui-system) are web-only by architecture: PMTC compiles your source, not npm libraries. Their state/engine halves increasingly cross (`createFlow` → `PyreonFlowState`, the charts plot engine, dnd sortable state, table state, query). Check the manifest `multiplatform` tier before calling a package web-only.

## Four-layer shared-code model

- **L0** `signal()` / `computed()` / `effect()` run identically (map to `@State` / `mutableStateOf`).
- **L1** custom pure-logic hooks are fully shared.
- **L2** service-backed hooks (`useStorage`, `useRouter`, `useFetch`, `usePermissions`, …) lower to native runtime classes.
- **L3a** `@pyreon/primitives`: one canonical name per concept, `onPress` everywhere, tokens-first styling, no responsive props.
  - Visual primitives: `Stack`, `Inline`, `Layer`, `Scroll`, `Spacer`, `Text`, `Heading`, `Image`, `Video`, `Icon`, `Button`, `Press`, `Link`, `Field`, `Toggle`, `Modal`.
  - Also `Audio` (non-visual, no `controls` prop), `Transition`/`TransitionGroup`, and `WebView` (hosts a web-only component natively with a message bridge).
- **L3b** `@pyreon/elements`: web-only, rocketstyle/styler-coupled.
- **L4** escape hatches `<NativeIOS>`, `<NativeAndroid>`, `<Web>`.

Tag maps: `packages/native/compiler/src/canonical-primitives.ts` (`SWIFT_NAMES` / `KOTLIN_NAMES`); `Audio` and the transitions have dedicated emitters.

On web, `@pyreon/primitives` runs the real DOM implementation. On iOS/Android PMTC intercepts the JSX and emits native code, so the import is only a type anchor.

## Accessibility props

`accessibilityLabel` / `accessibilityHidden` lower on all three targets: web `aria-label` / `aria-hidden`; iOS `.accessibilityLabel(…)` / `.accessibilityHidden(true)`; Android `semantics { contentDescription }` / `clearAndSetSemantics {}`. Emit is locked in `packages/native/compiler/src/tests/canonical-primitives.test.ts`. `accessibilityLabel` is device-asserted (native-counter XCUITest); `accessibilityHidden` is not, because XCUITest string queries do not reliably reflect it.

## Native runtime code

- `@pyreon/native-runtime-swift` / `-kotlin` hold only the shared core (reactivity, HTTP, JSON, tokens, the chart engine/canvas). `@pyreon/native-router-swift` / `-kotlin` hold the router (`PyreonRouter`, guards, nested routes, per-route loaders).
- Each cross-platform package ships its own native code beside `src/`, under `native/{swift,kotlin}/`, declared by the `pyreon.native` field in its `package.json` (for example `packages/fundamentals/storage/native/`, `packages/fundamentals/hooks/native/`). `pyreon-native wire` aggregates them into an app build.
- `scripts/check-native-cosource.ts` typechecks and smoke-runs the co-located sources; every Kotlin file must be declared or listed in `kotlinSdkOnly`.

## Lifecycle auto-start

`scripts/check-native-lifecycle-wiring.ts` (`LIFECYCLE_REGISTRY`) classifies every native container that exposes `start()`/`connect()`. An unclassified container fails the gate, because one nobody starts ships frozen at its initial value.

- Auto-started on both targets (Swift `.onAppear`/`.task`, Kotlin `LaunchedEffect(Unit)`): network status (`useOnline`), app state, push, crash reporter, WebSocket. `useFetch` auto-fetches and `onMount(fn)` bodies run on mount.
- Manual, each with a documented reason: geolocation, payments, audio/video playback, audio recording, device motion. Call `.start()`/`.connect()` from an effect or a user action.
- `useDatabase` and `useMap` are ready on init; `useAuth.beginSignIn()` is user-triggered. `useSecureStorage` warns and is dropped.

## Device-only gotchas

Compile-time checks cannot catch these:

1. `<Suspense>` / `<ErrorBoundary>` compile to an inline conditional read in the component body. The `@Observable` / recomposition read must be in `body` to be tracked; passing it through a wrapper struct argument does not track.
2. A Swift `.task` needs a stable-identity host. A fetch-bearing component's body is wrapped in a concrete `ZStack` (`emit-swift.ts`, `_hasFetchDecl`). On a transparent `Group { if … }`, SwiftUI moves the task onto the branch and cancels and restarts it on every flip, so the fetch never settles. Kotlin's `LaunchedEffect(Unit)` sibling needs no equivalent.
3. `<Inline>` is a non-wrapping Compose `Row` (overflows) but a shrinking SwiftUI `HStack`. A group that fits on iOS can clip on Android; stack vertically or keep groups narrow. Treat "tap works on iOS, times out on Android" as Row overflow first.
4. A SwiftUI presentation modifier (`.sheet`) on `EmptyView()` never presents. `<Modal>` anchors to `Color.clear.frame(width: 0, height: 0)`.
5. A Compose `performClick` does not scroll. On a `<Scroll>` page call `performScrollTo()` before interacting with a node that may be past the fold.
