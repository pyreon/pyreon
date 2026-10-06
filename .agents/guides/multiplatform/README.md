# Pyreon multiplatform (PMTC)

The Pyreon Multi-Target Compiler (`packages/native/compiler`) emits SwiftUI and Jetpack Compose from one `.tsx` source.

## What "done" means

- The emit vocabulary is complete: every canonical primitive maps to both targets.
- That does not mean every package works on native, that every capability is device-proven, or that the output is production-ready.
- The one authoritative score is the capability matrix in `docs/src/content/docs/multiplatform.md`. `scripts/check-multiplatform-matrix.ts` recomputes the headline from the table. Never quote a number from memory; edit the table and paste the headline the gate prints.

## Reality checks

1. **PMTC compiles a declarative TypeScript subset.** Outside it, the usual outcome is a named warning, not a silent drop. The live per-construct status is in `docs/src/content/docs/multiplatform.md`; do not copy the list here.
   - Lowered and typechecked on both toolchains: local object/array literals, destructuring, `Map`/`Set`, common control flow, template literals, optional chaining, fractional math, string/array methods, `JSON.stringify` (emitted structs are `Codable` / `@Serializable`; it lowers to `PyreonJSON.stringify` / `PyreonJson.stringify`, which write the web's exact bytes — source key order, ECMAScript number layout, `JSON.stringify` escaping — proven by `native-json-stringify-parity.test.ts`).
   - A top-level object-shape `interface X { … }` becomes a struct/data class, like a `type X = { … }` alias (`parse.ts:tryStructFromInterface`).
   - Optional narrowing: the branch a nil / truthiness test narrowed reads an unwrapped binding (Swift `if let` / `guard let` / `.map { } ??`; Kotlin binds signals, computeds and data-class `var` fields, which it cannot smart-cast). One classifier for both targets: `src/optional-narrowing.ts`.
   - Render props, function-as-children and `VNodeChild` slots lower to a generic `@ViewBuilder` closure (the struct gains a `<XContent: View>` parameter) / a `@Composable` lambda; JSX-returning functions with annotated params become view functions (`src/render-slots.ts`). An OPTIONAL render prop is an optional closure plus one initializer per subset of optional slots, the omitted generics pinned to `EmptyView` (Swift; past three it falls back to required and warns); block-bodied callbacks and accessor returns lower when they are `const`s, early-return branches and a final `return` (`planViewBlock`).
   - Warned by name: `enum`, `class`, generic or `extends` interfaces, `try`/`throw`, `JSON.parse`, regex literals, JSX spread on a primitive, computed object keys, call-argument spreads.
   - Remaining gaps: generics in logic, and shapes outside the tested corpus.
2. **Validation gates.**
   - Per PR on Linux: `validateSwiftWithStubs` (`src/validate.ts`) runs `swiftc -typecheck` against `src/swift-stubs.ts`, and Kotlin is compiled against `src/kotlin-stubs.ts`. The Swift stub strips the emit's `import SwiftUI`/`PyreonRuntime`/`PyreonRouter`, drops any stub type the emit itself declares (so a user component named `Toggle` does not collide), and mirrors SwiftUI's generic constraints exactly (`animation<V: Equatable>`). Locked by `src/tests/validate-swift-typecheck.test.ts`.
   - Stubs must mirror the real library surface exactly. A superset stub hides real breakage; a narrower one rejects correct code.
   - These run in the `Validate emitted Swift + Kotlin` job of `.github/workflows/native-validate.yml` (`bun run --filter='@pyreon/native-compiler' test` with `PYREON_REQUIRE_NATIVE_VALIDATE=1`). Verdicts are content-addressed and cached (`src/validate-cache.ts`).
   - Real SDK: the `Validate emitted Swift (real-SDK typecheck, macOS)` job runs the same suite on macOS, where the `it.skipIf(!isSwiftUIAvailable())` blocks execute. It adds cover for types a stub cannot fake (the `@Observable` / Observation surface).
3. **Device proof.** `iOS — xcodebuild (Simulator SDK)` and `Android — gradlew assembleDebug` (`.github/workflows/native-device.yml`) and the macOS real-SDK job are required checks. Only the gated example apps get this treatment; a capability no gated app uses ships on stub-typecheck strength. `scripts/check-native-primitive-coverage.ts` reports primitives no example uses.
4. **Streams.** `useStream` over `@pyreon/http/stream` (`openEventStream` / `openNdjsonStream` through a same-file endpoint) lowers to the co-located `PyreonStream` runtime (`packages/fundamentals/http/native/`). Its wire parsers are the part that must agree with the web byte-for-byte, so they sit between BEGIN/END markers that `native-stream-parser-parity.test.ts` extracts verbatim, compiles, and diffs against the web parser over a seeded corpus (with every chunking, invalid UTF-8, BOMs, CR/LF mixes); the same test runs the reconnect + `Last-Event-ID` loop of the web, Swift and Kotlin clients against one scripted local server. The loop also locks control-only IDs (including an empty-id reset), filtered-event recovery and terminal 204 responses with `onEnd` enabled. Control state belongs to the parser, before event delivery: commit the ID at a blank line, apply retry immediately, and reset failure counts before filtering. Two transport facts it surfaced: `URLSession.AsyncBytes.lines` drops empty lines (which dispatch SSE events), so the Swift runtime splits raw bytes; and URLSession reports a chunked body cut off by a graceful close as a CLEAN end (fetch and `HttpURLConnection` report an error), so the Swift loop reads an event left half-built at EOF as a dropped connection. `enabled` and an inline `onEvent` lower (both into the harness: `enabled` joins the `.task(id:)` / `DisposableEffect` key and `false` calls `idle()`), and so does a runtime `json` body (serialized per run, also keyed). Device-proven on both platforms by the tasks app's `/streams` screen against `examples/native-tasks/scripts/stream-server.ts` (port 8791, started by `native-device.yml`; Android reaches it via `adb reverse`), which destroys the socket mid-event and echoes the resume header back into the payload.
5. **Rich web packages' JSX hosts** (flow's `<Flow>`, code, document, virtual, the CSS-in-JS ui-system) are web-only by architecture: PMTC compiles your source, not npm libraries. Their state/engine halves increasingly cross (`createFlow` → `PyreonFlowState`, the charts plot engine, dnd sortable state, table state, query). Check the manifest `multiplatform` tier before calling a package web-only.

