// Internal IR (intermediate representation) for Pyreon → native emit.
//
// The compiler parses a Pyreon JSX source to oxc AST, walks the AST to
// build this IR, then each target emitter (Swift / Kotlin) consumes the
// IR. Decoupling via IR means new targets just add a new emitter; the
// parser-side never changes.
//
// IR shape is intentionally minimal for Phase 0 — only what the seven
// starter fixtures need. Grows as more constructs land.

export type TargetLanguage = 'swift' | 'kotlin'

export interface EmitOptions {
  target: TargetLanguage
  /**
   * Canonical font name → iOS PostScript name, from the shared
   * `fonts/` dir (read by the CLI's `build` step via `scanFontDir`).
   * `<Text font="Brand">` emits `.font(.custom("<postscript>", …))` on
   * iOS — the PostScript name is the only thing `Font.custom` accepts.
   * Android uses a runtime `res/font` lookup, so it doesn't need this.
   */
  fonts?: Record<string, string>
  /**
   * The file this source came from, used only in diagnostics.
   *
   * A parse error is reported as `file:line:col: message`, and without this
   * every such message names the default `input.tsx` — a path that does not
   * exist, so the position is not just unhelpful but actively misleading.
   * Callers that have a real path should pass it; the default stays for
   * in-memory callers that genuinely have none.
   *
   * It is ALSO what marks the emit as one module of a multi-file build: when
   * set, the file-scope structs PMTC synthesizes for anonymous object literals
   * get a per-module suffix (`__Obj0_k3x9a`), so two generated files in one
   * Xcode target / Gradle source set cannot both declare `__Obj0`. Without it
   * the bare `__ObjN` names are kept, which is correct for a single file.
   */
  filename?: string
}

export interface ComponentIR {
  /** Component name from `export function NAME(...)`. */
  name: string
  /**
   * Component props parsed from the function's first parameter when it
   * carries an object type annotation. The parameter binding name (`props`,
   * `p`, etc.) is captured separately so the emitter can rewrite member
   * accesses like `props.title` → `title` on the target. Empty when the
   * component takes no params or the param is untyped.
   */
  props: PropIR[]
  /**
   * The first-parameter binding name (`props`, `p`, etc.) used to recognise
   * `<paramName>.field` member accesses inside the body and rewrite them to
   * bare field references on the target. Undefined for prop-less components.
   */
  propsParamName: string | undefined
  /** Top-level declarations inside the component body. */
  decls: DeclIR[]
  /** The expression the component returns. */
  returnExpr: ExprIR
}

export interface PropIR {
  /** Prop name (the field key in the JSX `<Comp x={...}>` site). */
  name: string
  /** Declared type from the TS annotation. */
  type: TypeIR
}

/** A JSON value — what an {@link ExtPayload} may hold (it must survive `structuredClone` and a JSON round trip). */
export type ExtValue =
  | string
  | number
  | boolean
  | null
  | readonly ExtValue[]
  | { readonly [key: string]: ExtValue }

/** A plugin declaration's data: a JSON-serializable record. */
export type ExtPayload = { readonly [key: string]: ExtValue }

/**
 * The open declaration kind. A plugin's `CallRecognizer` produces one (the
 * compiler stamps `plugin` and `name`), and the same plugin's `DeclEmitter`
 * for `type` renders it on each target. `payload` is the plugin's own data and
 * must be JSON — the pass pipeline clones the IR with `structuredClone`.
 */
export interface ExtDecl {
  readonly kind: 'ext'
  /** The owning plugin's `name`. */
  readonly plugin: string
  /** The plugin-local declaration type (a key of that plugin's `decls`). */
  readonly type: string
  /** The binding the author wrote (`const <name> = …`). */
  readonly name: string
  readonly payload: ExtPayload
}

/**
 * The open FILE-SCOPE declaration: a plugin's own top-level item (a schema, a metadata record), emitted
 * beside the file's structs and enums and read by name from elsewhere in the file. A plugin's `topLevel`
 * recognizer produces one (the compiler stamps `plugin`), and the same plugin's `items[type]` emitter renders
 * it. `payload` must be JSON — the pass pipeline clones the IR with `structuredClone`; unlike an
 * {@link ExtDecl}'s it is mutable, because a plugin's own refinement passes edit it in place.
 */
export interface ExtModuleItem {
  /** The owning plugin's `name`. */
  plugin: string
  /** The plugin-local item type (a key of that plugin's `items`). */
  type: string
  /** The binding the item declares. */
  name: string
  payload: { [key: string]: ExtValue }
}


