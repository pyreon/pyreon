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

A *plain* service container is a hook whose whole lowering is "hold one runtime container for the component's lifetime" (`useShare`, `useLinking`, `useHaptics`, `useNotifications`, `useBiometrics`, `useImagePicker`, `useFilePicker`, `useCamera`): no arguments, no reactive state, no read rewrite, no lifecycle, every call a member method that flows through unchanged. These are DATA in `packages/native/compiler/src/services.ts` (the built-in table), carried by the built-in `native-compiler` plugin (`plugins/services.ts`) into each compiler instance's service registry — not code in three files.

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

The Swift lifecycle modifiers are emitted from ONE loop over the registered services (`allServices()`, so their relative order is registry order — built-ins first, in `SERVICES` order, then plugins — not declaration order). `scripts/check-native-lifecycle-wiring.ts` derives from it: an AUTO registry entry names a `hook`, and the gate fails when that descriptor has no `lifecycle`, when its Kotlin line is not the self-installing factory, when the Swift loop is gone, or when a descriptor declares a `lifecycle` that no registry entry classifies. Do not weaken it.

To add a built-in service, add ONE entry to `SERVICES` (plus the Swift/Kotlin runtime container and the stub entries it needs). Nothing else changes: no `DeclIR` variant, no parser branch, no emit branch, no hook-list edit. `tests/services.test.ts` holds each hook's exact emit shape per target, the accessor/callRead/kotlinState tables (typed by hand from the code the descriptors replaced) and the descriptor invariants; extend its tables.

Still hand-written, with the reason: `useDatabase` (its `insert` object-literal lowering and Swift argument labels are call LOGIC, not data), `useWebSocket` (constructor URL taken from the call, synthesized auto-connect), and the struct-typed generics (`useAuth<T>`, `useFetch<T>`, `useStream<T>`).

## Package-owned plugins

A library owns its native lowering as a plugin file in its OWN package; the compiler core knows no library. The package ships `native/plugin.ts` (built to ESM) whose default export is a `CompilerPlugin` with `services` (plain service descriptors, see above) and/or `elements` (JSX element lowerings, below), and declares it in `package.json`: `"pyreon": { "native": { "plugin": "native/plugin.mjs", "modules": ["@acme/camera"] } }`. `pyreon-native build|check` discovers it from the app's declared dependencies and loads it only when the source imports one of `modules` (default: the package name). Rules: one owner per hook (a second claim is a load-time error naming both plugins — the app removes one); a plugin whose name equals a `builtIn` plugin replaces it silently (identity by name), an explicit `--plugin` of the same name wins over a discovered one; `requires` orders passes and a missing requirement or a cycle is a load-time error. Prove a plugin with `@pyreon/native-compiler/testing` (`testNativePlugin`) and `pyreon-native plugins --verify` (every service type is declared in the package's own sources). A plugin's hook is claimed when it is imported from `@pyreon/*` OR from one of the plugin's `modules` (exact or `name/` prefix) — `hook-binding.ts` renames a hook imported from anywhere else, so a plugin that omits `modules` cannot lower a hook from its own package. The registry (`compiler.services`/`context.services`) is the one the parser and both emitters read, so a plugin-owned service and element are lowered end to end; `pyreon-native explain` attributes each to its owning plugin.

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

Every `createCompiler` instance owns one `CompilerRegistries` — `{ services, serviceTables, elements, calls }` — built once, at load time, from its built-in + discovered + explicit plugins (replacement-by-name, `requires` order, conflict errors as above). The built-in services and the elements/coolgrid lowerings are `builtIn` plugin objects in `built-in-plugins.ts`; nothing else registers them. Two compilers in one process therefore never share or leak registrations.

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
| `warn(msg)` | `_emitWarnings.push(msg)` | coolgrid Col |

Extend the facade only when a plugin needs it, and add its row here. Not yet exposed (the chart/flow host emitters need them): child emission (`emitSwiftChild`), expression emission, attribute/modifier emission (`emitSwiftLayoutModifiers`), per-component state (`ctx.state`), and the chart theme scope. A `DeclEmitter` receives this same context (built by `swiftEmitContext(2)` / `kotlinEmitContext(2)`; its `emit` / `staticAttr` are the element ones and a declaration has no element, so they are not useful there).