## Four-layer shared-code model

- **L0** `signal()` / `computed()` / `effect()` run identically (map to `@State` / `mutableStateOf`).
- **L1** custom pure-logic hooks are fully shared.
- **L2** service-backed hooks (`useStorage`, `useRouter`, `useFetch`, `usePermissions`, …) lower to native runtime classes.
- **L3a** `@pyreon/primitives`: one canonical name per concept, `onPress` everywhere, tokens-first styling, no responsive props.
  - The 17 canonical primitives: `Stack`, `Inline`, `Layer`, `Scroll`, `Spacer`, `Text`, `Heading`, `Image`, `Audio`, `Video`, `Icon`, `Button`, `Press`, `Link`, `Field`, `Toggle`, `Modal` (`Audio` is non-visual, no `controls` prop). The set is `CANONICAL_PRIMITIVES` in `canonical-primitives.ts`, drift-locked against the package exports.
  - Also exported, outside the canonical set: `Transition`/`TransitionGroup`, and `WebView` (hosts a web-only component natively with a message bridge).
- **L3b** `@pyreon/elements`: web-only, rocketstyle/styler-coupled.
- **L4** escape hatches `<NativeIOS>`, `<NativeAndroid>`, `<Web>`.

Tag maps: `packages/native/compiler/src/canonical-primitives.ts` (`SWIFT_NAMES` / `KOTLIN_NAMES`); `Audio` and the transitions have dedicated emitters.

On web, `@pyreon/primitives` runs the real DOM implementation. On iOS/Android PMTC intercepts the JSX and emits native code, so the import is only a type anchor.

## Accessibility props

`accessibilityLabel` / `accessibilityHidden` lower on all three targets: web `aria-label` / `aria-hidden`; iOS `.accessibilityLabel(…)` / `.accessibilityHidden(true)`; Android `semantics { contentDescription }` / `clearAndSetSemantics {}`. Emit is locked in `packages/native/compiler/src/tests/canonical-primitives.test.ts`. `accessibilityLabel` is device-asserted (native-counter XCUITest); `accessibilityHidden` is not, because XCUITest string queries do not reliably reflect it.

## Native runtime code