export type DeclIR =
  /**
   * Reactive signal declaration. The classic shape is `signal<T>(initial)`
   * — emits as `@State` on Swift / `mutableStateOf` on Kotlin.
   *
   * G5 (TodoMVC walkthrough) adds `storageKey` for persistent signals
   * declared via `useStorage<T>('key', default)`. When set, the Swift
   * emit shifts to `@AppStorage("key")` (SwiftUI's persistent property
   * wrapper) and the Kotlin emit shifts to `rememberSaveable` (Compose's
   * state-preservation primitive). `storageKey` is `undefined` for
   * regular signals — emit paths default to the non-storage shape.
   */
  | { kind: 'signal'; name: string; type: TypeIR; initial: ExprIR; storageKey?: string }
  /**
   * Computed value via `computed(() => expr)` or `computed(() => { ... })`.
   * The legacy single-expression form populates `expr`. Multi-statement
   * BlockStatement bodies populate `body` with the full statement
   * sequence — emit produces a multi-statement getter
   * (`private var X: T { let x = ...; if cond { return X } ; return Y }`).
   *
   * Exactly one of `expr` / `body` is populated. Phase 2 follow-up
   * closing the TodoMVC `visible: Any { xs }` typecheck blocker.
   */
  | { kind: 'computed'; name: string; expr?: ExprIR; body?: StatementIR[] }
  /**
   * Local function declaration via `const fn = () => { ... }`
   * (Parser-A from `native-platforms-todomvc-walkthrough.md`). Emits
   * as a `private func` on Swift / a private fn on Kotlin.
   *
   * Multi-statement BlockStatement bodies are supported via `body`
   * carrying StatementIR[]; a single-expression arrow body lands as
   * `body: [{ kind: 'return', expr }]` for uniformity.
   */
  | {
      kind: 'function'
      name: string
      params: { name: string; type: TypeIR; defaultValue?: ExprIR | undefined }[]
      returnType: TypeIR
      body: StatementIR[]
    }
  /**
   * Router instance declaration via `createRouter({ routes: [...] })`
   * from `@pyreon/router`. Phase C4 shipped the SCAFFOLD (bare instance
   * emit); Phase C5 ADDS optional `routes: RouteIR[]` so the emitter
   * can produce per-target route definitions:
   *   Swift   →  @State private var router = PyreonRouter()
   *              + `.navigationDestination(for: String.self)` block
   *                inside the `<RouterProvider>` content closure
   *   Kotlin  →  val router = remember { PyreonRouter() }
   *              + `NavHost { composable("/path") { Component() } }`
   *                block replacing the bare RouterProvider content
   *
   * `routes` is undefined when the parser couldn't extract a literal
   * routes array (e.g. `createRouter()`, `createRouter(opts)` with a
   * non-literal config, or an object literal that doesn't match the
   * expected `{ routes: [{ path, component }, ...] }` shape). In that
   * case the emit falls back to the C4 bare-instance shape — back-compat.
   */
  | {
      kind: 'router'
      name: string
      routes?: RouteIR[]
      /**
       * Global router-level guards: `beforeEach: [fn]` / `afterEach: [fn]`
       * on the createRouter config. Each entry is an IDENTIFIER REF
       * (function name captured at parse time, like `authGuard`). The
       * runtime PyreonRouter's `push`/`replace` chains beforeEach (any
       * returning false blocks the navigation), then runs afterEach
       * fan-out after the path commits.
       *
       * Conservative shape: identifier refs only. Inline arrow bodies
       * (`beforeEach: [(p) => isAuthed()]`) are NOT lowered (they'd need
       * the arrow-emit + closure-capture machinery that per-route boolean
       * guards already use — closure form is a documented follow-up) — but
       * they are no longer dropped SILENTLY: a non-identifier element emits
       * a named warning pointing at the named-function fix, because an
       * inline guard that vanishes would leave the navigation ungated with
       * no signal (a security foot-gun).
       *
       * Undefined when the config has no such field OR all entries
       * were dropped (back-compat).
       */
      beforeEach?: string[]
      afterEach?: string[]
    }
  /**
   * Router hook binding via `useNavigate()` or `useParams()` from
   * `@pyreon/router`. Phase C4 maps these directly to the native
   * runtimes' identically-named hooks:
   *   Swift   →  let navigate = useNavigate(router: pyreonRouter)
   *              (the View struct gains `@Environment(\.pyreonRouter)
   *               private var pyreonRouter` automatically)
   *   Kotlin  →  val navigate = useNavigate()
   *              (Compose function reads LocalPyreonRouter.current
   *               directly via CompositionLocal — no transform needed)
   *
   * `useParams()` follows the same shape.
   */
  | { kind: 'router-hook'; name: string; hook: 'navigate' | 'params' }
  /**
   * Phase 4.2 — form state via `useForm({ initialValues })` from
   * `@pyreon/form` (the native subset). Emits a `PyreonForm` reactive
   * container:
   *   Swift  → @State private var form = PyreonForm(initialValues: ["email": "a@b.com"])
   *   Kotlin → val form = remember { PyreonForm(mapOf("email" to "a@b.com")) }
   *
   * `initialValues` carries the literal string-keyed defaults captured from
   * the `{ initialValues: { email: 'a@b.com' } }` config. Only string-valued
   * entries survive — the native `PyreonForm` surface is `[String: String]`,
   * so non-string defaults are dropped (the field still exists at runtime,
   * just unseeded). `onSubmit` / `validators` are web-only function logic and
   * are intentionally ignored on native — submission flows through the
   * container's `beginSubmit` / `endSubmit` API.
   *
   * Field reads (`form.values`, `form.errors`, `form.touched`,
   * `form.isSubmitting`) map to the container's @Observable properties on
   * Swift / Compose `MutableState` `.value` reads on Kotlin. `form.isValid`
   * is a derived `Bool` getter — a plain read on both targets (no `.value`).
   */
  | {
      kind: 'form'
      name: string
      initialValues: { key: string; value: string }[]
      /**
       * v2 (form-binding arc) — per-field sync validators from
       * `useForm({ validators: { email: (v) => … } })`. Each arrow
       * emits as a native closure in the PyreonForm init ("" = valid).
       */
      validators?: { key: string; param: string; body: ExprIR }[]
      /** v2 — `onSubmit: (values) => …` callback (expression or block body). */
      onSubmit?: { param: string; body: StatementIR[] }
      /**
       * `schema: SomeSchema` naming a top-level schema declaration a plugin lowers
       * (a plugin module item that offers `fieldValidators`).
       *
       * The declaration already emits a struct / data class whose `parse()`
       * enforces every captured constraint — but nothing connected it to the
       * form, so `useForm({ schema })` dropped the option SILENTLY and
       * `isValid` was true on native for input the web rejected. Found by the
       * iOS device gate, which is the only thing that ran a schema-validated
       * form. The emitters turn this into per-field validator entries.
       */
      schemaName?: string
    }
  /**
   * A component-body `onMount(() => { … })` call — the documented lifecycle
   * escape hatch ("call .start()/.connect() from an onMount"). Lowers to a
   * mount-time harness: SwiftUI `.onAppear { … }` on the stable-identity
   * host (the fetch-arc ZStack — a transparent Group redistributes the
   * modifier onto conditional branches and re-fires it per flip); Compose
   * `LaunchedEffect(Unit) { … }`. A returned cleanup fn is NOT emitted in
   * v1 (named warning). Pre-fix the whole call was a SILENT drop — the
   * component-body walker only handled declarations + return.
   */
  | { kind: 'on-mount'; body: StatementIR[] }
  /**
   * `useHotkey('mod+s', () => { … })` in a component body.
   *
   * Lowers to a real keyboard shortcut on both targets — SwiftUI binds it to a
   * hidden zero-size Button (`.keyboardShortcut` attaches to a CONTROL, and the
   * button's action IS the handler), Compose to a focused key handler on the
   * component root. `combo.modifiers` keeps `mod` symbolic because it resolves
   * differently per platform: Command on iOS, Ctrl on Android.
   */
  | { kind: 'hotkey'; combo: HotkeyComboIR; body: StatementIR[] }
  /**
   * Phase 3 — destructured router params via `const { id } = useParams()` (or
   * `const { id: userId } = useParams<{ id: string }>()`). The web-idiomatic
   * destructure shape; emits one local binding per field, each reading the
   * active router's params map:
   *   Swift  → private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }
   *   Kotlin → val id = useParams()["id"] ?: ""
   *
   * `params[]` carries `{ key, local }` pairs — `key` is the param name read
   * from the map, `local` is the bound identifier (they differ only under
   * `{ id: userId }` aliasing). Closes the documented-but-unimplemented gap
   * where `const { id } = useParams()` referenced an undeclared `id`.
   */
  | { kind: 'params-destructure'; params: { key: string; local: string }[] }
  /**
   * `useToggle(initial)` / `useCounter(initial, { min, max })` from
   * `@pyreon/hooks` — pure state containers with no platform dependency at
   * all (a signal plus a few mutators). They needed no runtime; what they
   * needed was a lowering, and without one the call emitted verbatim.
   *
   * `bounds` carries `useCounter`'s literal clamp, baked into every mutator
   * at the use site so the native arithmetic clamps exactly as the web's
   * does.
   */
  | {
      kind: 'pure-state'
      name: string
      hook: 'useToggle' | 'useCounter'
      /** The state field's initial value. */
      initial: boolean | number
      /** useCounter's literal min/max, when given. */
      bounds?: { min?: number; max?: number }
    }
  /**
   * `useDebouncedCallback(fn, ms)` / `useThrottledCallback(fn, ms)`.
   *
   * Unlike `useDebouncedValue`, these return a CALLABLE carrying
   * `.cancel()` / `.flush()`, so there is a handle a caller reaches — which
   * is why they need the PyreonRateLimit runtime rather than a `.task(id:)`.
   *
   * Single-argument by design: the web hooks are variadic, but a variadic
   * native port needs a boxed args tuple whose type the emit cannot know.
   * More than one parameter declines by name rather than silently dropping
   * the rest.
   */
  | {
      kind: 'rate-limited'
      name: string
      mode: 'debounce' | 'throttle'
      delayMs: number
      /** The wrapped callback, emitted as the runtime's action closure. */
      fn: Extract<DeclIR, { kind: 'function' }>
    }
  /**
   * `useInterval(cb, ms)` / `useTimeout(cb, ms)` at STATEMENT position.
   *
   * Both are pure timing over a callback — no platform capability, just a
   * clock both targets have. They lower to the idiom that already carries
   * each target's auto-cancellation (`.task` on SwiftUI, `LaunchedEffect` on
   * Compose), which is what reproduces the web hooks' `onUnmount` cleanup
   * without a runtime or a stored handle.
   */
  | { kind: 'tick'; mode: 'interval' | 'timeout'; delayMs: number; body: StatementIR[] }
  /**
   * `useDebouncedValue(() => expr, ms)` — a trailing-edge mirror of a source,
   * seeded immediately.
   *
   * Measured on the web before this emit was written: the value is available
   * at once (no first-delay gap), updates land only once the source goes
   * quiet, a burst collapses to the LAST value, and the timer RESTARTS on
   * each change rather than firing on a fixed cadence.
   *
   * That last property is what makes the lowering exact rather than
   * approximate: `.task(id:)` and `LaunchedEffect(key)` both cancel and
   * restart when their key changes, which IS a restarting trailing-edge
   * debounce. No runtime and no stored timer handle.
   */
  | { kind: 'debounced-value'; name: string; source: ExprIR; type: TypeIR; delayMs: number }
  /**
   * USER-DEFINED native module via
   * `const bt = useNativeModule<T>('Bluetooth')` from
   * `@pyreon/primitives` — the FFI escape hatch. Emits an instance of a
   * class the APP provides, not a framework runtime container:
   *   Swift  → @State private var bt = Bluetooth()
   *   Kotlin → val btCtx = LocalContext.current
   *            val bt = remember { Bluetooth(btCtx) }
   *
   * `moduleName` is the string literal at the call site — it is BOTH the
   * web registry key (`defineNativeModule`) and the Swift/Kotlin class
   * name, so a single identifier ties the three targets together. It is
   * validated at parse time to be a plain identifier, since it is emitted
   * verbatim as a type name.
   *
   * Member calls and property reads flow through UNCHANGED (the same
   * pass-through every built-in imperative service uses), so the app's
   * platform class defines the method surface and the platform compiler
   * type-checks it. `await bt.connect(id)` composes with the async
   * lowering, so async native modules work with no extra machinery.
   *
   * This is the ONE declaration kind whose emitted type the framework
   * does not own — nothing can be stubbed or validated compiler-side; a
   * missing or mismatched class is a normal `swiftc`/`kotlinc` error in
   * the app's own build.
   */
  | { kind: 'native-module'; name: string; moduleName: string }
  /**
   * A PLAIN service container (`useShare`, `useLinking`, `useHaptics`,
   * `useNotifications`, `useBiometrics`, `useImagePicker`, `useFilePicker`,
   * `useCamera`) — see `services.ts`. `hook` names the entry in `SERVICES`
   * that supplies the Swift initialiser and the Kotlin declaration lines, so
   * adding another plain container is one descriptor and no new variant.
   * The hook takes no arguments and has NO reactive state; every call is a
   * member method that flows through unchanged (no `.value` rewrite, no
   * argument transformation).
   */
  | { kind: 'service'; name: string; hook: string }
  /**
   * A declaration a PLUGIN recognized and emits (`CompilerPlugin.calls` /
   * `.decls`). The core never switches on `type`: it dispatches by
   * `(plugin, type)` to the owner's `DeclEmitter`. See {@link ExtDecl}.
   */
  | ExtDecl
  /**
   * Phase 4 — color-scheme read via `const scheme = useColorScheme()`
   * from `@pyreon/hooks`. Maps to platform-native "is dark mode
   * active" reads — NO runtime port needed (both SwiftUI and Compose
   * ship the primitive):
   *
   *   Swift  → @Environment(\.colorScheme) private var pyreonColorScheme
   *            + private var ${name}: String { pyreonColorScheme == .dark ? "dark" : "light" }
   *   Kotlin → val ${name} = if (isSystemInDarkTheme()) "dark" else "light"
   *
   * Returns the same `"light" | "dark"` string shape the web hook
   * uses, so cross-platform code reading `scheme === 'dark'` works
   * identically. `useColorScheme()` takes no arguments. The Swift
   * shape uses a computed property because @Environment isn't
   * readable at stored-let init time (same constraint the router
   * hooks document).
   */
  | { kind: 'color-scheme'; name: string }
  /**
   * M2.2 — horizontal size-class read via `const sizeClass = useSizeClass()`
   * from `@pyreon/hooks`. Maps to platform-native "is this an expanded
   * (tablet / landscape / split) width" reads — NO runtime port needed
   * (same shape as color-scheme):
   *
   *   Swift  → @Environment(\.horizontalSizeClass) private var pyreonSizeClass
   *            + private var ${name}: String { pyreonSizeClass == .regular ? "regular" : "compact" }
   *   Kotlin → val ${name} = if (LocalConfiguration.current.screenWidthDp >= 600) "regular" else "compact"
   *
   * Returns the same `"compact" | "regular"` string shape the web hook
   * uses, so cross-platform code reading `sizeClass === 'regular'` works
   * identically. `useSizeClass()` takes no arguments. The Swift shape
   * uses a computed property because @Environment isn't readable at
   * stored-let init time (same constraint color-scheme documents).
   */
  | { kind: 'size-class'; name: string }
  /**
   * Phase 5 (native data/services hook emit). Reactive-container hooks that
   * instantiate the @pyreon/native-runtime-{swift,kotlin} service containers
   * shipped this arc. Each mirrors the `network-status` / `permissions`
   * emit shape (Swift `@State` / Kotlin `remember`); reactive FIELD reads on
   * the binding append `.value` on Kotlin (Compose `MutableState`) and read
   * bare on Swift (`@Observable`), while method calls + plain-Bool getters
   * read bare on both. Per-hook field/method maps live in emit-{swift,kotlin}.
   *
   *   useGeolocation()  → PyreonGeolocation   (lat/lon/accuracy/isAuthorized/error
   *                        + start/stop; maps + uber archetypes)
   *   useWebSocket(url)  → PyreonWebSocket     (lastMessage/messages/isConnected/error
   *                        + send/close; realtime archetype)
   *   useSecureStorage() → PyreonSecureStorage (write/read/remove/contains; finance/auth)
   *   useDatabase()      → PyreonDatabase      (insert/get/all/find/delete/count; offline-first)
   *   usePush()          → PyreonPushNotifications (token/lastNotification/isAuthorized/error)
   *   usePayments()      → PyreonPayments      (products/ownedProductIds/purchasing/error
   *                        + purchase/restore; IAP)
   *   useMap()           → PyreonMapState      (camera/markers/selectedMarker
   *                        + moveTo/addMarker/selectMarker; maps view-state)
   *
   * `useAuth<User>()` is generic (carries `userType`); the rest are non-generic.
   * `useWebSocket(url)` captures the string URL literal arg.
   */
  // NOTE: `useSecureStorage` is intentionally NOT an emitted decl kind — its
  // parse path warns + drops (the Kotlin secret store needs an app-injected
  // backend; auto-instantiation isn't clean cross-target). Documented
  // follow-up; see parse.ts.
  /**
   * Phase 5b — a plain VALUE const in a component body: `const a = 5 + 3`,
   * `const label = 'Total: '`, `const doubled = base * 2`. Previously dropped
   * (only call-expression decls — signal/computed/hook/fn — were captured),
   * which silently vanished any local const → undefined references on native.
   * Emitted as a body-local `let` (Swift, inside the `body` ViewBuilder where
   * Swift infers the type + it may reference `@State`) / `val` (Kotlin
   * composable body). Captures-once like JS `const` — a `const x = sig()`
   * snapshots the signal (non-reactive), matching web semantics. Non-call,
   * non-arrow inits only (arrows → `function`, calls → signal/computed/hook).
   */
  | { kind: 'value'; name: string; expr: ExprIR; /** The declaration's annotation, when written — it steers an object/array literal to its named struct. */ type?: TypeIR }
  | { kind: 'fieldArray'; name: string; initial: string[] }
  /**
   * Phase B6 (native readiness audit 2026-06, partial CRIT-4 closure).
   * `const data = useLoaderData<User>()` binding — reads the active
   * router's loaderData entry for the current path, type-cast to T.
   *
   * Phase B6 ships READ-ONLY emit — the runtime container's
   * `loaderData[currentPath]` IS read, but no auto-loader-runner
   * fires the loader. Apps populate via `router.setLoaderData(...)`
   * from native host code (Swift / Kotlin). True loader auto-emit
   * (the compiler walking a route's `loader:` field and emitting a
   * `task { … }` / `LaunchedEffect { … }` that calls setLoaderData
   * automatically) remains future work — that needs route-loader
   * coordination this PR doesn't attempt.
   *
   * Per-target emit:
   *   Swift:  `let data: User? = useLoaderData(router: pyreonRouter)`
   *   Kotlin: `val data = useLoaderData<User>()`
   * (Kotlin's reified-generic helper reads LocalPyreonRouter.current
   * internally; Swift's needs the @Environment(\.pyreonRouter)
   * passed in explicitly because @Environment can't be read at
   * stored-let-init time. Same constraint useParams documents.)
   *
   * The A3 diagnostic warning (PR #1235) softens to a HINT — emit
   * now exists, but the auto-loader gap remains intentional.
   */
  | { kind: 'useLoaderData'; name: string; type: TypeIR }