## Code-shaped plugins (`calls` + `decls`)

A service is DATA (a hook with no arguments). When the lowering needs CODE — read an argument, decline a shape it cannot lower, render per-target text — a plugin supplies a recognizer and an emitter (`call-lowering.ts`), and the core never learns the library.

- **Open declaration.** `DeclIR` has one open member, `ExtDecl = { kind: 'ext', plugin, type, name, payload }`. `payload` is a JSON record (`ExtPayload`): the pass pipeline `structuredClone`s the IR, so functions, `undefined`, `NaN`, cycles and class instances are refused at recognition with the plugin named. The core never switches on a third-party `type`; it dispatches by `(plugin, type)`.
- **Recognize.** `CompilerPlugin.calls` is keyed by hook/function name: `(call: CallSite, ctx: ParseContext) => ExtDeclSpec | undefined`, where `ExtDeclSpec = { type, payload? }`. It runs where the parser's by-name branches sit (right after the service lookup in `tryDeclFromVarDeclarator`), so a recognizer that returns `undefined` DECLINES and the parser continues down the same chain as if the plugin were absent. The compiler stamps `plugin` and `name` onto the result (a plugin cannot mis-attribute a declaration or claim another plugin's `type`) and fails loudly if `type` has no emitter.
- **Claim rule.** Identical to services: a name is claimed when imported from `@pyreon/*` or from one of the plugin's `modules` (exact or `name/` prefix). It goes through the same binding resolution (`hook-binding.ts`): a user's own `function createToy()` or an import from somewhere else is NOT the plugin's call. Two plugins claiming one name — or a name that is also a service hook — fail at load, naming both owners. A `(plugin, type)` pair cannot collide: the plugin name is the namespace and a duplicate plugin name is already an error.
- **Emit.** `CompilerPlugin.decls` is keyed by `type`: `DeclEmitter = { swift(decl, ctx), kotlin(decl, ctx): string | string[], legacyKind? }`. Kotlin lines are joined with the same newline-and-indent a built-in multi-line declaration uses. `legacyKind` is for built-ins only: `moduleTag` (the hash that names synthesized structs) hashes a declaration as `{ kind: legacyKind, name, ...payload }`, so moving a closed `kind` into a plugin does not move any emitted name.
- **Registration.** `createRegistries` builds a `CallRegistry` (`registries.calls`) next to the service and element registries; same instance ownership, same conflict rules. `plugins` / `explain` list the recognizers with their owners and declaration types.
- **Boundary.** Same as element lowerings: a plugin file imports nothing from `emit-swift`, `emit-kotlin` or `parse`.

`ParseContext` is the only way a recognizer reads the parser:

| Facade member | Delegates to | Used by |
| --- | --- | --- |
| `declName` | the `const <name> =` binding the parser is lowering | chart handle (via the stamp), toy plugin |
| `stringLiteralArg(i)` | argument `i` when it is a string `Literal` | the third-party path test |
| `warn(msg)` | `ctx.warnings.push("Declaration <name>: …")` | the third-party path test |

`CallSite` is `{ callee, argCount }`. Not yet exposed (needed by the other by-name recognizers): the argument as a typed node view, `resolveConst(name)` (module-scope string constants), generics (`useFetch<T>`), and destructured results. `EmitContext.ident(name)` was added for declaration emitters.

**Worked proof: `createChartHandle()`.** `plugins/charts.ts` (the built-in `@pyreon/charts` plugin) owns the recognizer and both emitters; `parse.ts`, the `chart-handle` `DeclIR` kind and both emitters' `chart-handle` branches are gone, and the emitted Swift/Kotlin is byte-identical (golden corpus). What stays in core, and why: the Swift series-count placeholder is substituted by the component emit after the body is emitted (`CHART_HANDLE_SERIES_PATTERN`), and `handle.dispatch({...})` / `<PlotChart handle={chart}>` read the set of handle names — expression and element lowering that has not moved. The core learns the names from the declarations (`isChartHandleDecl` in the module/component prepass), never from plugin state.
