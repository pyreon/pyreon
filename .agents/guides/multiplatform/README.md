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

A *plain* service container is a hook whose whole lowering is "hold one runtime container for the component's lifetime" (`useShare`, `useLinking`, `useHaptics`, `useNotifications`, `useBiometrics`, `useImagePicker`, `useFilePicker`, `useCamera`): no arguments, no reactive state, no read rewrite, no lifecycle, every call a member method that flows through unchanged. These are DATA, owned by `@pyreon/hooks` (`packages/fundamentals/hooks/src/native-plugin.ts`) and carried — through the compiler's generated copy `built-in-services.generated.ts` — by the built-in `@pyreon/hooks` plugin (`plugins/services.ts`) into each compiler instance's service registry — not code in three files. `services.ts` keeps the descriptor vocabulary and derives `SERVICES` from the generated copy.

A `ServiceDescriptor` has three core fields: `hook` (what the author calls), `swift` (the initialiser expression placed after `@State private var <id> = `) and `kotlin` (declaration lines, joined with `\n  `, where `{id}` is the Kotlin identifier and a line carries its own extra indentation). The parser lowers any listed hook to the one generic declaration `{ kind: 'service', name, hook }` and both emitters render it from the descriptor; the parser's lowered-hook set (`nativeLoweredHooks()`) is the hand-written list plus every registered service hook, derived once per registry.

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