/**
 * Phase C5 — one route entry parsed from `createRouter({ routes: [...] })`.
 * Mirrors the web-side `RouteRecord<TPath>` shape from `@pyreon/router`,
 * intentionally narrowed to PATH + COMPONENT for v1.
 *
 * `path` is captured as the string-literal pattern (`/`, `/users/:id`).
 * The native emit walks it character-by-character — literal segments
 * become exact `==` comparisons (Swift) / fixed strings (Compose); `:name`
 * segments become param-capture slots.
 *
 * `component` is an `ExprIR` so it can carry any reachable component
 * expression — bare identifier (`HomePage`), property access
 * (`pages.Home`), or even a call. Phase 0 supports identifier and
 * member shapes; other shapes fall back to literal emit (the verbatim
 * source string). It is OPTIONAL because a redirect-only route
 * (`{ path: '/', redirect: '/home' }`) carries no component of its own.
 *
 * `redirect` (Phase 3) is a static per-route redirect target — a literal
 * path string. The native emit treats it as a COMPILE-TIME ALIAS: the
 * dispatch branch for `path` renders the redirect target's component
 * directly (no router-runtime push, fully verifiable via swiftc/kotlinc).
 * Only literal `redirect: '<path>'` is captured here; function redirects
 * and runtime `throw redirect()` are a later arc. Chains
 * (`/a → /b → /c`) resolve transitively with a cycle guard; redirect
 * source AND target must both be literal (non-`:param`) paths in v1.
 *
 * Deferred to future arcs: loader, guards, meta, middleware, children
 * (nested layouts), name. The rest extends when a real app needs it.
 */