- `@pyreon/native-runtime-swift` / `-kotlin` hold only the shared core (reactivity, HTTP, JSON, tokens, the chart engine/canvas). `@pyreon/native-router-swift` / `-kotlin` hold the router (`PyreonRouter`, guards, nested routes, per-route loaders).
- Pure-state hook metadata (`useCounter` / `useToggle`) is component-scoped. Kind, bounds and reset seed live in one declaration map built by `pureStateBindings(c.decls)`, cleared at component exit; unrelated components may reuse a local binding name and may appear in either order. Never collect component-local metadata into a file-wide name map. `native-pure-state-scope.test.ts` compares standalone and combined output and compiles mixed-hook collisions through both toolchains.
- Each cross-platform package ships its own native code beside `src/`, under `native/{swift,kotlin}/`, declared by the `pyreon.native` field in its `package.json` (for example `packages/fundamentals/storage/native/`, `packages/fundamentals/hooks/native/`). `pyreon-native wire` aggregates them into an app build.
- The project audit (`auditNative` / `detectNativePatterns`, behind `pyreon doctor --check-native` and MCP `validate`) lives in `packages/native/compiler/src/native-audit.ts`, served as `@pyreon/native-compiler/audit`, and reads the one generated `WEB_ONLY_PACKAGES` set in `web-only-packages.ts`. `check-multiplatform-tier` regenerates that set and FAILS if a second generated copy appears anywhere else. `@pyreon/cli` and `@pyreon/mcp` load it lazily as an optional peer and skip loudly when it is absent.
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
6. Hardware-accelerated `WebView`s on the SwiftShader emulator (CI's `-gpu swiftshader_indirect`) intermittently leave the WHOLE window unpainted. Every Compose node still reports `displayed=true`, but captures of the root and UiAutomation screenshots are pure white. Pixel waits then fail on whichever chart comes first ("gal-datazoom showed no red bar", "gal-map did not paint"), and the failure reads like a bug in that one chart. Diagnose from the ROOT capture: if the whole window is white, the chart host is not the cause. A longer wait does not help. Instrumented tests on a screen with WebViews set `PyreonWebViewRendering.softwareLayer = true` in `@Before`. Measured on API 33 with fresh boots: 5 of 10 runs failed on hardware WebViews, 0 of 10 with the flag. `-gpu swangle_indirect` did not fix it.

## Hooks are matched by import binding

PMTC lowers a `useX` call by what the name is BOUND to, not by the bare name. `hook-binding.ts` runs before any recognizer: an aliased framework hook (`import { useOnline as useNet } from '@pyreon/hooks'`) is lowered under its canonical name; a same-named function the author declared, or a hook imported from a non-`@pyreon/` module, is renamed `<name>_` so no recognizer claims it, and a foreign import reports why. A name that is neither imported nor declared still lowers (snippets omit imports). PMTC has no module graph, so a local re-export of a framework hook is not seen through: import it from `@pyreon/hooks`.

## Service descriptors

A *plain* service container is a hook whose whole lowering is "hold one runtime container for the component's lifetime" (`useShare`, `useLinking`, `useHaptics`, `useNotifications`, `useBiometrics`, `useImagePicker`, `useFilePicker`, `useCamera`): no arguments, no reactive state, no read rewrite, no lifecycle, every call a member method that flows through unchanged. These are DATA in `packages/native/compiler/src/services.ts`, not code in three files.

A `ServiceDescriptor` has three core fields: `hook` (what the author calls), `swift` (the initialiser expression placed after `@State private var <id> = `) and `kotlin` (declaration lines, joined with `\n  `, where `{id}` is the Kotlin identifier and a line carries its own extra indentation). The parser lowers any listed hook to the one generic declaration `{ kind: 'service', name, hook }` and both emitters render it from the descriptor; `NATIVE_LOWERED_HOOKS` derives these hooks from `SERVICES`.

### Satellite vocabulary

A service that is more than a bare container is still ONE entry: the satellite behaviours are small optional data fields on the same descriptor, resolved through one per-component `binding name -> descriptor` map (`bindServices`, reset at the start of every component — never file-scoped).

| Field | Meaning | Swift | Kotlin |
| --- | --- | --- | --- |
| `accessorReads` | members the web reads as accessors (`clip.copied()`) that the container stores as properties | parens drop: `clip.copied` | parens drop; `.value` appended when the member is also in `kotlinState` |
| `callRead` | the property a BARE call of the container reads (`net()`, `state()`, `s().top`) | `net.isOnline` | `net.isOnline.value` when in `kotlinState`, else bare (`s.insets`) |
| `kotlinState` | members that are Compose `MutableState` | no rewrite (`@Observable`) | member read AND zero-arg call read append `.value` |
| `lifecycle` | a reactive monitor that MUST be started or the hook renders its initial value forever (the never-wired class) — `'start'` or `'start-stop'` | `.onAppear { x.start() }` (+ `.onDisappear { x.stop() }`), body hosted in a stable `ZStack` | none at emit time: the descriptor's Kotlin line IS the self-installing `rememberPyreon<Container>()` factory |
| `destructure` | `const { copy } = useX()` aliases onto the container | | |
| `optionalFields` | members the runtimes declare optional (typed nullable so the interpolation/condition lowering fires) | | |
| `legacyKind` | the pre-descriptor decl kind; `moduleTag` hashes a service decl as that kind so synthesized struct names (`__Obj0_<hash>`) do not churn when a hook becomes a descriptor | | |

The Swift lifecycle modifiers are emitted from ONE loop over `SERVICES` (so their relative order is the order of the entries in `SERVICES`, not declaration order). `scripts/check-native-lifecycle-wiring.ts` derives from it: an AUTO registry entry names a `hook`, and the gate fails when that descriptor has no `lifecycle`, when its Kotlin line is not the self-installing factory, when the Swift loop is gone, or when a descriptor declares a `lifecycle` that no registry entry classifies. Do not weaken it.

To add a service, add ONE entry to `SERVICES` (plus the Swift/Kotlin runtime container and the stub entries it needs). Nothing else changes: no `DeclIR` variant, no parser branch, no emit branch, no hook-list edit. `tests/services.test.ts` holds each hook's exact emit shape per target, the accessor/callRead/kotlinState tables (typed by hand from the code the descriptors replaced) and the descriptor invariants; extend its tables.

Still hand-written, with the reason: `useDatabase` (its `insert` object-literal lowering and Swift argument labels are call LOGIC, not data), `useWebSocket` (constructor URL taken from the call, synthesized auto-connect), and the struct-typed generics (`useAuth<T>`, `useFetch<T>`, `useStream<T>`).

## Package-owned plugins

A library owns its native lowering as a plugin file in its OWN package; the compiler core knows no library. The package ships `native/plugin.ts` (built to ESM) whose default export is a `CompilerPlugin` with `services` (plain service descriptors, see above), and declares it in `package.json`: `"pyreon": { "native": { "plugin": "native/plugin.mjs", "modules": ["@acme/camera"] } }`. `pyreon-native build|check` discovers it from the app's declared dependencies and loads it only when the source imports one of `modules` (default: the package name). Rules: one owner per hook (a second claim is a load-time error naming both plugins — the app removes one); a plugin whose name equals a `builtIn` plugin replaces it silently (identity by name), an explicit `--plugin` of the same name wins over a discovered one; `requires` orders passes and a missing requirement or a cycle is a load-time error. Prove a plugin with `@pyreon/native-compiler/testing` (`testNativePlugin`) and `pyreon-native plugins --verify` (every service type is declared in the package's own sources). The registry exists on `compiler.services`/`context.services` but the parser and emitters still read the module-level `SERVICES` table until they are threaded through it, so a plugin-owned hook is not yet lowered end to end.

## Compiler extension boundary

`createCompiler({ plugins })` owns a fixed, versioned registration set. Extend
shared `CompilerModule` IR with synchronous `transformIR`/`prepareIR` callbacks,
or register a distinct backend target. Source transformations run before all
runtime preparation; synthesized module identity excludes external declarations.
Charts use a built-in preparation plugin and parsed import declarations.

Keep plugin registration instance-owned; do not add process-global registries,
source regex import detection, or emitter-specific positional arguments to the
driver. Custom callbacks receive isolated IR. Read filename, target and fonts from the
invocation snapshot throughout the pipeline; callbacks can mutate caller-owned
options through closures and must not change synthesized type namespaces. Legacy emitter state remains
scoped and is not generally reentrant; hooks execute outside emission. Prove
extensions with real Swift/Kotlin typechecking and cross-call isolation tests.
Native CLI build/check/watch/LSP accept the same explicit local ESM `--plugin`
list. Protocol and shared IR are experimental API v1; incompatible changes
require a version bump. See `packages/native/compiler/README.md`.