The Swift lifecycle modifiers are emitted from ONE loop over the registered services (`allServices()`, so their relative order is registry order — built-ins first, in the hooks plugin's declaration order, then plugins — not declaration order). `scripts/check-native-lifecycle-wiring.ts` derives from it: an AUTO registry entry names a `hook`, and the gate fails when that descriptor has no `lifecycle`, when its Kotlin line is not the self-installing factory, when the Swift loop is gone, or when a descriptor declares a `lifecycle` that no registry entry classifies. Do not weaken it.

To add a built-in service, add ONE entry to the `services` of `packages/fundamentals/hooks/src/native-plugin.ts`, run `bun scripts/gen-native-builtin-plugins.ts` (plus the Swift/Kotlin runtime container and the stub entries it needs). Nothing else changes: no `DeclIR` variant, no parser branch, no emit branch, no hook-list edit. `tests/services.test.ts` holds each hook's exact emit shape per target, the accessor/callRead/kotlinState tables (typed by hand from the code the descriptors replaced) and the descriptor invariants; extend its tables.

Still hand-written, with the reason: `useDatabase` (its `insert` object-literal lowering and Swift argument labels are call LOGIC, not data), `useWebSocket` (constructor URL taken from the call, synthesized auto-connect), and the struct-typed generics (`useAuth<T>`, `useFetch<T>`, `useStream<T>`).

## Package-owned plugins

A library owns its native lowering as a plugin file in its OWN package; the compiler core knows no library. **`@pyreon/hooks` is the first library to do this for real**: `packages/fundamentals/hooks/src/native-plugin.ts` (exported as `@pyreon/hooks/native-plugin`, built to `lib/native-plugin.js`, declared as `pyreon.native.plugin` + `modules`) is the SOURCE OF TRUTH for the 23 platform-service hooks. It imports only the plugin TYPE (`import type { CompilerPlugin } from '@pyreon/native-compiler'`), so hooks has no runtime dependency on the compiler. To let a zero-config `transform()` lower these hooks with no library installed, the compiler keeps a GENERATED copy — `packages/native/compiler/src/built-in-services.generated.ts`, written by `scripts/gen-native-builtin-plugins.ts` (the same pattern as the generated web-only package list) and registered as the `builtIn` plugin named `@pyreon/hooks`. An app whose installed `@pyreon/hooks` is newer has the library's plugin discovered and it replaces that built-in by name. The declaration order is preserved (never sorted): it is the Swift lifecycle-modifier order. Two gates keep it honest, both in `validate-fast`: `gen-native-builtin-plugins --check` (the copy is stale against the library) and `check-native-plugin-types` (every Swift/Kotlin type the plugin names is declared in the library's `native/` dirs or the shared runtimes — no phantom capability; bisect-verified by renaming one type). **Adding a library plugin** = write `src/native-plugin.ts`, add the `./native-plugin` export + `pyreon.native.{plugin,modules}`, and — only if the compiler must lower it with nothing installed — extend the generator and add the output to the boundary ratchet's `generated` list. The package ships `native/plugin.ts` (built to ESM) whose default export is a `CompilerPlugin` with `services` (plain service descriptors, see above) and/or `elements` (JSX element lowerings, below), and declares it in `package.json`: `"pyreon": { "native": { "plugin": "native/plugin.mjs", "modules": ["@acme/camera"] } }`. `pyreon-native build|check` discovers it from the app's declared dependencies and loads it only when the source imports one of `modules` (default: the package name). Rules: one owner per hook (a second claim is a load-time error naming both plugins — the app removes one); a plugin whose name equals a `builtIn` plugin replaces it silently (identity by name), an explicit `--plugin` of the same name wins over a discovered one; `requires` orders passes and a missing requirement or a cycle is a load-time error. Prove a plugin with `@pyreon/native-compiler/testing` (`testNativePlugin`) and `pyreon-native plugins --verify` (every service type is declared in the package's own sources). A plugin's hook is claimed when it is imported from `@pyreon/*` OR from one of the plugin's `modules` (exact or `name/` prefix) — `hook-binding.ts` renames a hook imported from anywhere else, so a plugin that omits `modules` cannot lower a hook from its own package. The registry (`compiler.services`/`context.services`) is the one the parser and both emitters read, so a plugin-owned service and element are lowered end to end; `pyreon-native explain` attributes each to its owning plugin.

## Compiler extension boundary

`createCompiler({ plugins })` owns a fixed, versioned registration set. Extend
shared `CompilerModule` IR with synchronous `transformIR`/`prepareIR` callbacks,
or register a distinct backend target. Source transformations run before all
runtime preparation; synthesized module identity excludes external declarations.
Charts use a built-in preparation plugin and parsed import declarations.

Keep plugin registration instance-owned (see "Instance-owned registries" below); do not add process-global registries,
source regex import detection, or emitter-specific positional arguments to the
driver. Custom callbacks receive isolated IR. Read filename, target and fonts from the
invocation snapshot throughout the pipeline; callbacks can mutate caller-owned
options through closures and must not change synthesized type namespaces. Legacy emitter state remains
scoped and is not generally reentrant; hooks execute outside emission. Prove
extensions with real Swift/Kotlin typechecking and cross-call isolation tests.
Native CLI build/check/watch/LSP accept the same explicit local ESM `--plugin`
list. Protocol and shared IR are experimental API v1; incompatible changes
require a version bump. See `packages/native/compiler/README.md`.

## Instance-owned registries

Every `createCompiler` instance owns one `CompilerRegistries` — `{ services, serviceTables, elements, calls, unlowered }` — built once, at load time, from its built-in + discovered + explicit plugins (replacement-by-name, `requires` order, conflict errors as above). The built-in services and the elements/coolgrid lowerings are `builtIn` plugin objects in `built-in-plugins.ts`; nothing else registers them. Two compilers in one process therefore never share or leak registrations.

The parser and both emitters keep large module-level state, so they are not handed a registry per call. `transform` installs its registries in a SCOPED slot (`active-registries.ts`: `withRegistries(registries, fn)`) for exactly the duration of parse + passes + emit, and restores the previous value in `finally`. It is not global state: outside a `withRegistries` call the slot is empty and lookups fall back to the immutable built-in defaults; a nested `transform` on another compiler sees its own registries and the outer one is back afterwards; a throwing pass or parse never leaves a stale slot. Everything that reads a service or element goes through `registry-lookup.ts` (`serviceFor`, `bindServices`, `allServices`, `findElementLowering`, `isElementLoweringTag`, `isStyleBasePrimitive`, `hookClaimsSource`, `emitPluginDecl`) or `activeRegistries().serviceTables`, whose hook sets are derived once when the registry is built. `parsePyreon(source, filename, { registries })` takes them explicitly for direct callers and tests. The slot is synchronous only — every compiler hook is — and the emitters' own module-level state is still not reentrant (`tests/instance-registries.test.ts` proves slot isolation, restore-on-throw and nesting).

## Element lowering plugins

A library's JSX elements reach native code through `element-lowering.ts`, not through `if (tag === …)` branches in the emitters. An `ElementLowering` is `{ module, tags, retag?, emit?: { swift?, kotlin? }, styleBase? }`:

- **Claim.** Tags are claimed only when the emitters' import guard accepts `(tag, module)` — the same `canAliasIntercept` rule as before: not shadowed by a same-named user / styled / rocketstyle / attrs component, and when the import is tracked it must come from `module` under its own name. `parse.ts` records the import source of every tag any registered lowering names (a scoped sub-path import normalises to the package root), so a plugin's tags get the guard with no parser edit. A user `Row` from `./mine` is never claimed; a renamed import (`Row as R`) is not either, because the claim is on the local tag.
- **Retag.** `retag(el)` returns another element (usually a canonical `Stack`), which re-enters the emitter's dispatcher; returning `undefined` declines and the element goes to `emit`. A retag must not return a tag it claims itself.
- **Emit.** `emit.swift` / `emit.kotlin` receive `(el, ctx: EmitContext)` and return target text. A target without a function falls through to the generic component path. All per-target differences live in these functions, never in the facade.
- **Registration.** A lowering is declared on a plugin: `CompilerPlugin.elements`. `createCompiler` builds one `ElementRegistry` per instance from the built-in, discovered and explicit plugins; a `(module, tag)` pair claimed twice is a load-time error naming both owners (no load-order precedence), except that a discovered plugin replaces a `builtIn` one by name. The built-ins (`plugins/elements.ts`, `plugins/coolgrid.ts`) are `builtIn` plugins registered through exactly that path — there is no private back door and no process-global registry.
- **Boundary.** Element-lowering files in `plugins/` use only `../emit-context`, `../element-lowering` (types), `../plugin` and `../types`, never `emit-swift`, `emit-kotlin` or `parse` (`tests/plugin-boundary.test.ts`).

`EmitContext` (`emit-context.ts`) is the only way a plugin emits. It closes over the emitter's module-level state; each emitter builds one per element (`swiftEmitContext` / `kotlinEmitContext`):

| Facade member | Replaces (in the emitter) | Used by |
| --- | --- | --- |
| `target` | which of `emitSwiftJsx` / `emitKotlinJsx` is running | all |
| `indent` | the `indent` argument threaded through every emit function | coolgrid Col |
| `pad(n?)` | `' '.repeat(n)` indentation strings | coolgrid Col |
| `emit(el, indent?)` | recursive `emitSwiftJsx(el, indent)` / `emitKotlinJsx(el, indent)` | coolgrid Col |
| `staticAttr(el, name)` | `readStaticAttr` / `readStaticAttrKotlin` (literal or const-resolved) | coolgrid Col (Kotlin test id) |
| `stringLiteral(s)` | `swiftStr` / `kotlinStr` | coolgrid Col (Kotlin test id) |
| `ident(name)` | `swiftIdent` / `kotlinIdent` (reserved words escaped) | chart handle declaration |
| `warn(msg)` | `_emitWarnings.push(msg)` | coolgrid Col, chart handle `dispatch` |
| `expr(e, at?)` | `emitSwiftExpr(e, indent)` / `emitKotlinExpr(e, indent)`; `at` defaults to this element's indentation | chart handle `dispatch`; Swift chart hosts |
| `exprAs(type, e, at?)` | `withExpectedType(type, () => emitSwiftExpr(e, indent))` / the Kotlin twin (steers how an object or array literal is typed; `undefined` clears an inherited expectation) | chart handle `dispatch` (`areas`); Swift chart hosts (options structs, annotations) |
| `decls(plugin, type)` | the emitters' per-file names sets (`_chartHandleNames`, `_chartHandleNamesKotlin`) and `isChartHandleDecl` | toy plugin (the chart handle needs no read: its dispatch is receiver-keyed) |
| `state(key, init)` | emitter module-level `let` / `Set` a plugin would otherwise need | toy plugin only (see below) |
| `deferred(key, fallback?)` | the private `__PYREON_HANDLE_SERIES_<name>__` placeholder + its regex | chart handle declaration |
| `resolveDeferred(key, value)` | `_chartHandleSeries.set(name, n)` | `<PlotChart handle>` host (Swift: the plugin; Kotlin: core) |

Extend the facade only when a plugin needs it, and add its row here. A `DeclEmitter` receives this same context (built by `swiftEmitContext(2)` / `kotlinEmitContext(2)`; its `emit` / `staticAttr` are the element ones and a declaration has no element, so they are not useful there).

**Target-only members (`SwiftEmitContext`).** `emit.swift` receives a `SwiftEmitContext` — the shared facade plus the members only the Swift emitter has state for today. A member moves up to `EmitContext` when the Kotlin emitter supplies it too (Kotlin's chart hosts have not moved yet, so none of these has a Kotlin twin). All of them close over `emit-swift.ts` state and were added for the Swift chart hosts (`plugins/charts/swift*.ts`):

| Member | Replaces (in `emit-swift.ts`) | Used by |
| --- | --- | --- |
| `stringAttr(el, name, at?)` | `readStringAttrExpr` — a string attribute as Swift text (a literal, or an interpolation of the expression) | chart title / subtitle / accessibility label |
| `layoutModifiers(el)` | `emitSwiftLayoutModifiers` — the `.padding(…).background(…)` tail for the element's own styling props | chart host tail |
| `action(handler, at?)` | `emitSwiftAction` — an event handler as a closure body | chart `onSelect` |
| `handlerName(handler)` | `resolveFunctionHandler` — the module function an expression refers to | chart `onSelect` / `onBrush` |
| `constExpr(name)` | `_moduleConstExprs.get(name)` — a module-level `const`'s initializer | chart `visualMap` / `dataZoom` / `toolbox` / adapter resolution |
| `colorScope<T>()` | `_chartThemeScope` — the compile-time colour-mode scope enclosing the element, typed by the reader; READ-ONLY | chart theme / palette / entrance |
| `markColorSchemeUsed()` | `_usesColorScheme = true` — makes the component declare `@Environment(\.colorScheme) pyreonColorScheme` | chart theme scheme switch |
| `hostState.declare(line)` / `lines()` / `replaceFrom(start, lines)` / `freshSuffix()` | `_hostStateDecls` (spliced into the struct by `emitSwiftComponent`) and `_swiftHostStateSeq` (per file) | chart `@State` (zoom window, hover, legend page…) and the rename of two hosts' colliding names |

The colour-mode scope is entered and left by the core's own handling of `<PyreonUI mode>`, `<ColorModeProvider>` and `<ChartThemeProvider>` (saved and restored in `finally`, so providers nest and a sibling inherits nothing); a plugin only READS it. A write API would let a plugin leak a scope past its subtree, and the three providers are not chart code.

### Per-component plugin scope (`plugin-scope.ts`)

`decls`, `state`, `deferred` and `resolveDeferred` read ONE `PluginScope` the emitter owns. `emitSwiftComponent` / `emitKotlinComponent` install a fresh scope (built from the component's declarations) when a component starts and restore the previous one when it ends; a file start installs a fresh module scope. So nothing a plugin stores leaks into the next component, the next file or the next compile.

- **`state(key, init)`** — `init` runs the first time `key` is read in the component. The bag is shared by every plugin in the component, so namespace the key with your plugin name. The core never reads it. (`state` has no built-in user in this slice: `decls` removed the chart handle's need for a names set. It is exercised by a third-party toy plugin in `tests/plugin-facade-growth.test.ts`.)
- **`deferred(key, fallback?)` / `resolveDeferred(key, value)`** — `deferred` returns an opaque token to embed in emitted text; after the component body has emitted, the emitter replaces every token with the value resolved for its key. Anything that learns the value later may resolve it (the chart handle's declaration is emitted before the body; the `<PlotChart handle>` host, which counts the series, resolves it). With no `fallback` an unresolved token is an ERROR naming the key — a placeholder must never ship; a handle with no bound chart passes `'0'`. A call outside a component (module scope) is refused. Keys are global strings: namespace them with your plugin name.
- **What core may read.** The core reads a plugin's DECLARATIONS (`PluginScope.declByName`) and may `resolveDeferred`; it cannot read a plugin's `state`. The remaining core consumer of chart-handle information is the Kotlin `<PlotChart handle>` host (`emitKotlinPlotHost`): it asks `declByName(name)` whether the binding IS a handle (`isChartHandleDecl`). The Swift host lives in the plugin: it reads `ctx.decls(CHARTS_PLUGIN_NAME, CHART_HANDLE_TYPE)` and resolves the series-count token with `chartHandleSeriesKey(<ident>)`.


### Worked proof: the Swift chart hosts (`plugins/charts/swift*.ts`)

The built-in `@pyreon/charts` plugin declares ONE element lowering — `{ module: '@pyreon/charts', tags: chartHostTags(), emit: { swift } }` — and the ~2,000 lines of Swift chart emission that used to sit in `emit-swift.ts` now live under `plugins/charts/`: `swift-hosts.ts` (the host dispatch and the table-driven, accessor and frame hosts), `swift-plot.ts` (`<PlotChart>`), `swift-support.ts` (canvas, chrome, theme, formatter, gesture helpers), `swift-facade.ts` (the slot below) and `swift.ts` (the `emit.swift` entry). Emitted Swift is byte-identical (golden corpus plus a transform-capture comparison over every chart test). What this slice settled:

- **Per-target emit.** A lowering with only `emit.swift` leaves Kotlin on the core's own chart branch: the dispatcher reads `lowering.emit?.kotlin`, finds none, and falls through exactly as for an unclaimed tag. `chartHostTags()` (`chart-hosts.ts`) lists every tag `isChartHostTag` accepts, so the two cannot drift (`chart-host-tags.test.ts`).
- **Claim, and what it changed.** The old branch matched the bare tag name; the registry claims it only when `canAliasIntercept(tag, '@pyreon/charts')` accepts it — not shadowed by a user / styled / rocketstyle / attrs component, and imported from `@pyreon/charts` under its own name when the import is tracked. A user's own `Legend` or `Cell` component is therefore no longer mistaken for a chart mark.
- **Dispatch order.** The registry lookup runs before the generic preludes. Two checks that every element used to pass on the way to the chart branch — a spread on a non-component, and a JSX-valued attribute no emitter reads — would have been skipped, silently dropping `<PieChart {...props}>`'s props with no warning. They are now one function (`warnUnreadSwiftAttrs`) called at the top of dispatch AND before a registry `emit` lowering; a `retag` skips it because the element it returns re-enters dispatch and is checked there.
- **The scoped slot.** Threading a context through ~200 emit functions would have rewritten every signature, so `emit.swift(el, ctx)` calls `withSwiftContext(ctx, …)`, which installs `ctx` in a module-scoped slot for exactly that call (saved and restored in `finally`, the discipline `withRegistries` uses) and the moved functions read it through the one `host` object in `swift-facade.ts`. It is not state that survives a call: outside `withSwiftContext` it is empty and `host.*` throws, and a nested element emitted through `ctx.emit` that re-enters the plugin installs its own context and the outer one is back afterwards.
- **What stayed in core, and why.** The `<ChartThemeProvider>` / `<ColorModeProvider>` / `<PyreonUI mode>` scope handling (the owner of the colour-mode scope, shared with non-chart code), `swiftSpreadResolver` (generic object-spread planning that merely sat between chart functions), and everything Kotlin. The grammar desugar re-entry (`<Chart>` → `<PlotChart marks>`) is a plain recursive call inside the plugin, not a trip through dispatch: dispatch would re-run the claim guard against a tag the author never imported.

### Moving a library's emit into a plugin

1. **Inventory the section first.** Extract the contiguous region into a scratch file and list (by AST, not grep) every top-level name it uses that is defined elsewhere in the emitter, and every name it defines that code outside it uses. The first set is the facade you must provide; the second must stay in core or cross the facade. The chart section used 13 outside names: 10 emitter state or generic emit helpers (the facade now supplies them) and 3 (the inference context) that belonged to `swiftSpreadResolver`, a generic neighbour that merely sat in the range and stayed in core. Six names it DEFINES are read by core (`_pluginScope`, `_hostStateDecls`, `_swiftHostStateSeq`, `_chartThemeScope`, `swiftSpreadResolver`, the host entry): the first four are state the core owns, so they stay and are exposed through the facade.
2. **Grow the facade by that list and nothing else**, one row per member in the tables above, each with a real user. State the member's target scope: shared members must have both emitters' equivalents; otherwise put it on the target's context type.
3. **Move mechanically.** Rewrite generic calls to the facade object (`emitSwiftExpr(e, i)` → `host.expr(e, i)`, `_emitWarnings.push` → `host.warn`), keep the functions' own names and bodies, and import only chart-hosts / IR types / the string and identifier helpers — never `emit-*` or `parse`. Split by layer so imports are acyclic (support ← plot ← hosts).
4. **Keep what is not yours.** If the same state is also read by code that stays (the colour scope), expose a documented READ API; do not move the owner.
5. **Prove byte identity at two levels.** The golden corpus (`bun scripts/check-native-golden.ts`; `--dump` parent and branch and `diff -r`) covers what it covers — list which entries exercise the moved code and add golden-only fixtures recorded from PARENT output for any path none does. Then run EVERY test mentioning the library's tags on parent and branch with a temporary capture patch around `emitSwift` / `emitKotlin` that logs `hash(args) hash(result)`, and compare the logs: a test only asserts what its author thought of, the capture compares every input the suite ever compiled.
6. **Bisect the seams.** Break the registry dispatch, each facade member, the scope restore; golden AND the library's tests must fail.

## Code-shaped plugins (`calls` + `decls` + `memberCalls` + `unlowered`)

A service is DATA (a hook with no arguments). When the lowering needs CODE — read an argument, decline a shape it cannot lower, render per-target text — a plugin supplies a recognizer and an emitter (`call-lowering.ts`), and the core never learns the library.

- **Open declaration.** `DeclIR` has one open member, `ExtDecl = { kind: 'ext', plugin, type, name, payload }`. `payload` is a JSON record (`ExtPayload`): the pass pipeline `structuredClone`s the IR, so functions, `undefined`, `NaN`, cycles and class instances are refused at recognition with the plugin named. The core never switches on a third-party `type`; it dispatches by `(plugin, type)`.
- **Recognize.** `CompilerPlugin.calls` is keyed by hook/function name: `(call: CallSite, ctx: ParseContext) => ExtDeclSpec | undefined`, where `ExtDeclSpec = { type, payload? }`. It runs where the parser's by-name branches sit (right after the service lookup in `tryDeclFromVarDeclarator`), so a recognizer that returns `undefined` DECLINES and the parser continues down the same chain as if the plugin were absent. The compiler stamps `plugin` and `name` onto the result (a plugin cannot mis-attribute a declaration or claim another plugin's `type`) and fails loudly if `type` has no emitter.
- **Claim rule.** Identical to services: a name is claimed when imported from `@pyreon/*` or from one of the plugin's `modules` (exact or `name/` prefix). It goes through the same binding resolution (`hook-binding.ts`): a user's own `function createToy()` or an import from somewhere else is NOT the plugin's call. Two plugins claiming one name — or a name that is also a service hook — fail at load, naming both owners. A `(plugin, type)` pair cannot collide: the plugin name is the namespace and a duplicate plugin name is already an error.
- **Emit.** `CompilerPlugin.decls` is keyed by `type`: `DeclEmitter = { swift(decl, ctx), kotlin(decl, ctx): string | string[], legacyKind? }`. Kotlin lines are joined with the same newline-and-indent a built-in multi-line declaration uses. `legacyKind` is for built-ins only: `moduleTag` (the hash that names synthesized structs) hashes a declaration as `{ kind: legacyKind, name, ...payload }`, so moving a closed `kind` into a plugin does not move any emitted name.
- **Registration.** `createRegistries` builds a `CallRegistry` (`registries.calls`) next to the service and element registries; same instance ownership, same conflict rules. `plugins` / `explain` list the recognizers with their owners and declaration types.
- **Expression hook (`memberCalls`).** `CompilerPlugin.memberCalls` is keyed by METHOD name: `{ swift(call, ctx), kotlin(call, ctx) } → string | undefined`, with `call = { receiver: ExtDecl, method, args }`. It claims `<receiver>.<method>(…)` where `<receiver>` is a binding one of THIS plugin's `decls` created, so a plugin never sees a call on any other receiver and two plugins may both claim `dispatch` — the receiver's owner decides. Returning `undefined` declines (the call emits as without the plugin). The emitters check it first in the `call` expression arm: `registries.calls.memberCalls.get(method)` is one `Map.get`, so a call nobody claims costs nothing further, and the receiver is resolved through the component's declarations (`PluginScope.declByName`). Requires `decls`. Used by `chart.dispatch({...})`, which now lives in `plugins/charts.ts`.
- **Unlowered-module metadata (`unlowered`).** `CompilerPlugin.unlowered` is `{ [module]: { advice, supported?: string[] } }` — the advice the "has NO native lowering" warning names and the exports that DO lower. It is merged into `registries.unlowered`; `findUnloweredModule(module, coreMap)` (`registry-lookup.ts`) checks the plugin entries first, then the hand-maintained `UNLOWERED_PYREON_MODULES` in `parse.ts`, which keeps only modules no plugin owns. A module supplied by two plugins is a load-time error; a plugin's entry wins over a core one. The `@pyreon/charts` entry (and its `supported` list, derived from the chart host tables plus the plugin's own `calls`) lives in `plugins/charts.ts`.
- **Boundary.** Same as element lowerings: a plugin file imports nothing from `emit-swift`, `emit-kotlin` or `parse`.

`ParseContext` is the only way a recognizer reads the parser:

| Facade member | Delegates to | Used by |
| --- | --- | --- |
| `declName` | the `const <name> =` binding the parser is lowering | chart handle (via the stamp), toy plugin |
| `stringLiteralArg(i)` | argument `i` when it is a string `Literal` | the third-party path test |
| `warn(msg)` | `ctx.warnings.push("Declaration <name>: …")` | the third-party path test |

`CallSite` is `{ callee, argCount }`. Not yet exposed (needed by the other by-name recognizers): the argument as a typed node view, `resolveConst(name)` (module-scope string constants), generics (`useFetch<T>`), and destructured results. `EmitContext.ident(name)` was added for declaration emitters.

**Worked proof: `createChartHandle()`.** `plugins/charts.ts` (the built-in `@pyreon/charts` plugin) owns the recognizer, both declaration emitters, the `handle.dispatch({...})` lowering (`memberCalls`) and the `@pyreon/charts` unlowered-module metadata; `parse.ts`, the `chart-handle` `DeclIR` kind and both emitters' handle-name sets, series map, placeholder regex and `dispatch` branches are gone, and the emitted Swift/Kotlin is byte-identical (golden corpus). The `<PlotChart handle={chart}>` host now lives in the plugin on Swift (see "Worked proof: the Swift chart hosts"); on Kotlin it is still core code that learns whether a name is a handle from the component's declarations (`declByName`) and hands the series count back through `resolveDeferred`.