export interface RouteIR {
  /** Literal path pattern, e.g. `/` or `/users/:id`. */
  path: string
  /**
   * Component to render for this route. Optional — a redirect-only route
   * has no component (its `redirect` target supplies one).
   */
  component?: ExprIR
  /**
   * Phase 3 — static per-route redirect target (a literal path string,
   * e.g. `{ path: '/', redirect: '/home' }`). Compile-time alias to the
   * target route's component; see the interface doc for resolution rules.
   */
  redirect?: string
  /**
   * Phase 3 — per-route boolean guard from `beforeEnter: () => <boolExpr>`.
   * The native emit wraps the matched component in an inline conditional:
   * `if (<guard>) { Component() } else { <fallback> }` — the dispatch runs
   * at navigation time, so the guard is checked before the route renders
   * (faithful to `beforeEnter`'s "before the route activates" semantic).
   * On failure the branch renders the router's catch-all fallback (the
   * wildcard component if one exists, else the no-route placeholder).
   *
   * v1 captures only an arrow with an EXPRESSION body (`() => isAuthed()`);
   * block-body guards and `throw redirect()` / async guards are a later arc
   * (they leave `guard` undefined → the route emits unguarded).
   */
  guard?: ExprIR
  /**
   * Phase 3 (nested routes) — child routes of a layout route. When present,
   * this route is a LAYOUT: its `component` renders a `<RouterView />` slot
   * that the matched child fills. The native emit flattens the tree into
   * full-path leaf branches and wraps each leaf in its ancestor layout chain
   * via a content-closure (`Layout { Child() }` on Swift / `Layout { Child() }`
   * on Compose) — see `flattenRouteTree`. Child `path`s are relative segments
   * joined onto the parent (`/app` + `dashboard` → `/app/dashboard`); a child
   * whose path already starts with `/` is treated as already-absolute
   * (mirrors `@pyreon/router`'s fs-router nested-absolute-path handling).
   *
   * v1 supports literal (non-`:param`) 2-level nesting; deeper trees flatten
   * recursively but param-bearing nested paths conservatively bail (no value
   * source at the alias site), same discipline as redirects.
   */
  children?: RouteIR[]
  /**
   * Phase 3 — per-route data loader from `loader: () => <expr>` (or
   * `async () => <expr>`). The native emit wraps the matched component in a
   * runtime `PyreonRouteLoader(path:, load:)` host whose `.task` (Swift) /
   * `LaunchedEffect` (Compose) fires the loader ONCE on the route's appear
   * and stores the result via `router.setLoaderData(path, …)`, where the
   * already-shipped `useLoaderData<T>()` reads it. The store is guarded
   * (`loaderData[path] == nil`) so re-renders don't re-run the loader.
   *
   * v1 captures only a ZERO-PARAM arrow with an EXPRESSION body
   * (`() => fetchAll()` / `async () => 42`). A param-using loader
   * (`(ctx) => fetch(ctx.params.id)` — `ctx` has no value source in the
   * load closure yet) and block-body loaders leave `loader` undefined and
   * warn → the route emits with NO loader (the component still renders;
   * `useLoaderData()` returns nil). `ctx.params` threading + truly-async
   * `await` bodies are a later arc.
   */
  loader?: ExprIR
  /**
   * True when the route's `loader: (ctx) => …` body reads `ctx.params.*`
   * (lowered to `params["…"]`). The emitter must then bind `params` from
   * `matchPath(path, "/x/:id")` in the dispatch branch even when the
   * component prop itself doesn't use params.
   */
  loaderUsesParams?: boolean
}

/**
 * Statement IR — sequence of operations inside a function body. The
 * existing parser walks Pyreon JSX components via top-level
 * VariableDeclaration / ReturnStatement; this adds the imperative
 * shape needed for TodoMVC's mutation functions (`addTodo`, `toggle`,
 * `remove`, `clearCompleted`).
 *
 * Kinds intentionally minimal for the immediate TodoMVC slice:
 * `let` (local const binding), `if` (with optional else), `return`,
 * and `expr` (call-expression as statement). Future expansions
 * (`for`, `while`, `try`) deliberately deferred.
 */
