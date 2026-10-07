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

A *plain* service container is a hook whose whole lowering is "hold one runtime container for the component's lifetime" (`useShare`, `useLinking`, `useHaptics`, `useNotifications`, `useBiometrics`, `useImagePicker`, `useFilePicker`, `useCamera`, …): no arguments, no reactive state, no read rewrite, no lifecycle, every call a member method that flows through unchanged. These are DATA, owned by `@pyreon/hooks` (`packages/fundamentals/hooks/src/native-plugin.ts`, the ONLY copy: the compiler carries no hooks table and no built-in plugin) and reach each compiler instance's service registry through the discovered `@pyreon/hooks` plugin, like every other library's lowering. `services.ts` keeps the descriptor vocabulary.

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

The Swift lifecycle modifiers are emitted from ONE loop over the registered services (`allServices()`, so their relative order is registry order — plugin order, then each plugin's own declaration order — not declaration order). `scripts/check-native-lifecycle-wiring.ts` derives from the hooks plugin's descriptors: an AUTO registry entry names a `hook`, and the gate fails when that descriptor has no `lifecycle`, when its Kotlin line is not the self-installing factory, when the Swift loop is gone, or when a descriptor declares a `lifecycle` that no registry entry classifies. Do not weaken it.

To add a service, add ONE entry to the `services` of `packages/fundamentals/hooks/src/native-plugin.ts` (plus the Swift/Kotlin runtime container and the stub entries it needs). Nothing else changes: no `DeclIR` variant, no parser branch, no emit branch, no hook-list edit, nothing to regenerate. `tests/services.test.ts` holds each hook's exact emit shape per target, the accessor/callRead/kotlinState tables (typed by hand from the code the descriptors replaced) and the descriptor invariants; extend its tables.

`useFetch` is code-shaped (a URL, a request init, a decoded type), so it is not a descriptor: it lives in the same plugin as a `calls` + `decls` lowering (`native-plugin/fetch.ts`). What is still hand-written in the compiler, with the reason, is listed under "Not moved yet".

## The rule: the compiler knows no library

`@pyreon/native-compiler` knows its CONTRACT and nothing else. Contract means the surface PMTC exists to lower for every app: the canonical primitives, `signal` / `computed` / `effect` / `onMount`, the router (below), the ui-system authoring API (`styled`, `rocketstyle`, theme tokens), and the runtime packages it targets. Everything else is a library, and a library's lowering lives in the library's own package as a plugin. The test for any line in the compiler is: "if I deleted package X from the monorepo, would this line need editing?" If yes, the compiler is carrying X's knowledge.

**The plan this document records** (the compiler-boundary arc, phases 3h to 3m): move every library's recognizers, emitters, typing, stubs and unlowered-module advice out of `parse.ts`, `emit-swift.ts`, `emit-kotlin.ts` and `infer-type.ts` into `packages/<cat>/<pkg>/src/native-plugin*`, one library at a time, each as its own independently green commit, with three constraints that never relaxed:

1. **Byte-identical output.** `bun scripts/check-native-golden.ts` (below) is never run with `--update` to absorb a diff. A diff is a bug in the move, or a corpus gap to close with a fixture recorded from the PARENT compiler, never a snapshot to refresh.
2. **Library-agnostic seams.** Every new core seam is proven by a toy plugin in the compiler's own tests that is NOT the library that motivated it, and bisected (neuter the seam in the compiler; that spec, and only that spec, fails). A seam that only its first user exercises is a back door.
3. **The boundary only shrinks.** `scripts/check-compiler-boundary.ts` counts library specifiers and hook-name literals in non-test compiler source against `scripts/compiler-boundary-baseline.json`. A number may go down (`--update` tightens it) and never up.

Where the arc stands (native-compiler): **47 library specifiers across 39 packages and 113 hook-name literals before phase 3l; 16 / 12 / 109 after it; 4 / 3 / 86 now.** The four specifiers left are `@pyreon/store`, `@pyreon/state-tree` (the Tier-2 diagnostic table) and `@pyreon/ui-core` twice (the `PyreonUI` scope plumbing, which stays: see "What stays in the core"). The golden corpus grew from 536 entries (phase 3i) to 964, 1410 and now 1500, all byte-identical across every move.

## Ownership map

Every first-party plugin is a package's own file, discovered from its manifest (`pyreon.native.plugin` + `modules`). `scripts/native-first-party-plugins.ts` is the ONE list the repo's scripts and tests load (the compiler's tests re-export it from `src/tests/first-party-plugins.ts`); adding a plugin means adding it there and to `plugin-boundary.test.ts`.

| Plugin (package) | What it owns |
| --- | --- |
| `@pyreon/hooks` | the platform-service table (`services`, 23+ hooks); `useFetch` (`calls` + `decls` + `receivers` + `lifecycle` + `asyncState` + `typing`); and the stateful containers `useWebSocket`, `useDatabase`, `useSecureStorage`, `useMap`, `useAuth` (`native-plugin/containers.ts`: receivers for labelled Swift calls, record literals and `.value` reads, optional typing, and a `prepareEmit` that synthesizes the socket's connect-on-mount) |
| `@pyreon/charts`, `@pyreon/flow` | chart hosts + handle; flow state, helpers, renderers, hosts (phases 3h, 3i) |
| `@pyreon/http`, `@pyreon/query` | endpoint scan + request resolution (a request SOURCE); `useQuery` / `useStream` / `QueryClient` + harnesses (phase 3j) |
| `@pyreon/validate`, `@pyreon/validation` | schema items, `withField`, `safeParse` expressions, decode-type evidence, form validators (phase 3k) |
| `@pyreon/machine`, `@pyreon/i18n`, `@pyreon/toast`, `@pyreon/a11y`, `@pyreon/table`, `@pyreon/dnd`, `@pyreon/sync` | phase 3l (declarations, call expressions, lifecycle and init seeds) |
| `@pyreon/permissions`, `@pyreon/url-state`, `@pyreon/storage` | `usePermissions` + `<PermissionsProvider>`; `useUrlState` (reads the active router); `useStorage` / `useSessionStorage` / `useMemoryStorage` as persisted SIGNALS through the `persistence` backend |
| `@pyreon/sized-map` | `new SizedMap<K, V>({ maxEntries, lru })` through `callExprs` (construct) |
| `@pyreon/rx` | `rx.filter(src, p)` and the standalone source-first transforms as a core `computed` around an `ext-expr` (`declCalls`) |
| `@pyreon/feature` | `defineFeature({ name, schema })` as a module item; the Tier-2 diagnostic through `tier2Calls` |
| `@pyreon/kinetic` | factory-bound motion boxes (`kinetic('div').preset(…)`) through `rewriteElement` + `requestComponentDecls` |
| `@pyreon/elements`, `@pyreon/coolgrid` | `Element` (retagged to `Stack`), `Container` / `Row` / `Col` |

`pyreon-native plugins` prints this table for an app (hook owners, call recognizers, element lowerings, module items, unlowered-module metadata); `pyreon-native explain <file>` attributes each lowered declaration to its owner.

## Writing a plugin

A package ships `src/native-plugin.ts` (exported as `./native-plugin`, built to `lib/native-plugin.js`, declared as `"pyreon": { "native": { "plugin": "./lib/native-plugin.js", "modules": ["@acme/camera"] } }`). It imports from `@pyreon/native-compiler/plugin-api` and nothing else of the compiler (`tests/plugin-boundary.test.ts` fails on any other `@pyreon/native-compiler/*` specifier or a relative path into `native/compiler`). `@pyreon/native-compiler` is an OPTIONAL peer plus a dev dependency, so no web import reaches the plugin.

```ts
import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  type CallRecognizer, type CompilerPlugin, type DeclEmitter,
} from '@pyreon/native-compiler/plugin-api'

const recognize: CallRecognizer = (call, ctx) => {
  const label = ctx.stringLiteralArg(0)
  if (label === undefined) {
    ctx.warn('useGadget needs a string literal label.')   // named, attributed to the declaration
    return null                                           // CLAIM: report, declare nothing
  }
  return { type: 'gadget', payload: { label } }            // or `undefined` to DECLINE (fall through)
}

const gadget: DeclEmitter = {
  swift: (d, ctx) => `@State private var ${ctx.ident(d.name)} = Gadget(${ctx.stringLiteral(String(d.payload.label))})`,
  kotlin: (d, ctx) => `val ${ctx.ident(d.name)} = remember { Gadget(${ctx.stringLiteral(String(d.payload.label))}) }`,
}

export default {
  name: '@acme/gadget', apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@acme/gadget'], calls: { useGadget: recognize }, decls: { gadget },
} satisfies CompilerPlugin
```

Rules a plugin lives by:

- **A recognizer has three answers.** A declaration (a plugin `type` + a JSON `payload`), `undefined` to DECLINE (the parser continues as if the plugin were absent), or `null` to CLAIM the call without declaring anything (the recognizer already said why it cannot lower; the binding must not fall to a generic emit that would reference a symbol neither target has). Reproduce the OLD code's fall-through, not only its happy path: porting `rx` first declined a shape (`rx['filter'](…)`) the core had CLAIMED, and the golden caught it as a declaration that suddenly emitted verbatim.
- **Payloads are JSON.** The pass pipeline `structuredClone`s the IR; functions, `NaN`, cycles and class instances are refused at recognition naming the plugin (`undefined` is allowed: it is how the IR spells an absent slot). IR (`TypeIR`, `ExprIR`) inside a payload is cast through `ExtPayload`.
- **Claims are by import, never by bare name.** A hook is the plugin's when it is imported from `@pyreon/*` or from one of its `modules`; `hook-binding.ts` renames a same-named function the author declared, or imported from anywhere else, so no recognizer claims it. If the lowering must apply to a call that is NOT claimed that way (a Tier-2 diagnostic for any `defineFeature(…)`), use `tier2Calls`, which matches the callee as written and does not claim the name: a name claim also changes how a foreign import of the same name is treated, which a byte-identical move cannot allow.
- **Moved output keeps its identity.** A declaration that used to be a closed core kind sets `legacyKind` (and a module item `legacyList`, an expression `legacyHash`) so `moduleTag` — the hash that names synthesized `__ObjN_<hash>` structs — reads the payload as the retired shape. A plugin with no prior output omits them.
- **Prove it.** `@pyreon/native-compiler/testing` (`testNativePlugin`) compiles a source through a plugin; `pyreon-native plugins --verify` checks every service type is declared in the package's own sources; the compiler's golden corpus carries the package's `native-golden/` fixtures.

## Discovery and activation

`pyreon-native build|check|watch|explain` (and the LSP) read the app's DIRECT dependencies, load a package's plugin only when a source file imports one of its `modules` (default: the package name), and pass the result to `createCompiler({ discovered })`. Deciding by asking the module would defeat the laziness, so activation is manifest data (`pyreon.native.modules`). Consequences:

- **Activation decides ownership.** A hook is owned by the package the app imports it FROM, not by the runtime it happens to drive: `useFetch` is imported from `@pyreon/hooks`, so it is the hooks plugin's even though its URL comes from an `@pyreon/http` endpoint. Facts cross plugins through the compiler, never by import (`ParseContext.requests`, `recordDecode`, `items[type].fieldValidators`), so there is no `requires` between plugins whose packages an app may declare independently.
- **Nothing ships inside the compiler.** `BUILT_IN_PLUGINS` is empty. `@pyreon/hooks` was the last holdout (a generated copy of its service table, written by a script and gated for freshness); it blocked moving any code-shaped hook, because a generated copy can carry data, not recognizers. It is deleted along with its generator and gate. A bare `transform()` / `createCompiler()` with no plugins therefore lowers only the core's own contract, and a plugin that fails to load is a hard error naming the package and file. The `builtIn` mechanism (a discovered plugin of the same name replaces a compiler-shipped one) is kept, unit-tested against a synthetic plugin, and currently has no user.
- **`--no-plugins`** turns discovery off. **`--plugin <file>`** loads an explicit local ESM plugin; one of the same name beats a discovered one.
- **Conflicts are load-time errors naming both owners**: two plugins claiming one hook, one `(module, tag)`, one function / identifier name, one runtime type, one unlowered-module entry, or one `persistence` backend.

## The plugin protocol

`CompilerPlugin` (`src/plugin.ts`, re-exported types in `src/plugin-api.ts`) is a bag of OPTIONAL, additive members. Adding a member never bumps `NATIVE_COMPILER_PLUGIN_API_VERSION` (an older plugin simply does not use it); an incompatible change does. The shape is validated at load (`assertPluginShape`), so a malformed member fails naming the plugin.

| Member | Lowers | Core site |
| --- | --- | --- |
| `services` | plain service hooks as data (above) | `service-registry.ts`, the generic `service` decl |
| `calls` + `decls` | a hook / function call into the plugin's open `ext` declaration; its emitter per target | `tryDeclFromVarDeclarator`, `emitExtDecl` |
| `declCalls` | a declaration recognized by the SHAPE of its callee (`rx.filter(src, p)`, `keep(src, p)`), not a name; verdicts as `calls` | `tryPluginDeclCall` |
| `tier2Calls` | callee names the package ships no lowering for: the standing Tier-2 diagnostic naming the plugin | the Tier-2 branch of `tryDeclFromVarDeclarator` |
| `memberCalls` / `receivers` | `<receiver>.<method>(…)` / any call, read or write rooted at a binding the plugin's decls created | `lowerPluginReceiver`, `lowerPluginAssign` |
| `functions`, `identifiers`, `memberReads` | a plain `name(args)` call, a bare library constant, a member read recognized by shape | `registry-lookup.ts` |
| `callExprs` / `methodCalls` + `exprs` | a CALL (`toast("x")`, `new SizedMap<K, V>(…)`) / `<recv>.<method>(…)` into the open `ext-expr` node, rendered, typed, renamed and hashed by the plugin | `tryPluginCallExpr`, `tryPluginMethodCall`, `lowerPluginExpr` |
| `topLevel` + `items` | a file-scope declaration as a module item; slot, hash lane, name bindings, form validators | `tryPluginTopLevel`, `lowerPluginItem` |
| `scanModule`, `requestSources` | a per-file pre-pass (facts, skipped metadata, lowered imports); a binding resolved to a concrete request | `module-scan.ts` |
| `refineStructs`, `finishModule`, `refineParse` | struct edits from items and decode sites; a last pass over items; an IR edit INSIDE the parse | `parsePyreon` |
| `elements`, `scopes`, `intrinsics`, `rewriteElement` | claimed JSX tags (retag or emit), colour-scope providers, lowercase DOM tags inside the plugin's renderers, a local-binding tag rewritten to another element | `element-lowering.ts`, `scope-provider.ts` |
| `prepareEmit`, `propsTypes`, `runtimeTypes`, `refModifiers` | per-file extra components, library props types, runtime type names, a modifier from a `ref` value | the emitters |
| `unlowered`, `intrinsicAdvice`, `componentOnlyCalls`, `destructureCalls` | advice for the "no native lowering" warning and the exports that DO lower; a module-scope decline warning; hooks whose result may be destructured | `unlowered-modules.ts`, `parse.ts` |
| `persistence` | how a persisted SIGNAL is declared on each target (a library's own `@AppStorage` / `by rememberPersisted`) | `signal-persistence.ts` |
| `stubs` | compile-gate stub text beyond the SwiftUI / Compose bundle; the compiler never reads it, the caller passes it as `ValidateOptions.augment` | `stub-augmentation.ts` |
| `modules`, `requires`, `builtIn`, `transformIR`, `prepareIR`, `backends` | activation, ordering, replacement-by-name, IR passes, extra backends | `compiler.ts` |

**A declaration recognizer's verdict** (`CallRecognizer`, `DeclCallRecognizer`) is one of: `{ type, payload }` (the plugin's own `ext` decl); `{ signal: { initial, persistKey? } }` (a plain core SIGNAL, built with the core's own rules, so a library's signal reads, writes, infers and synthesizes structs exactly like `signal()`); `{ computed: ExtExprSpec }` (a core `computed` around the plugin's own expression); `undefined` (decline); `null` (claim without declaring).

**`DeclEmitter`** carries, besides `swift` / `kotlin`: `callable` (the binding is called through `callAsFunction` / `invoke`, so a zero-argument call keeps its parens), `usesRouter` (the View needs the router in its environment), `lifecycle` (`stableHost`, `tailOrder` / `midOrder` placement, Swift modifier lines, Compose effect lines), `swiftInit` (lines seeded in the generated `init()`), `typing` (`callRead` types `x.f()`, `member` types `x.f`, `methodReturn` types `x.m(…)`), `asyncState` (the declaration is an async source for `<Suspense>` / `<ErrorBoundary>`), `legacyKind`.

**`ExprEmitter`** carries `swift` / `kotlin`, `typing` (`type(e, infer)` — typed from its parts, `member`, `seedsModuleConst`), `legacyHash`, `rename`, and `reduce` (the node is a reduction, so the core widens an integer seed over a fractional accumulation exactly as it does for an array `reduce`). The core walks an `ext-expr`'s `args` like any expression, which is how nested reads, renames and inference reach them.

**`ModuleItemEmitter`** carries `swift` / `kotlin`, `after` (the emit slot: `'models'`, then `'declarations'`, then the default `'data'`; items of one slot emit in file order), `legacyList` (`'fieldMetas'` | `'zodSchemas'` | `'features'`, the retired core arrays an item's payload hashes as), `bindings` (`names`, `reserved`, `rename`: the file's one value/type namespace) and `fieldValidators`.

### What phase 3m added (each library-agnostic, each with a toy-plugin user that is not the library that needed it)

| Seam | Why | Toy spec |
| --- | --- | --- |
| `EmitContext.generic(el)`, `KotlinEmitContext.intArg` | a retag-free element lowering that re-enters the generic component emit; an `Int`-only Compose argument | `plugin-rewrite-element.test.ts`, element specs |
| `DeclEmitter.callable` / `usesRouter` | `useUrlState`'s `q()` and router environment, without the core naming it | `plugin-decl-flags.test.ts` |
| plugin-recognized hooks in render callbacks | a hook a plugin recognizes, declared inside a `<For>` / `<Show>` callback, is named exactly like a built-in one (the `HOOK_NAMES` set derives from the registry) | `plugin-hook-render-callback.test.ts` |
| the `{ signal }` verdict + `persistence` | `useStorage` is a persisted SIGNAL, not a container | `plugin-signal-persistence.test.ts` |
| `CallExprSite.construct`, `ModuleParseContext.typeArgs` / `loc`, `typing.seedsModuleConst` | `new SizedMap<K, V>(…)`: a construction, its generic arguments, a located message, and a file-scope const that must not be typed as a dictionary | `plugin-construct-exprs.test.ts` |
| `rewriteElement` + `requestComponentDecls` | a tag naming a LOCAL factory binding; a rewrite that needs a declaration on the component being parsed (`kinetic`'s mount flag) | `plugin-rewrite-element.test.ts` |
| `declCalls` + `{ computed }`, `typing.type(e, infer)`, `ExprEmitter.reduce`, `ext-expr` walking | `rx.filter(todos, p)` is a computed whose type follows its source; a reduction's seed widens | `plugin-decl-calls.test.ts`, `plugin-rx-legacy-hash.test.ts` |
| items `after: 'declarations'`, the `features` hash lane | a feature's declarations emit before the schemas, with unchanged struct names | `plugin-module-items.test.ts` |
| `tier2Calls` | the Tier-2 diagnostic for a call the package does not lower, WITHOUT claiming the name | `plugin-tier2-calls.test.ts` |
| `DeclEmitter.typing.member` | the type of the property form `q.data`; a nullable union when the member may be absent | `plugin-decl-typing-member.test.ts` |
| `DeclEmitter.typing.methodReturn` | the type of a method call result `x.m(…)` (`vault.read(k)` is optional), so an optional used as a condition lowers to a nil test | `plugin-decl-typing-method-return.test.ts` |

Traps this arc surfaced, each now locked:

- **A name CLAIM is not free.** `calls: { defineFeature }` made `hook-binding.ts` rename a `defineFeature` imported from another module, changing the output of a fixture the golden holds. `tier2Calls` exists because "diagnose this call" and "own this name" are different statements.
- **A fixed-position fast path hides a second consumer.** The `rx` exception clause (every `rx.<anything>` member declaration was dropped) had to be reproduced in the plugin's recognizer, not just its happy path.
- **A seam's first user is not its proof.** Bisecting each moved mechanism against the golden found, repeatedly, a mechanism no entry discriminated (the response-evidence refinement, the endpoint json-body default, the method upper-casing, property-form typing). A green golden with a mechanism neutered means the corpus does not reach it; record a fixture from the PARENT and bisect again.
- **`satisfies CompilerPlugin` narrows a plugin literal**, and an array of narrowed literals loses `.calls` on its union; the shared list is annotated `readonly CompilerPlugin[]`.

## Reference: the compiler extension boundary, the facades and each seam in detail

The rest of this document is reference for the seams in the protocol table above, in the order a plugin author meets them. Where a section describes how a library was moved, it is the worked example of the seam, not a statement of what the compiler still carries.

## Compiler extension boundary

`createCompiler({ plugins })` owns a fixed, versioned registration set. Extend
shared `CompilerModule` IR with synchronous `transformIR`/`prepareIR` callbacks,
or register a distinct backend target. Source transformations run before all
runtime preparation; synthesized module identity excludes external declarations.
Charts prepare through their own package's plugin and parsed import declarations.

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

Every `createCompiler` instance owns one `CompilerRegistries` — `{ services, serviceTables, elements, calls, unlowered }` — built once, at load time, from its discovered + explicit plugins (replacement-by-name, `requires` order, conflict errors as above). There is no private table beside it and no built-in plugin (`BUILT_IN_PLUGINS` is empty). Two compilers in one process therefore never share or leak registrations.

The parser and both emitters keep large module-level state, so they are not handed a registry per call. `transform` installs its registries in a SCOPED slot (`active-registries.ts`: `withRegistries(registries, fn)`) for exactly the duration of parse + passes + emit, and restores the previous value in `finally`. It is not global state: outside a `withRegistries` call the slot is empty and lookups fall back to the immutable built-in defaults; a nested `transform` on another compiler sees its own registries and the outer one is back afterwards; a throwing pass or parse never leaves a stale slot. Everything that reads a service or element goes through `registry-lookup.ts` (`serviceFor`, `bindServices`, `allServices`, `findElementLowering`, `isElementLoweringTag`, `isStyleBasePrimitive`, `hookClaimsSource`, `emitPluginDecl`) or `activeRegistries().serviceTables`, whose hook sets are derived once when the registry is built. `parsePyreon(source, filename, { registries })` takes them explicitly for direct callers and tests. The slot is synchronous only — every compiler hook is — and the emitters' own module-level state is still not reentrant (`tests/instance-registries.test.ts` proves slot isolation, restore-on-throw and nesting).


## Element lowering plugins and the `EmitContext` facade

A library's JSX elements reach native code through `element-lowering.ts`, not through `if (tag === …)` branches in the emitters. An `ElementLowering` is `{ module, tags, retag?, emit?: { swift?, kotlin? }, styleBase? }`:

- **Claim.** Tags are claimed only when the emitters' import guard accepts `(tag, module)` — the same `canAliasIntercept` rule as before: not shadowed by a same-named user / styled / rocketstyle / attrs component, and when the import is tracked it must come from `module` under its own name. `parse.ts` records the import source of every tag any registered lowering names (a scoped sub-path import normalises to the package root), so a plugin's tags get the guard with no parser edit. A user `Row` from `./mine` is never claimed; a renamed import (`Row as R`) is not either, because the claim is on the local tag.
- **Retag.** `retag(el)` returns another element (usually a canonical `Stack`), which re-enters the emitter's dispatcher; returning `undefined` declines and the element goes to `emit`. A retag must not return a tag it claims itself.
- **Emit.** `emit.swift` / `emit.kotlin` receive `(el, ctx: EmitContext)` and return target text. A target without a function falls through to the generic component path. All per-target differences live in these functions, never in the facade.
- **Registration.** A lowering is declared on a plugin: `CompilerPlugin.elements`. `createCompiler` builds one `ElementRegistry` per instance from the discovered and explicit plugins; a `(module, tag)` pair claimed twice is a load-time error naming both owners (no load-order precedence), except that a discovered plugin replaces a `builtIn` one by name. `@pyreon/elements` and `@pyreon/coolgrid` register through exactly that path from their own packages — there is no private back door and no process-global registry.
- **Boundary.** A package's plugin files import only `@pyreon/native-compiler/plugin-api`, never `emit-swift`, `emit-kotlin` or `parse` (`tests/plugin-boundary.test.ts`).

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
| `expr(e, at?)` | `emitSwiftExpr(e, indent)` / `emitKotlinExpr(e, indent)`; `at` defaults to this element's indentation | chart handle `dispatch`; chart hosts (both targets) |
| `exprAs(type, e, at?)` | `withExpectedType(type, () => emitSwiftExpr(e, indent))` / the Kotlin twin (steers how an object or array literal is typed; `undefined` clears an inherited expectation) | chart handle `dispatch` (`areas`); chart hosts, both targets (options structs, annotations) |
| `stringAttr(el, name, at?)` | `readStringAttrExpr` / `readStringAttrExprKotlin` — a string attribute as target text (a literal, or an interpolation of the expression) | chart title / subtitle / accessibility label, both targets |
| `layoutModifiers(el)` | `emitSwiftLayoutModifiers` / `emitKotlinLayoutModifier` — the `.padding(…).background(…)` / `Modifier.padding(…)` tail for the element's own styling props | chart host tail, both targets |
| `action(handler, at?)` | `emitSwiftAction` / `emitKotlinAction` — an event handler as a closure body | chart `onSelect`, both targets |
| `constExpr(name)` | `_moduleConstExprs.get` / `_moduleConstExprsKotlin.get` — a module-level `const`'s initializer | chart `visualMap` / `dataZoom` / `toolbox` / adapter resolution, both targets |
| `colorScope<T>()` | `_colorScope` (one per emitter) — the compile-time colour-mode scope enclosing the element, typed by the reader; READ-ONLY | chart theme / palette / entrance, both targets |
| `decls(plugin, type)` | the emitters' per-file names sets (`_chartHandleNames`, `_chartHandleNamesKotlin`) and `isChartHandleDecl` (deleted) | the `<PlotChart handle>` host (both targets) asks whether a name is a chart handle |
| `state(key, init)` | emitter module-level `let` / `Set` a plugin would otherwise need | toy plugin only (see below) |
| `deferred(key, fallback?)` | the private `__PYREON_HANDLE_SERIES_<name>__` placeholder + its regex | chart handle declaration |
| `resolveDeferred(key, value)` | `_chartHandleSeries.set(name, n)` | `<PlotChart handle>` host (Swift only: the Kotlin handle declaration carries no deferred value) |
| `component()` | `_activeComponentName`, `_activePropsParamName`, `_componentValueConstExprs`, `_componentNames.has` — read through live getters (`ComponentInfo`) | the flow hosts (renderer registration, props-rooted reads, `<path>` claim) |
| `isFunctionName(name)` | `_functionNames.has` | flow minimap / controls callback detection |
| `child(child, at?)` | `emitSwiftChild` / `emitKotlinChild` — one JSX child through the full dispatcher | flow panels / overlays / controls content |
| `typeText(type)` | `swiftType` / `kotlinType` (Kotlin against the component's own `KotlinCtx`, so an inline object type synthesizes a named data class there) | flow node-data row type; query result / stream item types |
| `inferType(e)` | `inferType(e, _activeInferCtx)` / `_kotlinExprInferCtx` | flow node-data row unification |
| `structs.forTypeFields` / `forLiteralFields` / `synthesize` | the file's struct registries (`_structTypedKeyToName`, `_structFieldsToName`, `_synthExprStructs`, `resolveSwiftObjectStructName`, …) — a plugin that builds a typed container from a literal must resolve to the SAME struct names the file's other literals do | flow node-data rows (both targets) |
| `warnOnce(msg)` | `if (!_emitWarnings.includes(m)) _emitWarnings.push(m)` | flow SVG / edge-text plans |
| `webView.dynamicAttr` / `dataArg` / `messageHandler` | the `<WebView>` helpers (`dynamicWebViewAttr`, `swiftWebViewDataArg`, `emitSwiftMessageHandler` and their Kotlin twins) | `<FlowWebView>` (both targets) |
| `fileState(key, init)` | the FILE-scoped plugin memory (the module scope's state bag, readable from inside any component and from `prepareEmit`) | the flow file record (renderer components, static handles / resizers / toolbars) |
| `statements(stmts, indent, locals?)` | `emitSwiftStatement` / `emitKotlinStatement` over a callback body a recognizer carried in its payload, with `locals` typed for inference where the emitter keeps an inference context for handler locals (Swift) | `useStream`'s `onEvent` (both targets) |
| `layoutModifiersFor(el, handled)` | `emitSwiftLayoutModifiers(el, omit)` / `emitKotlinLayoutModifier(el, omit)` — the styling tail when the host consumed some props itself | `<FlowWebView>` (the page's `background` is not a view background) |

Extend the facade only when a plugin needs it, and add its row here. A `DeclEmitter` receives this same context (built by `swiftEmitContext(2)` / `kotlinEmitContext(2)`; its `emit` / `staticAttr` are the element ones and a declaration has no element, so they are not useful there).

**Target-only members (`SwiftEmitContext`).** `emit.swift` receives a `SwiftEmitContext` — the shared facade plus the members only the Swift emitter has state for. A member moves up to `EmitContext` when BOTH emitters supply it: `stringAttr`, `layoutModifiers`, `action`, `constExpr` and `colorScope` started on the Swift context for the Swift chart hosts and moved up (rows above) when the Kotlin chart hosts needed the same capability from `emit-kotlin.ts`. What stays here has no Compose analogue. `emit.kotlin` receives a `KotlinEmitContext`, which is the shared `EmitContext` plus `intArg` (an argument to an `Int`-only Compose API: a TS integer is a `Long`, so it narrows at exactly the call that needs it).

| Member | Replaces (in `emit-swift.ts`) | Why Kotlin has none | Used by |
| --- | --- | --- | --- |
| `handlerName(handler)` | `resolveFunctionHandler` — the module function an expression refers to | the Kotlin hosts call a handler through `action`, never by name | Swift chart `onSelect` / `onBrush` |
| `markColorSchemeUsed()` | `_usesColorScheme = true` — makes the component declare `@Environment(\.colorScheme) pyreonColorScheme` | Compose reads the scheme as a composable call (`isSystemInDarkTheme()`); nothing is declared on the component | chart theme scheme switch |
| `hostState.declare(line)` / `lines()` / `replaceFrom(start, lines)` / `freshSuffix()` | `_hostStateDecls` (spliced into the struct by `emitSwiftComponent`) and `_swiftHostStateSeq` (per file) | a Compose host's state is a `remember { … }` inside the composable it emits, so there is no component-level declaration list to splice | chart `@State` (zoom window, hover, legend page…) and the rename of two hosts' colliding names |
| `inlineConsts(e)` | `inlineValueConsts` — the component's value-shaped `const`s substituted into an expression | flow call-site literals (Kotlin resolves them through `component().valueConsts` instead) |

The colour-mode scope is entered and left by the CORE, around the children of `<PyreonUI mode>`, `<ColorModeProvider>` and any plugin-declared scope-only element (saved and restored in `finally`, so providers nest and a sibling inherits nothing); a plugin only READS it, and supplies its VALUE through `scopes` (below). A write API would let a plugin leak a scope past its subtree.

### Per-component plugin scope (`plugin-scope.ts`)

`decls`, `state`, `deferred` and `resolveDeferred` read ONE `PluginScope` the emitter owns. `emitSwiftComponent` / `emitKotlinComponent` install a fresh scope (built from the component's declarations) when a component starts and restore the previous one when it ends; a file start installs a fresh module scope. So nothing a plugin stores leaks into the next component, the next file or the next compile.

- **`state(key, init)`** — `init` runs the first time `key` is read in the component. The bag is shared by every plugin in the component, so namespace the key with your plugin name. The core never reads it. (`state` has no built-in user in this slice: `decls` removed the chart handle's need for a names set. It is exercised by a third-party toy plugin in `tests/plugin-facade-growth.test.ts`.)
- **`deferred(key, fallback?)` / `resolveDeferred(key, value)`** — `deferred` returns an opaque token to embed in emitted text; after the component body has emitted, the emitter replaces every token with the value resolved for its key. Anything that learns the value later may resolve it (the chart handle's declaration is emitted before the body; the `<PlotChart handle>` host, which counts the series, resolves it). With no `fallback` an unresolved token is an ERROR naming the key — a placeholder must never ship; a handle with no bound chart passes `'0'`. A call outside a component (module scope) is refused. Keys are global strings: namespace them with your plugin name.
- **What core may read.** The core reads a plugin's DECLARATIONS (`PluginScope.declByName`) and may `resolveDeferred`; it cannot read a plugin's `state`. Core has no consumer of chart-handle information any more (`isChartHandleDecl` is gone): both `<PlotChart handle>` hosts live in the plugin and read `ctx.decls(CHARTS_PLUGIN_NAME, CHART_HANDLE_TYPE)`; the Swift host also resolves the series-count token with `chartHandleSeriesKey(<ident>)` (the Kotlin handle declaration is `remember { PyreonChartHandle() }`, which counts nothing).


### Worked proof: the chart hosts (`@pyreon/charts` → `src/native-plugin/swift*.ts`, `kotlin*.ts`)

The `@pyreon/charts` plugin (shipped by `@pyreon/charts` itself since Phase 3h; it began as a compiler built-in) declares ONE element lowering — `{ module: '@pyreon/charts', tags: chartHostTags(), emit: { swift, kotlin } }` — and the ~2,000 lines of chart emission per target that used to sit in `emit-swift.ts` / `emit-kotlin.ts` now live in `packages/fundamentals/charts/src/native-plugin/`: `{swift,kotlin}-hosts.ts` (the host dispatch and the table-driven, accessor and frame hosts), `{swift,kotlin}-plot.ts` (`<PlotChart>`), `{swift,kotlin}-support.ts` (canvas, chrome, theme, formatter, gesture helpers), `{swift,kotlin}-facade.ts` (the target's slot) over the shared `facade.ts`, and `swift.ts` / `kotlin.ts` (the `emit.*` entries). Emitted Swift and Kotlin are byte-identical (golden corpus plus a transform-capture comparison over every chart test). The Swift slice came first and settled the shape; the Kotlin slice reused it and changed only the facade. What the two slices settled:

- **Per-target emit.** A lowering with only `emit.swift` leaves Kotlin on the core's own chart branch: the dispatcher reads `lowering.emit?.kotlin`, finds none, and falls through exactly as for an unclaimed tag — that was the state between the two slices, and is how a plugin may support one target first. A chart host is now claimed entirely by the registry on both targets and neither emitter has a chart branch. `chartHostTags()` (`native-plugin/hosts.ts`) lists every tag `isChartHostTag` accepts (the parser still tests it), so the two cannot drift (`chart-host-tags.test.ts`).
- **Claim, and what it changed.** The old branch matched the bare tag name; the registry claims it only when `canAliasIntercept(tag, '@pyreon/charts')` accepts it — not shadowed by a user / styled / rocketstyle / attrs component, and imported from `@pyreon/charts` under its own name when the import is tracked. A user's own `Legend` or `Cell` component is therefore no longer mistaken for a chart mark. **On Kotlin this was a behaviour change, made deliberately:** the old Kotlin branch matched the bare tag before the user-component dispatch, so a local `Legend` component (or a `PieChart` imported from `./mine`) was hijacked into a chart warning or canvas; the registry guard fixes that on both targets at once (`kotlin-chart-plugin.test.ts`).
- **Dispatch order.** The registry lookup runs before the generic preludes. Two checks that every element used to pass on the way to the chart branch — a spread on a non-component, and a JSX-valued attribute no emitter reads — would have been skipped, silently dropping `<PieChart {...props}>`'s props with no warning. They are now one function per emitter (`warnUnreadSwiftAttrs` / `warnUnreadKotlinAttrs`) called at the top of dispatch AND before a registry `emit` lowering; a `retag` skips it because the element it returns re-enters dispatch and is checked there. The Kotlin dispatcher already ran the checks before its chart branch, so Kotlin lost nothing — but it would have the moment the branch moved behind the registry lookup, which is why the Kotlin slice extracted the same function rather than relying on the old order.
- **The scoped slot.** Threading a context through ~200 emit functions would have rewritten every signature, so `emit.swift(el, ctx)` / `emit.kotlin(el, ctx)` call `withSwiftContext` / `withKotlinContext`, which install `ctx` in a module-scoped slot for exactly that call (saved and restored in `finally`, the discipline `withRegistries` uses) and the moved functions read it through the one `host` object of their target (`swift-facade.ts` / `kotlin-facade.ts`). Both are built by `facade.ts` (`createContextSlot`, `sharedHost`), one slot PER TARGET so a Swift context can never satisfy a Kotlin read. It is not state that survives a call: outside `withSwiftContext` it is empty and `host.*` throws, and a nested element emitted through `ctx.emit` that re-enters the plugin installs its own context and the outer one is back afterwards.
- **What stayed in core, and why.** The scope PLUMBING of `<PyreonUI mode>` / `<ColorModeProvider>` (open the scope, emit the transparent wrapper, pin a literal mode's colour scheme — shared with non-chart code; the scope's VALUE now comes from the plugin's `scopes`), `swiftSpreadResolver` / `kotlinSpreadResolver` (generic object-spread planning that merely sat between chart functions) and `ktChartDouble` (named for charts, used by the flow emit). The grammar desugar re-entry (`<Chart>` → `<PlotChart marks>`) is a plain recursive call inside the plugin, not a trip through dispatch: dispatch would re-run the claim guard against a tag the author never imported.

### Parse-side knowledge: `runtimeTypes` and `refineParse`

`parse.ts` no longer imports anything chart-shaped. Two parse-side plugin fields replaced it:

- **`runtimeTypes: string[]`** — type names the plugin's runtime declares. The parser treats them as already-known when resolving a helper's parameter type (`(c: TooltipContent) => string`), through `activeRegistries().runtimeTypes` (name → owner). Two plugins declaring one name is a load-time error naming both. The charts plugin derives its list from the generated `native-plugin/engine-structs.ts`; its `prepareIR` still appends the structs themselves.
- **`refineParse({ components, helperFns })`** — an IR→IR edit run INSIDE `parsePyreon`, where the chart formatter refinement always ran (`refineChartFormatterParams`, now `widenChartFormatterParams` in `@pyreon/charts` `native-plugin/plugin.ts`). It is NOT a `transformIR` pass because ordering is load-bearing: `refineHelperReturns` infers a helper's return type over its parameters, so a pass that widens `v: number` to `Double` AFTER parse leaves `func twice(_ v: Double) -> Int` (pinned by `plugin-parse-extensions.test.ts`; the golden fixture `chart-formatter-params.tsx` pins the real case). It receives the live IR the in-flight parse owns, so it mutates in place. Direct `parsePyreon` callers (tests, `explain`) go through the same registries, so they get the built-in plugins' refinements without running passes.

Recipe for the next parse-side extraction: find what the parser edits for a library, then ask whether anything between parse and the pass boundary reads the edited value. If not, use `transformIR`. If so, it is a `refineParse`, and the test is a helper whose RETURN depends on the edited parameter.

### Moving a library's emit into a plugin: the procedure

1. **Inventory the section first.** Extract the contiguous region into a scratch file and list (by AST, not grep) every top-level name it uses that is defined elsewhere in the emitter, and every name it defines that code outside it uses. The first set is the facade you must provide; the second must stay in core or cross the facade. The Swift chart section used 13 outside names: 10 emitter state or generic emit helpers (the facade now supplies them) and 3 (the inference context) that belonged to `swiftSpreadResolver`, a generic neighbour that merely sat in the range and stayed in core. The Kotlin section used 11 (`_emitWarnings`, `readStaticAttrKotlin`, `emitKotlinExpr`, `withExpectedTypeKotlin`, `readStringAttrExprKotlin`, `emitKotlinLayoutModifier`, `emitKotlinAction`, `_moduleConstExprsKotlin`, `_chartThemeScope`, `_pluginScope`, `isChartHandleDecl`) plus the pure string/identifier helpers, and DEFINED none that outside code reads except the two state lets that stay. Six names it DEFINES are read by core (`_pluginScope`, `_hostStateDecls`, `_swiftHostStateSeq`, `_chartThemeScope`, `swiftSpreadResolver`, the host entry): the first four are state the core owns, so they stay and are exposed through the facade.
2. **Grow the facade by that list and nothing else**, one row per member in the tables above, each with a real user. State the member's target scope: shared members must have both emitters' equivalents; otherwise put it on the target's context type. **For the second target, look first for members the first target put on its own context type that the second needs too, and promote them** (five moved up for Kotlin); both emitters' own helpers keep their names, only the facade's backend interface gained a member each.
3. **Move mechanically.** Rewrite generic calls to the facade object (`emitSwiftExpr(e, i)` → `host.expr(e, i)`, `_emitWarnings.push` → `host.warn`), keep the functions' own names and bodies, and import only the plugin's own tables / IR types / the string and identifier helpers from `@pyreon/native-compiler/plugin-api` — never `emit-*` or `parse`. Split by layer so imports are acyclic (support ← plot ← hosts). Do the split with a script that parses the extracted text into top-level blocks (declaration plus its leading docblock), prints each block's references to the others, and assigns blocks to files — hand-cutting by line range left an unclosed docblock and mis-attached section comments on the Kotlin pass, and a docblock stranded between two functions attaches to whichever the script sees first. Chart-only helpers that sit AFTER the range (the Kotlin `patternExtras`) are found by grepping each moved name's callers, not by range.
4. **Keep what is not yours.** If the same state is also read by code that stays (the colour scope), expose a documented READ API; do not move the owner.
5. **Prove byte identity at two levels.** The golden corpus (`bun scripts/check-native-golden.ts`; `--dump` parent and branch and `diff -r`) covers what it covers — list which entries exercise the moved code and add golden-only fixtures recorded from PARENT output for any path none does. **Measure before harvesting:** run `collectCorpus()` for the one target under vitest v8 coverage restricted to the moved files (Kotlin: 92.2% statements / 84.2% branches before, 97.4% / 92.2% after 54 fixtures; two more lock the spread warning and the interpolated label). To pick fixtures, capture every source the library's tests compile (a temporary env-gated append in `compiler.transform`; run with `PYREON_SKIP_NATIVE_VALIDATE=1` so the swiftc/kotlinc tests do not hold the run hostage under load), bundle the compiler (`bun build … --packages=external --sourcemap=external`), run each source under `node:inspector` precise coverage and map the executed ranges back through the source map, then greedy-cover the statements the corpus misses. Compare at STATEMENT start (line AND column) — a line-level match over-reports, because `if (x) return y` is one line and two statements. Prove each new entry against the parent by copying the fixtures into a parent worktree and diffing `--dump` output, then check the parent against the updated golden file: it must pass there too. Then run EVERY test mentioning the library's tags on parent and branch with a temporary capture patch around `emitSwift` / `emitKotlin` that logs `hash(args) hash(result)`, and compare the logs: a test only asserts what its author thought of, the capture compares every input the suite ever compiled.
6. **Bisect the seams.** Break the registry dispatch, each facade member, the scope restore; golden AND the library's tests must fail.

## `plugin-api`, `scopes` and `stubs`

`@pyreon/charts` was the first library whose plugin is code-shaped AND large (≈15,000 lines with the generated engine registry), and it now lives in `packages/fundamentals/charts/src/native-plugin/`, so `@pyreon/native-compiler` has no dependency on it. The relocation needed three things the compiler did not have:

- **A published plugin-author API.** `@pyreon/native-compiler/plugin-api` (`src/plugin-api.ts`) re-exports exactly what a plugin may use: the IR types, the `EmitContext` / `ParseContext` facades and the plugin protocol types (type-only), `NATIVE_COMPILER_PLUGIN_API_VERSION`, `forEachExpr`, `substituteIdentifier`, `isNumericLiteralOrNegation` (the literal predicate a numeric-prop plugin reads a `-1` / `1` argument with — the flow plugin's config and handle readers), and the pure spelling helpers `swiftStr` / `kotlinStr` / `swiftIdent` / `kotlinIdent`. A package-owned plugin imports NOTHING else from the compiler — `tests/plugin-boundary.test.ts` scans the charts plugin for it (any other `@pyreon/native-compiler/*` specifier, or a relative path into `native/compiler`, fails). `@pyreon/charts` declares the compiler as an OPTIONAL peer + a dev dependency; the plugin is a separate `./native-plugin` entry no web import reaches.
- **Colour-scope providers (`CompilerPlugin.scopes`).** `<PyreonUI mode>` and `<ColorModeProvider mode>` pin the framework-wide colour mode and `<ChartThemeProvider>` layers a theme over it; none has a runtime context natively — each is a compile-time scope entered while the element's children are emitted. The CORE keeps the plumbing (`enterColorScope`, saved/restored in `finally`, the transparent `Group`/`Box`, the colour-scheme pin of a literal `<ColorModeProvider mode>`); the VALUE of the scope belongs to the plugin: `scopes: [{ module, tags, enter(el, { warn, outer }) → object | undefined, transparent? }]`. `transparent` marks an element that exists only to provide a scope (the core emits its children under it); leave it off for core-emitted ones. A `(module, tag)` pair has one owner (load-time error naming both); the claim goes through the same `canAliasIntercept` guard as element lowerings, and `isElementLoweringTag` also covers scope tags so the parser records where they were imported from. A plugin reads the scope back through `EmitContext.colorScope<T>()`. Without a provider the scope simply stays empty — the compiler alone opens scopes nobody reads.
- **Stub augmentation (`CompilerPlugin.stubs`).** The compile gates (`validateSwiftWithStubs`, `validateSwiftFilesWithStubs`, `validateKotlin`, `validateKotlinFiles`) take `ValidateOptions { augment: StubAugmentation[] }`; a `StubAugmentation` is `{ swift?(source) → string, kotlin?(source) → string }`, appended to the stub bundle only for inputs that need it (return `''` otherwise). The charts plugin's `stubs` appends the REAL generated engine plus the canvas-owned draw-list types for any emit that names `PyreonChartCanvas(`, exactly as `validate.ts` did before. The compiler never reads `plugin.stubs`; the caller passes it (`scripts/native-first-party-plugins.ts` for repo scripts, `src/tests/charts-plugin.ts` for the compiler's tests). Verdict-cache keys already hash the bytes handed to the compiler, so an augmentation is part of the key by construction.

**Discovery, not a built-in.** The charts plugin ships in `@pyreon/charts`' manifest (`pyreon.native.plugin: "./lib/native-plugin.js"`, `modules: ["@pyreon/charts"]`), so `pyreon-native build|check|plugins|explain` loads it lazily when a source file imports the package AND the app declares it. There is NO built-in copy in the compiler: a bare `transform()` / `createCompiler()` without discovery does not lower charts, and `--no-plugins` turns them off. The contract that a zero-config API user must load `@pyreon/charts/native-plugin` themselves was the one behaviour change of that phase, and it is now the rule for every library, `@pyreon/hooks` included.

**Where the chart tests run.** They stay in `@pyreon/native-compiler`'s suite, because that package owns the toolchain lanes (the warm Kotlin daemon, the 180s spec timeout, the real-SDK swiftc job in `native-validate.yml`). `src/tests/charts-plugin.ts` loads the plugin from the sibling package's SOURCE by relative path (the precedent is `native-chart-mirror-parity.test.ts`, which reads the engine the same way) — a `devDependency` back to `@pyreon/charts` would be a package cycle. The golden corpus keeps the chart fixtures under `packages/fundamentals/charts/native-golden/` (their keys and compile filenames are unchanged, so the hashes did not move); `scripts/check-native-golden.ts` reads both directories. The engine generator moved with the registry it writes: `bun packages/fundamentals/charts/scripts/gen-native-engine.ts` (it runs the public compiler API only, with no plugin loaded, which is itself a check that the engine source needs none).

## Expression and lifecycle seams (`receivers`, `functions`, `memberReads`, `prepareEmit`, …)

`@pyreon/flow` is the second library whose lowering lives in its own package (`packages/fundamentals/flow/src/native-plugin/`, discovered through `pyreon.native.plugin`), and `@pyreon/native-compiler` has no `@pyreon/flow` specifier left (13 → 0 in the boundary baseline). Flow, unlike charts, is not a set of claimed JSX tags: it is a state object (`createFlow`/`useFlow`) whose methods, config writes, helper functions, constants and renderer components are reached from the middle of ordinary expressions. Each new seam below has one row, a `plugin-expression-seams.test.ts` user that is NOT flow, and a bisect (neutered in the compiler: that spec and only that spec fails).

| `CompilerPlugin` member | What it lowers | Core site |
| --- | --- | --- |
| `receivers[type]` (`expr`, `assignValue`) | a call / member read / assignment whose chain is rooted at a binding one of the plugin's `decls` created (`flow.fitView()`, `flow.config.zoom = 2`); generalises one-hop `memberCalls` | `lowerPluginReceiver` / `lowerPluginAssign` (`registry-lookup.ts`) |
| `functions[name]` (`irName?`) | a plain `name(args)` call; claimed like a hook (`@pyreon/*` or `modules`), an ALIASED import is renamed back (the claimed names join `nativeLoweredHooks`), a same-named user function is left alone. `irName` keeps a shipped library's IR callee spelling, which is hashed into synthesised struct names | `lowerPluginFunction`, `functionIrName` |
| `identifiers[name]` | a bare library constant (`DEFAULT_NODE_WIDTH`) | `lowerPluginIdentifier` |
| `memberReads` | a member read recognised by SHAPE rather than root binding (`MarkerType.Arrow`, `props.edge.data.x`); called for every member read once registered, so the first check must be cheap | `memberReadLowerings` |
| `intrinsics[]` (`tags`, `applies(ctx)`, `emit`) | a lowercase DOM tag (`path`) that means something only inside the plugin's own renderer components | `findIntrinsicLowerings` |
| `intrinsicAdvice` | the sentence appended to the "DOM/SVG element has no native lowering" warning when the plugin is loaded (the core no longer names any library) | `intrinsicElementAdvice` |
| `prepareEmit(input, ctx)` + `ctx.fileState` | a per-file pass after the components and module constants are known and before any is emitted; keeps file-scoped memory and may return extra components | `emitPreparations` |
| `propsTypes[name]` (`resolve`, `liftInlineArg`) | a library props type (`NodeComponentProps<D>`) resolved to the object shape a component's parameters read from; an inline type argument is lifted to ONE struct so the resolved props and the plugin's literals agree on a name | `findPropsTypeResolver` |
| `decls[type].lifecycle` (`stableHost`, `swift`, `kotlin`) | Swift modifier lines / Compose effect lines a declaration appends, and the stable-host wrap a mount-time `.task` needs | `pluginLifecycleLines`, `pluginNeedsStableHost` |
| `elements[].aliasable` | claims the tags under an aliased import (`import { FlowWebView as Hosted }`); off by default | `ElementRegistry.find(tag, guard, importedAs)` |
| `ParseContext` `args` / `typeArg` / `expr` / `resolveStatic` / `unwrap` / `propKey` / `hasDynamicKey` / `dynamicKeyText` / `report` | what a recognizer needs to read a literal config object | `parse.ts` |

Traps the move surfaced, each now locked:

- **The IR callee spelling is part of the output.** Synthesised struct names are hashed from the IR, so a library that shipped before `functions` existed must keep its spelling (`irName`) or every emitted name changes and the golden diverges. A plugin with no prior output omits it.
- **`ExtDecl.payload` may carry `undefined`.** An embedded `ExprIR` spells an untyped lambda parameter's `paramTypes[i]` as `undefined`; it survives `structuredClone`, so the JSON check refuses functions, `NaN`, class instances and cycles but not `undefined`.
- **A local named `host` shadows the facade.** The plugin's own host state and the `host.*` facade slot are different things; name the former otherwise.
- **Plugin-less compiles no longer lower flow.** A test or tool that compiles flow source must load the first-party plugins (`tests/first-party-plugins.ts`); without the plugin the source warns "no native lowering" like any unclaimed library.
- **Verified:** golden (536 entries) byte-identical, plus a TasksApp capture identical to the parent. The CI reconciliation also passed the complete native suite with real Swift/Kotlin compilers and SDK fixtures. Phase 3i passed all required hosted checks, including iOS simulator UI tests and device SDK archive, before auto-merge.

## Code-shaped plugins (`calls` + `decls` + `memberCalls` + `unlowered`)

A service is DATA (a hook with no arguments). When the lowering needs CODE — read an argument, decline a shape it cannot lower, render per-target text — a plugin supplies a recognizer and an emitter (`call-lowering.ts`), and the core never learns the library.

- **Open declaration.** `DeclIR` has one open member, `ExtDecl = { kind: 'ext', plugin, type, name, payload }`. `payload` is a JSON record (`ExtPayload`): the pass pipeline `structuredClone`s the IR, so functions, `NaN`, cycles and class instances are refused (`undefined` is allowed: it survives the clone and is how the IR spells an absent slot, e.g. an untyped lambda parameter) at recognition with the plugin named. The core never switches on a third-party `type`; it dispatches by `(plugin, type)`.
- **Recognize.** `CompilerPlugin.calls` is keyed by hook/function name: `(call: CallSite, ctx: ParseContext) => ExtDeclSpec | undefined`, where `ExtDeclSpec = { type, payload? }`. It runs where the parser's by-name branches sit (right after the service lookup in `tryDeclFromVarDeclarator`), so a recognizer that returns `undefined` DECLINES and the parser continues down the same chain as if the plugin were absent. The compiler stamps `plugin` and `name` onto the result (a plugin cannot mis-attribute a declaration or claim another plugin's `type`) and fails loudly if `type` has no emitter.
- **Claim rule.** Identical to services: a name is claimed when imported from `@pyreon/*` or from one of the plugin's `modules` (exact or `name/` prefix). It goes through the same binding resolution (`hook-binding.ts`): a user's own `function createToy()` or an import from somewhere else is NOT the plugin's call. Two plugins claiming one name — or a name that is also a service hook — fail at load, naming both owners. A `(plugin, type)` pair cannot collide: the plugin name is the namespace and a duplicate plugin name is already an error.
- **Emit.** `CompilerPlugin.decls` is keyed by `type`: `DeclEmitter = { swift(decl, ctx), kotlin(decl, ctx): string | string[], legacyKind? }`. Kotlin lines are joined with the same newline-and-indent a built-in multi-line declaration uses. `legacyKind` is for built-ins only: `moduleTag` (the hash that names synthesized structs) hashes a declaration as `{ kind: legacyKind, name, ...payload }`, so moving a closed `kind` into a plugin does not move any emitted name.
- **Registration.** `createRegistries` builds a `CallRegistry` (`registries.calls`) next to the service and element registries; same instance ownership, same conflict rules. `plugins` / `explain` list the recognizers with their owners and declaration types.
- **Expression hook (`memberCalls`).** `CompilerPlugin.memberCalls` is keyed by METHOD name: `{ swift(call, ctx), kotlin(call, ctx) } → string | undefined`, with `call = { receiver: ExtDecl, method, args }`. It claims `<receiver>.<method>(…)` where `<receiver>` is a binding one of THIS plugin's `decls` created, so a plugin never sees a call on any other receiver and two plugins may both claim `dispatch` — the receiver's owner decides. Returning `undefined` declines (the call emits as without the plugin). The emitters check it first in the `call` expression arm: `registries.calls.memberCalls.get(method)` is one `Map.get`, so a call nobody claims costs nothing further, and the receiver is resolved through the component's declarations (`PluginScope.declByName`). Requires `decls`. Used by `chart.dispatch({...})`, which lives in `@pyreon/charts` `native-plugin/plugin.ts`.
- **Unlowered-module metadata (`unlowered`).** `CompilerPlugin.unlowered` is `{ [module]: { advice, supported?: string[] } }` — the advice the "has NO native lowering" warning names and the exports that DO lower. It is merged into `registries.unlowered`; `findUnloweredModule(module, coreMap)` (`registry-lookup.ts`) checks the plugin entries first, then the hand-maintained `UNLOWERED_PYREON_MODULES` in `parse.ts`, which keeps only modules no plugin owns. A module supplied by two plugins is a load-time error; a plugin's entry wins over a core one. The `@pyreon/charts` entry (and its `supported` list, derived from the chart host tables plus the plugin's own `calls`) lives in `@pyreon/charts` `native-plugin/plugin.ts`.
- **Boundary.** Same as element lowerings: a plugin file imports nothing from `emit-swift`, `emit-kotlin` or `parse`.

`ParseContext` is the only way a recognizer reads the parser:

| Facade member | Delegates to | Used by |
| --- | --- | --- |
| `declName` | the `const <name> =` binding the parser is lowering | chart handle (via the stamp), toy plugin |
| `stringLiteralArg(i)` | argument `i` when it is a string `Literal` | the third-party path test |
| `warn(msg)` | `ctx.warnings.push("Declaration <name>: …")` | the third-party path test |
| `report(msg)` | `ctx.warnings.push(msg)` — verbatim, for messages that already name the declaration | the flow recognizer |
| `args` | the call's arguments as written (ESTree nodes) | the flow recognizer |
| `typeArg()` | `parseGenericTypeArg` — the first generic type argument as a `TypeIR` (`unknown` when none) | the flow recognizer (`createFlow<Row>`) |
| `expr(node)` | `parseExpr` — any sub-node as the IR the emitters consume | the flow recognizer |
| `resolveStatic(node)` | the file's static initializers (`const nodes = [...]` → the array literal) | the flow recognizer |
| `unwrap(node)` / `propKey(prop)` / `hasDynamicKey(prop)` / `dynamicKeyText(prop)` | `unwrapTypeLayers`, `staticPropKey`, `hasDynamicKey`, `dynamicKeyText` | the flow recognizer |

`CallSite` is `{ callee, argCount }`. Not yet exposed (needed by the other by-name recognizers): the argument as a typed node view, `resolveConst(name)` (module-scope string constants), generics (`useFetch<T>`), and destructured results. `EmitContext.ident(name)` was added for declaration emitters.

**Worked proof: `createChartHandle()`.** `native-plugin/plugin.ts` (the `@pyreon/charts` plugin) owns the recognizer, both declaration emitters, the `handle.dispatch({...})` lowering (`memberCalls`) and the `@pyreon/charts` unlowered-module metadata; `parse.ts`, the `chart-handle` `DeclIR` kind and both emitters' handle-name sets, series map, placeholder regex and `dispatch` branches are gone, and the emitted Swift/Kotlin is byte-identical (golden corpus). The `<PlotChart handle={chart}>` host lives in the plugin on both targets (see "Worked proof: the chart hosts").

## Shared facts between plugins (`scanModule`, `requestSources`)

These three libraries do not lower independently: an `@pyreon/http` endpoint feeds `useFetch` / `useQuery` / `useStream`, a schema bound to an endpoint's `response` is evidence for the decode type's `Int`/`Double` fields, and `@pyreon/validation`'s adapters emit the same schema struct `@pyreon/validate`'s `s` DSL does. A plugin split has to put each FACT with its owner and give consumers a way to read it without importing the owner's parser.

**Activation decides ownership.** A plugin is loaded only when the app imports one of its `modules` AND depends on its package. A hook is therefore owned by the package an app imports it FROM, not by the runtime it happens to drive: `useFetch` is imported from `@pyreon/hooks`, so it is the hooks plugin's (its `fetch` declaration and `PyreonFetch` harness live in `packages/fundamentals/hooks/src/native-plugin/fetch.ts`); `useQuery` / `useStream` / `new QueryClient()` / `<QueryClientProvider>` come from `@pyreon/query`; `createHttp` / `.endpoint()` come from `@pyreon/http`; `s` / `withField` from `@pyreon/validate`; `zodSchema` / `valibotSchema` / `arktypeSchema` from `@pyreon/validation`.

| Plugin (package) | Owns | Publishes |
| --- | --- | --- |
| `@pyreon/http` | the module scan (clients, endpoints), endpoint → request resolution (URL templating, query string, literal headers / json body, runtime `:param` via `PyreonURL`, response-schema evidence), the "http metadata declares nothing" skip, its `unlowered` entry | a **request source** |
| `@pyreon/query` | `useQuery` (`query`), `useStream` (`stream`), `new QueryClient()` (`query-client`), `<QueryClientProvider>`, the stream-opener scan, their harnesses, typing, receivers, stubs | — |
| `@pyreon/validate` / `validation` | see "Module-level seams" below | schema items |

There is NO `requires` between `@pyreon/query` and `@pyreon/http`: a request source is optional (an app with `useQuery` and no endpoint has none), and a hard `requires` would make every `@pyreon/query` app load `@pyreon/http`. The facts cross through `ParseContext.requests`, which is simply empty when no source is loaded.

### Seams this group added (each library-agnostic, each with a toy-plugin user in `tests/plugin-scan-seams.test.ts`)

| Seam | What it replaces in the core | Used by |
| --- | --- | --- |
| `CompilerPlugin.scanModule(scan)` — a per-file pre-pass: `scan.fileState`, `scan.staticString`, `scan.skipTopLevel(pred)`, `scan.lowered(module, name)`, `scan.report` | the three hard-coded `collectHttpClients` / `collectEndpointDefs` / `collectStreamOpeners` calls, `isHttpMetadataNode`, the `httpClientSchemaNames` / `streamOpenersAllLowered` branches of the unlowered-import warning | http (clients, endpoints, skipped metadata), query (stream openers) |
| `CompilerPlugin.requestSources` — `{ has(name, ctx), resolve(name, arg, options, ctx) }` → `ResolvedRequest` | `ctx.endpointDefs` / `resolveEndpointUrl` read by `useFetch`, `useQuery` and `useStream` | http provides; core `useFetch` and query consume through `ParseContext.requests` |
| `ParseContext.requests`, `.recordDecode`, `.staticString`, `.statements`, `.typeArgOf`, `.fileState` | the parser helpers the moved recognizers called directly | query recognizers |
| recognizer verdicts: a declaration, `undefined` (DECLINE — fall through), or `null` (CLAIM without declaring: the recognizer reported why it cannot lower, and the binding must not fall to the generic value-const emit) | the old `return null` of `useQuery` / `useStream` bail-outs | query |
| `CallSite.construct` — `new Name(…)` reaches `calls` recognizers | the `NewExpression` branch for `QueryClient` | query |
| `CompilerPlugin.destructureCalls` | the hard-coded `useQuery` entry in `DESTRUCTURE_CONTAINER_HOOKS` (it only decides WHICH warning an unlowerable destructure gets; the lowering itself is the general destructure arm) | query |
| `DeclEmitter.typing.callRead` | `InferenceCtx.streams` + the `useStream` call-read typing | query (`stream`) |
| `DeclEmitter.asyncState` | `_fetchNames` driving `<Suspense>` / `<ErrorBoundary>` | query (`query`) |
| `DeclLifecycle.tailOrder` | the fetch → query → stream modifier grouping | query (`query` 20, `stream` 30; core `fetch` stays first) |
| `EmitContext.statements(stmts, indent, locals?)` | the stream `onEvent` body emit with seeded handler locals (Swift seeds; Kotlin infers handler locals itself and ignores `locals`) | query (`stream`) |
| the Kotlin `typeText` runs against the component's own `KotlinCtx` | `kotlinType(d.type, ctx)` — an inline object type (`useQuery<{ data: { id: string } }>`) synthesizes a named data class there | query |
| `plugin-api` AST helpers (`topLevelDeclarators`, `readObjectProp`, `propName`, `staticPropKey`, `hasDynamicKey`, `dynamicKeyText`, `literalScalar`, `readLiteralEntries`, `readEntryNodes`, `readJsonLiteral`, `isNullishLiteral`, `unwrapTypeLayers`) — the same functions the parser uses, moved to `plugin-ast.ts` | private copies in `parse.ts` | http, query |

**Byte-identical contract.** Moved declarations keep their legacy kind (`legacyKind`), so struct names hash unchanged, and the payload key order reproduces the old IR object's, which `moduleTag` hashes. The golden corpus carries 192 fixtures harvested from the pre-move tests (`packages/fundamentals/{http,query,validate}/native-golden/`), recorded from the parent compiler BEFORE any code moved; the gate was byte-identical (no `--update`) after the move.

## Module-level seams (`topLevel`, `items`, `methodCalls`, `exprs`)

A schema is not a declaration inside a component. It is a FILE-SCOPE item that emits beside the structs and enums, before every component, and that other code reads BY NAME: a form's `schema: Pet`, an endpoint's `response: Pet`, `Pet.safeParse(x)`. Four small, library-agnostic seams carry that (`module-items.ts`, `plugin-api` types, one row each below, one toy-plugin user each in `tests/plugin-module-items.test.ts` that is NOT a schema). Every recognizer may DECLINE (`undefined`): the parser then continues as if the plugin were absent.

| `CompilerPlugin` member | What it lowers | Core site |
| --- | --- | --- |
| `topLevel` + `items[type]` | a file-scope declaration (`const Pet = s.object({ … })`, `const email = withField(…)`): the recognizer returns `{ type, name, payload }`, the compiler stamps `plugin` and refuses a type with no emitter or a payload that is not JSON; the emitter returns one string per declaration on each target. The open `ExtModuleItem` sits in `ParseResult.moduleItems`; the first plugin to return an item owns the node | `tryPluginTopLevel` (`parse.ts`), `lowerPluginItem` |
| `items[type].after` | where the item emits among the core's own module items, in order: `'models'`, `'declarations'` (a feature's schema struct and binding, which emitted before every schema), then the default `'data'` | `itemsInSlot` |
| `items[type].legacyList` | the closed array an item REPLACED, so `moduleTag` hashes its payload where the array stood (`'fieldMetas'` \| `'zodSchemas'` \| `'features'`); an item without one is hashed as an extra trailing element | `moduleTag` |
| `items[type].bindings` (`names`, `reserved`, `rename`) | the file's one value/type namespace: which value bindings an item declares (a same-named `type` makes the value `Pet` → `PetValue`), every other name it takes, and how it applies the rename (it may add follow-on names, e.g. `Book_Author` after `Book`) | `disambiguateValueTypeNames` |
| `items[type].fieldValidators` | per-field validation a form that names the item gets: `useForm({ schema: Pet })` reads `fields(item)` and the plugin's per-target validator body; `declaredBy` is the vocabulary the "no declaration by that name" warning uses, so the core names no library | `formFieldValidators` (both emitters) |
| `methodCalls[method]` + `exprs[type]` | `<receiver>.<method>(…)` recognized by SHAPE, keyed by method name (the key `'*'` sees every method call after the ones keyed by its own name — how `@pyreon/validate` warns about ANY method on a schema binding). The verdict is an `ext-expr` spec, `undefined` (decline, the next plugin's recognizer sees it) or `null` (claimed and reported through `ctx.unsupported`; the parser substitutes the empty literal). The open `ext-expr` IR node is rendered per target, typed by `exprs[type].typing` (`type`, and `member` which decides EVERY property read on the node), renamed by `exprs[type].rename` and hashed as a retired kind by `legacyHash` | `tryPluginMethodCall`, `lowerPluginExpr`, `inferTypeValue` |
| `refineStructs` | edit the file's structs from the items and from the decode sites other plugins recorded through `ParseContext.recordDecode` (a response schema deciding `Int` vs `Double`); runs after the core's own struct float refinements and BEFORE the inline-object ones that read the field types it settles | `parsePyreon` |
| `finishModule` | a last pass over the finished item list (inline-synthesized items included); may edit payloads and report | `runModuleFinishers` |
| `ModuleParseContext` `report` / `fileState` / `staticString` / `expr` / `unsupported` / `addItem` | what a module-level recognizer reads of the parser; `addItem` appends an item synthesized outside a declaration AFTER every declaration-level one | `moduleParseContextFor` |

Traps the seams were built around, each now locked by a spec:

- **A `legacyList` the hash does not have drops the item from `moduleTag` silently**, so the shape check rejects anything but the three real lanes.
- **`reserved` must be in the namespace BEFORE the primary renames are chosen**, otherwise a primary `FooValue` can land on a nested name of the same spelling.
- **A recognizer that does not unwrap `export const` sees nothing**: an `ExportNamedDeclaration` is a different top-level node. The toy's first cut had exactly this bug and its binding test passed anyway, because the expression half of the rename still matched — the assertion now requires the item's own struct and value binding to follow.

### Ownership by activation (decided before the move)

A plugin loads only when the app DECLARES its package (`pyreon.native.plugin` in the manifest) and a source file imports one of its `modules`. That decides who owns what, and rules out `requires` between the two schema packages: an app may declare only one of them, and `@pyreon/validate` depends on `@pyreon/validation` (so it is installed) without the app naming it, which discovery cannot see.

| Package | Plugin | Activated by | Owns |
| --- | --- | --- | --- |
| `@pyreon/validation` | `@pyreon/validation` | `zodSchema` / `valibotSchema` / `arktypeSchema` | the three adapter recognizers, the Tier-2 decline for them and for `zodField` / `valibotField` / `arktypeField`, its `unlowered` advice, AND the shared schema model (`./native-plugin/{ir,recognize,schema,swift,kotlin,url-rule}.ts`): the walker for all four dialects, both emitters, the `schema` item emitter (hash lane, bindings, form validators) and the response-type evidence |
| `@pyreon/validate` | `@pyreon/validate` | `s`, `withField` | the wrapper-less `s.object` / `s.discriminatedUnion` recognizer, `withField` metadata, `Pet.safeParse(x)` and the inline `s.object({…}).safeParse(x)` (an `ext-expr`), the `safeParse` post-pass, its `unlowered` advice |

The shared model is exported from `@pyreon/validation/native-plugin`; `@pyreon/validate`'s plugin registers `createSchemaItem()` and `createSchemaStructRefinement()` under ITS OWN name. The compiler dispatches by `(plugin, type)`, so either package alone is self-sufficient and both together never collide. Facts cross the plugin boundary through the compiler, never by import: a form that names a schema reads `fieldValidators`, an endpoint's `response` reaches `refineStructs` through `ParseContext.recordDecode`.

What this removed from the core: `ParseResult.fieldMetas` / `zodSchemas` (now `moduleItems`), the `schema-validate` `ExprIR` kind (now `ext-expr`), ~3,300 lines of recognizer and emitter, `url-rule.ts`, `schemaInputNeedsConversion`, the `validateSchema*` / `inlineSchema*` parse state, the two table entries and two `tier2` entries naming the packages, and `@pyreon/validate` (5) / `@pyreon/validation` (8) from the boundary baseline. `@pyreon/native-compiler/plugin-api` gained the pure spelling helpers the emitters share with plugins (`KOTLIN_INT`, `swiftCodingKeysLines`, `localBase`, `kotlinMember`).

### How the schema libraries were verified

- **Golden:** 964 entries byte-identical, none updated. Before anything moved, 22 more fixtures (44 entries) were recorded from the parent compiler: 17 chosen from an lcov run, then 5 more after a BISECT of the move found four mechanisms no entry discriminated (the response-schema `Int`/`Double` refinement, the metadata item's slot and hash lane, the expression rename) plus a form's schema link under a rename. A green golden with a mechanism neutered means the corpus does not reach it, not that the mechanism is dead — bisect every moved mechanism against the corpus AND the specs. The lcov run: an lcov run over the corpus showed 78 + 20 + 3 + 16 unreached lines across the schema recognizers, emitters, form coupling, response refinement and the value/type rename; the new fixtures reach all but an unreachable discriminated-union guard and a `Map` arm of the namespace walker.
- **Behaviour changes, by design:** the `useForm({ schema })` "no declaration" warning names its libraries from the loaded plugins (identical text when `@pyreon/validation` is loaded, a generic sentence otherwise); `reserved` names enter the namespace BEFORE a rename is chosen (a nested schema named `FooValue` can no longer be collided with by renaming `Foo`); the Tier-2 declines now require the call to be imported from the package (a user's own `zodField` no longer warns, an aliased import does).
- **Compiler verification:** the CI reconciliation passed the complete native suite with real Swift/Kotlin compilers and SDK fixtures: 8,909 passing tests, 17 expected failures across 599 files. All 964 golden entries remained unchanged. The published head must also pass the required hosted native and device checks.

### Verification notes

`@pyreon/lathe`'s multiplatform emit asserts positive markers (`PyreonQuery<`, `PyreonZodSchema_`) by running the REAL compiler. It now loads the project's own `@pyreon/http` / `@pyreon/query` plugins (resolved, never fetched) before compiling — `verify/lower.ts:resolveNativeCompiler`.

## The gates

| Gate | What it proves | Run |
| --- | --- | --- |
| **Golden corpus** | `scripts/native-golden.json` holds a hash of code AND warnings per entry and target for every `golden-fixtures/*.tsx`, every package's own `native-golden/*.tsx`, the example apps and a set of snippets, compiled with ALL first-party plugins. A refactor must not change emitted output. | `bun scripts/check-native-golden.ts` (`--dump <dir>` writes the outputs to diff; `--update` is for a deliberate, reviewed behaviour change and is never used to absorb a move) |
| **Compiler boundary ratchet** | library specifiers and hook-name literals in the compiler's non-test source only decrease (`scripts/compiler-boundary-baseline.json`) | `bun scripts/check-compiler-boundary.ts` (`--update` only tightens) |
| **Plugin boundary** | a package plugin imports only `@pyreon/native-compiler/plugin-api` | `tests/plugin-boundary.test.ts` |
| **Plugin type gate** | every Swift/Kotlin type a service names is declared in the package's `native/` dirs or the shared runtimes — no phantom capability | `bun scripts/check-native-plugin-types.ts` (reads `@pyreon/hooks`' plugin directly) |
| **Lifecycle wiring** | every native container exposing `start()` / `connect()` is auto-started or documented manual | `bun scripts/check-native-lifecycle-wiring.ts` |
| **srcdirs drift / declarations** | the co-sourced Swift/Kotlin directories and package declarations agree | `validate-fast` (`check-native-srcdirs-drift`, `check-declarations`) |
| **Compile gates** | `swiftc -typecheck` / `kotlinc` against stubs on Linux, the real SDK on macOS, devices in `native-device.yml` | see "Reality checks" |

The golden corpus is only as strong as what it reaches. A plugin move therefore starts by MEASURING it: run `collectCorpus()` under v8 coverage restricted to the code being moved, list the lines no entry reaches, and record fixtures from the PARENT compiler for those lines BEFORE touching the code (a fixture recorded after the move proves only that the new code agrees with itself). Then bisect: neuter each moved mechanism in turn; the golden or a spec must fail. Gaps found that way are closed with another fixture recorded from the parent, which is why the git history of this arc interleaves `test(native): golden fixtures …` commits with the moves.

## What stays in the core, and why

These are not libraries, so their presence is correct, not a debt:

- **The router.** `createRouter`, `useParams`, `useNavigate`, `useLoaderData`, `<RouterView>` and the canonical `Link` are PMTC's own navigation contract: `@pyreon/native-router-swift` / `-kotlin` are PMTC runtimes, and the emitted route dispatch (`matchPath` over a route table) is generated, not lowered from a library's implementation. A plugin could not own it without owning the app shell.
- **The ui-system authoring API.** `styled(Prim)`, `rocketstyle()`, theme tokens and the 2-bucket size-class model are how PMTC styles the canonical primitives; the `styled` / `rocketstyle` frontends resolve at use-sites in the parser, and `useSizeClass` is read by the style emit.
- **The colour-scope PLUMBING.** `<PyreonUI mode>` and `<ColorModeProvider mode>` pin the framework-wide colour mode; the core opens and closes the scope (saved and restored in `finally`) and emits the transparent wrapper, while the scope's VALUE comes from a plugin's `scopes` (the charts plugin supplies it). Moving the wrapper would only move the plumbing next to a value it does not own. These two specifiers are what keeps `@pyreon/ui-core` in the boundary baseline.
- **`fetch` as a concept.** An async source driving `<Suspense>` / `<ErrorBoundary>` is the core's `asyncState` seam; what moved is the hook that declares one.

## Not moved yet (with the reason and the seam each needs)

Everything below is still named in the compiler. None of it is hidden by the ratchet: it is the remaining baseline (4 specifiers, 86 hook-name literals).

- **`@pyreon/store` (`defineStore`) and `@pyreon/state-tree` (`model().create()`).** They are not call lowerings: each is a MODULE-SCOPE singleton whose IR (`StoreDefnIR`, `ModelDefnIR`) the parser collects, whose class the emitters write, whose use sites (`useApp().store.x`, `counter.n`, assignments, method calls) are rewritten in about a dozen expression arms per emitter, and whose signal fields take part in the float-widening and struct-synthesis passes. Moving them needs three generic seams that do not exist: (1) an item-rooted receiver (a `receivers` variant keyed by a module item and rooted at a hook CALL or an instance binding, not at a declaration inside a component); (2) the parser's function-declaration and signal-declaration builders on `ModuleParseContext`, so a recognizer can build method and field IR; (3) item fields in the inference context (`typing.fields`), so a store's signals type reads and widen. The recognizers themselves are small; the three seams are the work.
- **`@pyreon/form` (`useForm`, `useFieldArray`).** The container is the easy half. The hard half is its integration with core primitives: `<Field value={form.values.x}>` emits a two-way `Binding`, `<For each={fa.items()}>` scopes its row parameter so `item.value()` unwraps, and an `onSubmit` parameter reads a dictionary. Seams needed: a value-binding provider for `<Field>`, a `<For>` row-scope hook, and a handler-parameter scope.
- **The remaining `@pyreon/hooks` hooks: `useNativeModule`, `useSizeClass`, `useColorScheme` / `useColorMode`, `useToggle` / `useCounter`, `useDebouncedValue` / `useDebouncedCallback` / `useThrottledCallback`, `useInterval` / `useTimeout`.** `useFetch` and the five stateful containers (`useWebSocket`, `useDatabase`, `useSecureStorage`, `useMap`, `useAuth`) are the template: a recognizer, a decl emitter, `receivers` and `typing`. What is left each reaches deeper into the core than a container does. `useSizeClass` and `useColorScheme` / `useColorMode` feed the style emit and the colour-scope plumbing (core contract above); `useToggle` / `useCounter` are scope-sensitive metadata the emitters key by component (`pure-state`); the debounce / throttle hooks and `useInterval` / `useTimeout` lower at STATEMENT position and weave into the component's mount harness, which needs a statement-position recognizer seam; `useNativeModule` threads an app-defined module name into the Kotlin `Context`. `useHotkey` belongs to `@pyreon/hotkeys`, not hooks.
- **`web-only-packages.ts`** is generated from every package manifest's `multiplatform` declaration by `check-multiplatform-tier --write-table`, which also gates it; it is data the compiler carries so a standalone `transform()` can name a web-only import, and is excluded from the ratchet by name.

Known defects found while moving code, deliberately NOT fixed here (the golden holds the current output, and a fix is a reviewed behaviour change, not a refactor): a nested `rx.take(rx.reverse(ids), 2)` emits `rx.reverse(ids)()` for the inner call (the recognizer wraps the source argument in a read instead of lowering it recursively); a component-level `const` holding `new SizedMap<…>()` mis-types its member reads as a dictionary's.

## Verification record

| Phase | Plugins moved | Golden entries | native-compiler library specifiers (packages) | hook-name literals |
| --- | --- | --- | --- | --- |
| 3i | flow | 536 | flow 13 → 0 | |
| 3k | validate, validation | 964 | validate 5 → 0, validation 8 → 0 | |
| 3l | machine, i18n, toast, a11y, table, dnd, sync | 1410 | 47 (39) → 16 (12) | 113 → 109 |
| 3m | elements, coolgrid, permissions, url-state, storage, sized-map, kinetic, rx, feature; the hooks table; `useFetch`; the hooks containers | 1516 | 16 (12) → 4 (3) | 109 → 66 |

For phase 3m: every golden entry byte-identical, never `--update`d; every new seam has a toy-plugin spec and a bisect; every moved mechanism was bisected against the golden and the specs (gaps closed with fixtures recorded from the parent); the seven native example apps build to identical output on both targets with plugins discovered. The CI reconciliation passed the complete native suite with real Swift/Kotlin compilers and SDK fixtures: 9,000 passing tests, 17 expected failures across 612 files. The earlier toolchain-free failures are not exemptions from this check. Compiler fixtures load the actual owning plugins; negative controls reproduce the stale fixture failures before restoring the fix. All 55 fast gates and the affected package typechecks passed. Required hosted native and device checks still run on the published head; local results do not replace them.