export type StatementIR =
  /**
   * `const text = draft().trim()` — local binding inside a fn body.
   * `mutable` is set by `parseStatementBlock` when a later `assign`
   * statement in the SAME block reassigns this name — the emit then uses
   * `var` (Swift + Kotlin) instead of `let`/`val` so the reassignment
   * typechecks.
   */
  | {
      kind: 'let'
      name: string
      expr: ExprIR
      mutable?: boolean
      /**
       * The TS annotation when the source carries one. Needed because an EMPTY
       * collection literal carries no element type of its own: `const out:
       * Tick[] = []` emits `let out = []`, which Swift rejects ("empty
       * collection literal requires an explicit type") and Kotlin degrades to
       * `listOf()`. The annotation is the only place that element type exists.
       */
      declaredType?: TypeIR
          /** an ARRAY-literal local later mutated via push/pop/shift/unshift/splice — Kotlin must emit mutableListOf */
      methodMutated?: boolean | undefined
    }
  /**
   * `let out: string` — a DECLARATION with no initializer, assigned later
   * (typically once per branch of an `if`/`switch`). Ordinary TypeScript, and
   * previously DROPPED: the parser returned null for a declarator with no
   * `init`, so every later assignment referenced a name that was never
   * declared ("cannot find 'out' in scope" / "unresolved reference"), with no
   * warning. Distinct from `let` because there is no expression to emit, and
   * the ANNOTATION is not optional here — it is the only thing that says what
   * the variable's type is, so a declaration without one is warned and dropped
   * rather than guessed at.
   */
  | { kind: 'declare'; name: string; declaredType: TypeIR }
  /**
   * Reassignment of a plain local / member / index target:
   * `t = t + x`, `acc += 1`. Signals reassign via `.set()` (a call, the
   * `expr` kind), so a raw `AssignmentExpression` is ALWAYS a plain
   * (non-signal) reassignment. `op` is `=` or a compound (`+= -= *= /= %=`);
   * both Swift and Kotlin take these verbatim.
   */
  | { kind: 'assign'; target: ExprIR; op: string; value: ExprIR }
  /** `if (cond) { then } [else { else }]`. */
  | { kind: 'if'; cond: ExprIR; then: StatementIR[]; elseBody?: StatementIR[] }
  /** `return [expr]` — bare early-return uses `expr: undefined`. */
  | { kind: 'return'; expr?: ExprIR }
  /** Bare expression statement: `todos.set([...])`, `draft.set('')`. */
  | { kind: 'expr'; expr: ExprIR }
  /**
   * `while (cond) { … }` — Swift `while cond { … }` / Kotlin
   * `while (cond) { … }`. Multi-statement handler control-flow.
   */
  | { kind: 'while'; cond: ExprIR; body: StatementIR[]; label?: string }
  /**
   * `for (const item of iterable) { … }` — Swift `for item in iterable`
   * / Kotlin `for (item in iterable)`. Only the `const`/`let`
   * single-identifier binding form lowers; destructured / C-style `for`
   * fall through to warn-drop.
   */
  | { kind: 'for-of'; item: string; iterable: ExprIR; body: StatementIR[]; label?: string }
  /**
   * `break` / `continue` — plain or LABELED (`break outer`). Both targets
   * support loop labels natively: Swift `outer: for … { break outer }`,
   * Kotlin `outer@ for … { break@outer }`. Pre-fix these statements were
   * warn-DROPPED, which is a SEMANTIC mis-emit (the loop runs every
   * iteration where JS would exit/skip).
   */
  | { kind: 'break'; label?: string }
  | { kind: 'continue'; label?: string }
  /**
   * The canonical C-style count-loop `for (let i = 0; i < n; i++)` /
   * `i += k`, lowered to a native RANGE loop — Swift `for i in 0..<n`
   * (steps via `stride(from:to:by:)`), Kotlin `for (i in 0 until n)`
   * (steps via `step k`). Ranges keep `break`/`continue` semantics
   * intact (no while-desugar update-skip hazard). Non-canonical shapes
   * warn — they don't reach this IR.
   */
  | {
      kind: 'for-range'
      item: string
      from: ExprIR
      to: ExprIR
      inclusive?: boolean
      /** A DESCENDING loop (`for (let i = n; i >= 0; i--)` / `i -= k`) — Swift `stride(by: -k)`, Kotlin `downTo`. */
      down?: boolean
      step?: ExprIR
      body: StatementIR[]
    }
  /**
   * `do { … } while (cond)` — Swift `repeat { … } while cond`, Kotlin
   * `do { … } while (cond)`. Pre-fix this warn-dropped the WHOLE loop,
   * leaving semantically wrong residue (the post-loop reads saw the
   * initial values).
   */
  | { kind: 'do-while'; cond: ExprIR; body: StatementIR[] }
  /**
   * `switch (x) { case 'a': …; default: … }` — Swift `switch x { case
   * "a": … }` / Kotlin `when (x) { "a" -> { … } }`. Each entry groups
   * consecutive `case` labels (`tests`) that share one body; `tests: []`
   * is the `default` / `else` branch. JS fall-through is NOT modeled
   * beyond empty-case label grouping (Swift/Kotlin don't fall through) —
   * a trailing `break` per case is stripped at parse.
   */
  | {
      kind: 'switch'
      discriminant: ExprIR
      cases: { tests: ExprIR[]; body: StatementIR[] }[]
    }

/** Type annotation, parsed from `signal<T>(...)` generics. */
export type TypeIR =
  // `float: true` marks a fractional number (inferred from a non-integer
  // literal like `12.5`) → emits as Swift/Kotlin `Double`. Absent/false
  // → `Int` (PMTC's ergonomic default for counts/ids/indices). Additive:
  // every existing `kind: 'number'` check still matches.
  | { kind: 'number'; float?: boolean }
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'array'; element: TypeIR }
  /** `Map<K, V>` → Swift `[K: V]` / Kotlin `MutableMap<K, V>`. */
  | { kind: 'map'; key: TypeIR; value: TypeIR }
  /** `Set<T>` → Swift `Set<T>` / Kotlin `MutableSet<T>`. */
  | { kind: 'set'; element: TypeIR }
  | { kind: 'object'; fields: { name: string; type: TypeIR }[] }
  | { kind: 'null' }
  | { kind: 'undefined' }
  /**
   * Union types — `string | number`, `Foo | null` (nullable), etc.
   * The branches are flat (no nested unions); the type mapper handles
   * the common nullable shapes (`T | null`, `T | undefined`) by
   * emitting Swift/Kotlin Optional / nullable types; mixed-type unions
   * (`string | number`) fall back to `Any` per target since neither
   * Swift nor Kotlin has a structural union primitive.
   */
  | { kind: 'union'; branches: TypeIR[] }
  /**
   * Named type reference — `Foo`, `MyInterface`. The Phase 0 parser
   * doesn't follow imports, so it can't resolve the referenced type.
   * The reference is preserved by name and emitted verbatim per target
   * (Swift / Kotlin both accept named type references resolved at
   * their respective compile time). Generic args (e.g. `Array<T>`)
   * propagate.
   */
  | { kind: 'typeRef'; name: string; args: TypeIR[] }
  /**
   * Function type — `(a: number, b: string) => boolean`. Captures
   * each parameter's name (when present in source) + type, and the
   * return type. Names are kept in IR for debugging + future use;
   * Swift / Kotlin function types are positional so the emitter
   * drops the names at emit time.
   */
  | { kind: 'function'; params: { name?: string; type: TypeIR }[]; returnType: TypeIR }
  | { kind: 'unknown' }

export type ExprIR =
  // `float: true` forces a numeric literal to emit as a Double even when
  // its value is integer-valued (`0` → `0.0`). Set by the reduce-seed
  // refinement post-pass when a reduce accumulates a Double column, so
  // the seed type matches (`reduce(0.0, …)` not `reduce(0, …)`). Additive
  // — absent/false renders the literal verbatim (the existing behaviour).
  | { kind: 'literal'; value: string | number | boolean | null; float?: boolean }
  | { kind: 'identifier'; name: string }
  /**
   * `f(args)` — a plain call, OR `f?.(args)` when `optional: true` (the
   * optional-call form: JS short-circuits to undefined if the callee is
   * nullish). Lowers to Swift `f?(args)` / Kotlin `f?.invoke(args)`.
   */
  | { kind: 'call'; callee: ExprIR; args: ExprIR[]; optional?: boolean }
  /**
   * The open expression: a plugin's own expression (`<receiver>.<method>(…)` its `methodCalls` recognizer, or a
   * call its `callExprs` recognizer, claimed), rendered and typed by the same plugin's `exprs[type]`. The compiler stamps `plugin`; `payload`
   * is JSON and `args` are the sub-expressions the plugin asked the parser for.
   */
  | { kind: 'ext-expr'; plugin: string; type: string; payload: ExtPayload; args: ExprIR[] }
  /**
   * `JSON.stringify(x)` → a native serialization of an Encodable/@Serializable
   * value. Swift `String(data: try! JSONEncoder().encode(x), …)`, Kotlin
   * `Json.encodeToString(x)`. Only the SAFE half lowers: `JSON.parse` throws,
   * which needs a native error model (a tracked follow-up), so it still warns.
   */
  | { kind: 'json-stringify'; arg: ExprIR }
  /**
   * `await expr` — an awaited async-result call inside an `async` handler
   * (M4.5). The emitter unwraps to `await <expr>` (Swift) / `<expr>` (Kotlin
   * suspend calls carry no `await` keyword). Only meaningful inside an arrow
   * marked `async: true`, which the action emitters wrap in a `Task { … }`
   * (Swift) / `scope.launch { … }` (Kotlin) async scope.
   */
  | { kind: 'await'; expr: ExprIR }
  | {
      kind: 'member'
      object: ExprIR
      property: string
      // Optional member access (`a?.b`). Swift/Kotlin both spell it `?.`.
      // The emit PROPAGATES `?.` to every access after the first optional
      // one in the chain (`a?.b.c` → `a?.b?.c`) — required for Kotlin
      // (a plain `.c` on a nullable is a type error) and valid for Swift.
      optional?: boolean
    }
  /**
   * Computed member access — `xs[i]`, `tasks[tasks.length - 1]`.
   * Swift arrays and Kotlin lists share the `xs[i]` subscript syntax,
   * so the emit is verbatim per target. Pre-PR-D, `computed: true`
   * MemberExpressions fell into the `member` case with
   * `property: undefined` — the emit produced `tasks.undefined`
   * (the broken shape the original tasks scaffold shipped).
   */
  /**
   * `xs[i]` — plain computed access (native index; OOB traps, the documented
   * simplification). `optional: true` = the `xs?.[i]` SAFE form: JS returns
   * undefined out-of-bounds, so it lowers to the guarded native idiom
   * (Swift `indices.contains ? xs[i] : nil` / Kotlin `getOrNull(i)`) and
   * infers `element | undefined` so `?? fallback` collapses.
   */
  | { kind: 'index'; object: ExprIR; index: ExprIR; optional?: boolean }
  /**
   * `new Map<K, V>()` / `new Set<T>()` / `new Set(seedArray)` — the two
   * supported collection constructors (the accumulator / dedup idioms).
   * `seed` is the optional Set-from-array argument. Other `new X()`
   * expressions stay the named unsupported warning.
   */
  | {
      kind: 'new-collection'
      collection: 'map' | 'set'
      keyType?: TypeIR
      valueType?: TypeIR
      elementType?: TypeIR
      seed?: ExprIR
      /**
       * Seeded `new Map([[k, v], …])` — scalar key/value pair entries. When
       * present the emit produces a native dict literal (`[k: v]` / `mutableMapOf(k to v)`)
       * instead of the empty constructor. `keyType`/`valueType` are inferred
       * from the first entry.
       */
      entries?: [ExprIR, ExprIR][]
    }
  | {
      kind: 'binary'
      // Arithmetic + bitwise + exponent. Bitwise ops (`& | ^ << >>`) emit
      // verbatim on Swift / as infix functions on Kotlin. Exponent (`**`) has
      // no operator on either target → `pow(...)` (Double-domain) on both.
      op: '+' | '-' | '*' | '/' | '%' | '&' | '|' | '^' | '<<' | '>>' | '**'
      left: ExprIR
      right: ExprIR
    }
  /**
   * Template literal — `` `Hello ${name}!` ``. String interpolation is the
   * single most common out-of-subset expression (labels, formatted values).
   * Lowered to NATIVE string interpolation (Swift `"Hello \(name)!"`, Kotlin
   * `"Hello ${name}!"`) — NOT `+`-concat, because Swift's `+` does not coerce
   * a non-String interpoland (`"n=" + count` is a Swift type error), while
   * interpolation coerces any type on both targets. `quasis` are the COOKED
   * literal segments (escaped per-target at emit); `exprs` interleave between
   * them (`quasis.length === exprs.length + 1`). Tagged templates stay
   * warn-dropped (no native equivalent).
   */
  | { kind: 'template'; quasis: string[]; exprs: ExprIR[] }
  /**
   * Comparison + equality operators emit as-is on both Swift and Kotlin
   * (`==` / `!=` / `<` / `>` / `<=` / `>=`). Added in the Parser-A slice
   * because TodoMVC's filter conditionals (`t.id === id`, `filter() === 'active'`)
   * require them. Pyreon source uses `===` / `!==` which JS-evaluates
   * the same as `==` / `!=` for the value types Pyreon signals carry;
   * the emitter coalesces to the native target's `==` / `!=`.
   */
  | {
      kind: 'comparison'
      op: '==' | '!=' | '<' | '>' | '<=' | '>='
      left: ExprIR
      right: ExprIR
    }
  /**
   * Unary operators (Parser-B). TodoMVC uses `!t.done` in filter
   * callbacks. Both Swift and Kotlin support `!` / `-` / `+` as
   * prefix unary; the emitter passes them through verbatim.
   */
  | { kind: 'unary'; op: '!' | '-' | '+'; argument: ExprIR }
  /**
   * Logical operators (Parser-C). TodoMVC uses `e.key === 'Enter' && addTodo()`
   * in the keyboard handler. Swift and Kotlin both have `&&` / `||` with
   * the same short-circuit semantics. JS's `??` (nullish coalescing) maps
   * differently per target but isn't in the TodoMVC slice — deferred.
   */
  | { kind: 'logical'; op: '&&' | '||' | '??'; left: ExprIR; right: ExprIR }
  /**
   * Ternary conditional (`cond ? a : b`). Both Swift and Kotlin have
   * the ternary form verbatim (Kotlin uses `if (cond) a else b` as the
   * idiomatic equivalent — same expression-form semantics). TodoMVC's
   * `toggle` uses this in the map callback.
   */
  | { kind: 'ternary'; cond: ExprIR; then: ExprIR; otherwise: ExprIR }
  /**
   * Post-increment / -decrement (`x++`, `x--`). JavaScript evaluates
   * to the OLD value while side-effect-incrementing. In Pyreon source
   * the common use is `someCounter++` in an array literal (TodoMVC:
   * `{ id: nextId++, ... }`). The emit on both Swift and Kotlin
   * degrades to `x + 1` for the value (Swift @State / Kotlin var don't
   * support `++` natively in expression position) — the side-effect
   * increment is lost. Phase 2 refines if needed.
   */
  | { kind: 'update'; op: '++' | '--'; argument: ExprIR }
  /**
   * Arrow function. A single-expression body (`() => count.set(1)`) or a
   * block body with exactly one expression/return statement lands in
   * `body` (the compact form — most accessor / `.update` / handler sites).
   * A block body with MULTIPLE statements (`() => { a.set(1); b.set(2) }`)
   * — common for event handlers doing several things — additionally
   * carries the full statement list in `stmts`; `body` is a sentinel
   * empty literal in that case. `emitSwiftAction` / `emitKotlinAction`
   * emit `stmts` as a multi-statement closure body; without it the
   * earlier parse silently kept only the FIRST statement.
   */
  | {
      kind: 'arrow'
      params: string[]
      /** Per-param TS annotations, index-aligned with `params`; undefined where unannotated. */
      paramTypes?: (TypeIR | undefined)[] | undefined
      /** the arrow's declared RETURN annotation, when written */
      returnAnnot?: TypeIR | undefined
      body: ExprIR
      stmts?: StatementIR[]
      async?: boolean
    }
  | { kind: 'jsx-element'; tag: string; attrs: AttrIR[]; children: ChildIR[] }
  | { kind: 'jsx-fragment'; children: ChildIR[] }
  | { kind: 'array'; elements: ExprIR[]; elementType?: TypeIR }
  /**
   * Object literal with optional spread members. The classic shape is
   * `{ a: 1, b: 2 }` (zero spreads); G4 (TodoMVC walkthrough) adds the
   * partial-update form `{ ...t, done: !t.done }` — the spread carries
   * the existing fields, the explicit fields override.
   *
   * Spreads are emitted in source order; emit targets that support a
   * native copy-with-overrides shape (Kotlin data class `.copy()`,
   * Swift struct construction) consume the array. `spreads.length === 0`
   * is the canonical zero-spread case; the field is optional for
   * backward compat with pre-G4 IR consumers.
   */
  | {
      kind: 'object'
      /**
       * `afterSpreads` is how many SPREADS precede this field in source
       * order. The two arrays lost their relative order, which made
       * `{ a: 9, ...p }` and `{ ...p, a: 9 }` emit byte-identically while JS
       * answers `1` and `9` — see `spread-lowering.ts`. Absent means "order
       * unknown", which every non-parse constructor of this node implies and
       * which is read as "after all spreads" (the pre-existing behaviour).
       */
      fields: { name: string; value: ExprIR; afterSpreads?: number }[]
      spreads?: ExprIR[]
    }
  | { kind: 'paren'; inner: ExprIR }
  /**
   * Spread element in array literal (`[...todos(), newTodo]`) used by
   * TodoMVC's mutation functions. The emit on Swift becomes `todos +
   * [newTodo]` (immutable concat) — preserves the source's
   * value-semantics. Kotlin emit: `todos + listOf(newTodo)`.
   */
  | { kind: 'spread'; argument: ExprIR }

/** A JSX element expression — the unit an element lowering claims and rewrites. */
export type JsxElementIR = Extract<ExprIR, { kind: 'jsx-element' }>

export type AttrIR =
  /** Regular attribute: `each={items}`, `by={(i) => i.id}`, `when={visible}`. */
  | { kind: 'attr'; name: string; value: ExprIR }
  /** Event handler: `onClick={() => …}`. The 'on' prefix is stripped from `name`. */
  | { kind: 'event'; name: string; handler: ExprIR }
  /**
   * JSX spread attribute: `<Comp {...props} />` / `<Comp {...{a:1}} />`.
   * `argument` is the spread source. At emit, for a USER component the spread
   * expands to per-prop constructor args: an object-literal source expands its
   * own fields; an identifier/member source expands the TARGET component's
   * declared props, each sourced as `<argument>.<prop>`. Explicit sibling
   * attrs win (a spread prop they also set is skipped). Spreads onto
   * primitives have no native equivalent → warn-drop.
   */
  | { kind: 'spread'; argument: ExprIR }

export type ChildIR =
  /** Static text between JSX tags: `<Text>Hello</Text>`. */
  | { kind: 'text'; value: string }
  /** Interpolation: `<Text>{count}</Text>`. */
  | { kind: 'expr'; expr: ExprIR }

/**
 * String-literal union type alias emitted as a native enum. Source:
 *
 *   type Filter = 'all' | 'active' | 'completed'
 *
 * Swift emit:
 *
 *   enum Filter: String { case all, active, completed }
 *
 * Kotlin emit:
 *
 *   enum class Filter { all, active, completed }
 *
 * Pyreon's signal-based reactivity is structurally aligned with both
 * targets' enum primitives — using a native enum is strictly better
 * than emitting raw String (typesafe; pattern-match-able) AND lets the
 * compiler convert literal usages (`'all'` → `.all` on Swift) at the
 * use site. Closes gap G6 from `native-platforms-todomvc-walkthrough.md`.
 */
export interface EnumIR {
  /** Alias name from `type X = ...` declaration. */
  name: string
  /** Allowed values from the union branches (`'all'` → `'all'`). */
  cases: string[]
}

/**
 * Object-shape type alias emitted as a native struct / data class. Source:
 *
 *   type Todo = { id: number; text: string; done: boolean }
 *
 * Swift emit:
 *
 *   struct Todo { var id: Int; var text: String; var done: Bool }
 *
 * Kotlin emit:
 *
 *   data class Todo(var id: Int, var text: String, var done: Boolean)
 *
 * Closes the foundational Phase 2 gap surfaced by G5 #849's known
 * caveats: anonymous record types currently emit as labelled tuples,
 * blocking @AppStorage's Codable bridge (Swift) and rememberSaveable's
 * Parcelable/Saver requirements (Kotlin). Real structs let downstream
 * Phase 2 work add Codable conformance + Compose Savers.
 *
 * `var` fields (not `let` / `val`) so the G4 IIFE-copy pattern's tuple
 * mutation idiom — `{ var c = t; c.done = !t.done; return c }()` —
 * works structurally when `t` is upgraded from tuple to struct.
 * Kotlin's `data class .copy(done = ...)` doesn't need this but the
 * `var` default keeps the option open for direct field mutation.
 */
export interface StructIR {
  /** Alias name from `type X = ...` declaration. */
  name: string
  /** Object-type fields. */
  fields: { name: string; type: TypeIR }[]
  /**
   * Declared by an imported native runtime (the generated chart engine's
   * structs, `@pyreon/charts` native-plugin `engine-structs.ts`): used to TYPE object literals and
   * annotations, never DECLARED in the emit — the runtime already has it.
   */
  external?: boolean
}

/**
 * Module-level mutable binding emitted at file scope on the target.
 * Source:
 *
 *   let nextId = 1
 *   const APP_VERSION = '1.0.0'
 *
 * Swift emit:
 *
 *   private var nextId: Int = 1
 *   private let APP_VERSION: String = "1.0.0"
 *
 * Kotlin emit:
 *
 *   private var nextId: Int = 1
 *   private val APP_VERSION: String = "1.0.0"
 *
 * Phase 2 follow-up closing the "TodoMVC's `nextId` undefined in Swift
 * scope" gap surfaced by the post-Phase-2-trilogy typecheck. The TS
 * source's `let` declares a mutable binding; `const` declares immutable.
 * Pyreon convention preserves the mutability through to the target —
 * `let` → `var`/`var`, `const` → `let`/`val`.
 *
 * Type field: explicit annotation when source carries one, otherwise
 * `unknown` (target falls back to type-inference at compile time).
 */
export interface ModuleDeclIR {
  name: string
  /** `var` (TS `let`) or `let` (TS `const`). Preserves source mutability. */
  mutable: boolean
  /** Type annotation; `unknown` when source omits it. */
  type: TypeIR
  /** Initial-value expression. */
  initial: ExprIR
}

/**
 * Gap 4 Strategy-B port v1 — `defineStore("id", () => { ... return {...} })`
 * from `@pyreon/store`. Captured as a top-level singleton class
 * emitted at file scope (sibling of enums / structs).
 *
 * v1 scope: setup body contains ONLY `const X = signal(...)` decls;
 * returned object is a shorthand-keys-only literal naming local
 * signals. The PMTC parser walks the setup body, extracts the signal
 * fields, and emits a per-store class with @Observable properties
 * (Swift) / `var by mutableStateOf` (Kotlin) and a static `shared`
 * accessor. Use sites `<hookName>().store.<field>` are parsed as a
 * chain pattern and rewritten to `PyreonStore_<id>.shared.<field>`
 * in emit.
 *
 * Multi-step member-access chain rewriting at the parser level
 * (`tryDeclFromCallExpression` looking for `<id>().store.<X>` shape)
 * is the structural infrastructure this port adds — once present,
 * createModel + defineFeature composites build on it.
 */
export interface StoreDefnIR {
  /** Top-level binding name (e.g. `useCounter`). */
  hookName: string
  /** Store id from `defineStore("X", ...)`. Used to derive emitted class name. */
  storeId: string
  /**
   * Signal fields extracted from the setup body. v2: ALL signal decls
   * (not just returned ones) — a method may write a non-returned
   * signal, so every decl must exist on the singleton. Non-returned
   * fields are reachable through the emitted class but not part of
   * the documented `.store` surface (a small, deliberate divergence
   * from the web's closure semantics).
   */
  fields: { name: string; type: TypeIR; initial: ExprIR }[]
  /**
   * v2 — `const X = computed(() => expr)` decls in the setup body.
   * Swift: computed property on the singleton (`var X: T { expr }`);
   * Kotlin: `val X get() = expr` (re-evaluates on access; reads of
   * mutableStateOf fields keep it Compose-reactive).
   */
  computeds?: { name: string; expr: ExprIR }[]
  /**
   * v2 — `const X = (args) => …` arrow decls in the setup body.
   * Emitted as methods on the singleton; use-site chain calls
   * (`useX().store.M(args)`) rewrite to `PyreonStore_id.shared.M(args)`
   * / `PyreonStore_id.M(args)`.
   */
  methods?: Extract<DeclIR, { kind: 'function' }>[]
}

/**
 * Gap 4 follow-up v2 — @pyreon/state-tree model defined via the
 * `const X = model({ state: { ... literal ... } }) [.views(f)] [.actions(f)]
 * .create()` chain. PMTC emits a per-model PyreonModel_<id> singleton at
 * module scope; use sites rewrite onto it.
 *
 * v3 scope: literal state values, plus `.views()` / `.actions()` chain
 * blocks (the canonical web shape — a model with no actions cannot mutate,
 * so v2's state-only support could not express a useful model).
 * `.asHook()`, `.create(initialOverride)`, getSnapshot / onPatch and
 * nested field-models remain deferred follow-ups.
 */
export interface ModelDefnIR {
  /** User-side instance binding name (e.g. `counter`). */
  instanceName: string
  /** Suffix used to derive the emitted class name (PyreonModel_<id>). */
  modelId: string
  /**
   * State fields extracted from the literal `state: { ... }` config.
   * Typed as `TypeIR`/`ExprIR` (not raw literals) so the store's proven
   * inference + emit machinery applies unchanged — which is also what
   * makes a fractional seed (`{ total: 0.5 }`) emit `Double` instead of
   * an `Int` that cannot hold it.
   */
  fields: { name: string; type: TypeIR; initial: ExprIR }[]
  /**
   * `.views((self) => ({ name: () => expr }))` — derived values. Emitted
   * as computed properties on the singleton (Swift `var X: T { expr }`,
   * Kotlin `val X get() = expr`), mirroring `StoreDefnIR.computeds`.
   */
  views?: { name: string; expr: ExprIR; selfParam: string }[]
  /**
   * `.actions((self) => ({ name: (args) => … }))` — mutators. Emitted as
   * methods on the singleton, mirroring `StoreDefnIR.methods`.
   */
  methods?: (Extract<DeclIR, { kind: 'function' }> & { selfParam: string })[]
}

export interface ParseResult {
  /** Decoded static import specifiers, collected from the parser's AST. */
  imports: string[]
  components: ComponentIR[]
  /** String-literal-union type aliases lifted to native enums. */
  enums: EnumIR[]
  /** Object-shape type aliases lifted to native structs / data classes. */
  structs: StructIR[]
  /** Module-level mutable / immutable bindings emitted at file scope. */
  moduleDecls: ModuleDeclIR[]
  /** Gap 4 v1: top-level defineStore declarations. */
  stores: StoreDefnIR[]
  /**
   * Gap 4 follow-up: state-tree model declarations from
   * `const X = model({...}).create()`. Each one emits a
   * per-model class at module scope + a `@State` binding inside
   * the consuming component body.
   */
  models: ModelDefnIR[]
  /**
   * File-scope items plugins own (see {@link ExtModuleItem}): declarations a plugin's `topLevel` recognizer
   * claimed, then the ones its expression recognizers synthesized. Emitted in plugin-declared slots beside the
   * core's own module items.
   */
  moduleItems: ExtModuleItem[]
  /**
   * Top-level pure-logic HELPER functions — a function that takes value
   * parameters and returns a non-JSX value (`function dbl(x: number) { return
   * x * 2 }`, L1 "shared pure logic" in `.agents/guides/multiplatform/README.md`). Emitted at file scope as a
   * Swift `func` / Kotlin `fun` (a sibling of enums / structs / stores, BEFORE
   * the component View structs so components + store methods can call them).
   * A GENERIC helper (`function first<T>(…)`) is NOT collected here — the IR
   * has no generic-parameter representation, so it stays a NAMED warning (see
   * `tryComponentFromTopLevel`). Distinct from `StoreDefnIR.methods` (same
   * `DeclIR{kind:'function'}` shape, but those emit as CLASS methods on the
   * store singleton, these emit free at file scope).
   */
  helperFns: Extract<DeclIR, { kind: 'function' }>[]
  /**
   * `const X = styled(Prim)\`css\`` declarations wrapping a CANONICAL primitive.
   * At emit each `<X>` use-site is rewritten to `<Prim>` with the captured CSS
   * injected as a synthetic `style` attr, so the whole inline-style connector
   * lowers it unchanged. `styled('div')` / `styled(NonPrimitive)` are NOT
   * collected here (warned — no native primitive).
   */
  styledComponents: StyledComponentIR[]
  /**
   * `rocketstyle()({component: Prim})…` components resolved per use-site (the
   * `rocketstyle-native` frontend). Sibling of `styledComponents`.
   */
  rocketstyleComponents: RocketstyleComponentIR[]
  /**
   * `attrs({component: Prim}).attrs({…})…` default-prop HOC components (the
   * `attrs-native` frontend). Sibling of `styledComponents` — the emit rewrites
   * each `<X>` use-site to `<Prim …defaults …use-site>`.
   */
  attrsComponents: AttrsComponentIR[]
  /**
   * Local-name → source package + original imported name for package-specific
   * JSX hooks. The emit intercepts a tag ONLY when both match — so a user
   * component that happens to share a name (`Row` from `./my-components`) is
   * NOT mis-lowered as a coolgrid Row. An untracked name (absent from the map)
   * keeps prior behaviour, so this is a purely additive precision guard.
   */
  aliasImports: Map<string, { source: string; imported: string }>
  /** Diagnostic messages produced during IR construction. */
  warnings: string[]
}

/** An `attrs({component: Prim}).attrs({…})` default-prop HOC lowered at its
 *  use-sites. Produced by the `attrs-native` frontend module. */
export interface AttrsComponentIR {
  name: string
  tag: string
  defaultAttrs: { name: string; value: ExprIR }[]
}

/** A `styled(Prim)`-wrapped canonical primitive lowered at its use-sites. */
export interface StyledComponentIR {
  /** The `const X = …` binding name (the JSX tag used at call sites). */
  name: string
  /** The wrapped canonical primitive tag (`Stack`, `Text`, …). */
  tag: string
  /** The static CSS body as a style object (camelCase keys, literal values). */
  styleObject: Extract<ExprIR, { kind: 'object' }>
}

/**
 * A `rocketstyle()({component: Prim}).theme().states()…` component — resolved at
 * each `<Btn state="primary">` use-site by merging base ∪ matched dimensions.
 * Produced by the `rocketstyle-native` frontend module.
 */
export interface RocketstyleComponentIR {
  name: string
  /** The canonical primitive base tag. */
  tag: string
  /** `.theme()` base styles. */
  base: Extract<ExprIR, { kind: 'object' }>
  /** dimension name (`state`/`size`/`variant`) → value name → its style object. */
  dims: Record<string, Record<string, Extract<ExprIR, { kind: 'object' }>>>
}

export interface TransformResult {
  /** Emitted source code for the target language. */
  code: string
  /** Diagnostic messages from the IR construction. */
  warnings: string[]
}

/**
 * A modifier in a parsed hotkey combo. `mod` is preserved rather than resolved:
 * the platform decides (Command on iOS, Ctrl on Android), and only the emitter
 * knows which platform it is.
 */
export type HotkeyModifier = 'mod' | 'control' | 'shift' | 'alt' | 'meta'

export interface HotkeyComboIR {
  /** Normalised, lower-cased base key (`'s'`, `'escape'`, `'arrowup'`, `','`). */
  key: string
  /** Sorted, so two spellings of one combo emit identically. */
  modifiers: HotkeyModifier[]
}
