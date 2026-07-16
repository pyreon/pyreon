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
      params: { name: string; type: TypeIR }[]
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
       * (`beforeEach: [(p) => isAuthed()]`) are silently dropped from
       * the array (would need the arrow-emit + closure-capture machinery
       * that per-route boolean guards already use). Closure form is a
       * documented follow-up.
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
   * Phase 4 — data fetch via `useFetch<T>('/url')` from `@pyreon/query`
   * (the native subset). Emits a `PyreonFetch<T>` reactive container plus
   * a mount-time async harness that drives its `begin/resolve/reject`
   * state machine:
   *   Swift   →  @State private var x = PyreonFetch<T>()
   *              + `.task { begin(); resolve(await URLSession…decode) }`
   *                modifier on the View body
   *   Kotlin  →  val x = remember { PyreonFetch<T>() }
   *              + `LaunchedEffect(Unit) { begin(); resolve(…) }`
   *
   * `type` is the decoded result type `T` (from the generic arg);
   * `url` is the literal request path. Non-literal URLs fall through to
   * undeclared (the parser bails), same conservative rule as `useStorage`.
   */
  | { kind: 'fetch'; name: string; type: TypeIR; url: string }
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
    }
  /**
   * Phase 4 — connectivity flag via `useOnline()` from `@pyreon/hooks` (the
   * native subset). Emits the PyreonNetworkStatus reactive container:
   *   Swift  → @State private var net = PyreonNetworkStatus()
   *   Kotlin → val net = remember { PyreonNetworkStatus() }
   *
   * `useOnline()` takes no arguments. The reactive read is `net.isOnline` —
   * a plain @Observable property on Swift, a Compose `MutableState` (`.value`)
   * on Kotlin (same field-read rewrite as useForm's MutableState fields).
   */
  | { kind: 'network-status'; name: string }
  /**
   * Phase 5 (M3.7) — app lifecycle phase via `useAppState()` from `@pyreon/hooks`.
   * Emits the PyreonAppState reactive container:
   *   Swift  → @State private var state = PyreonAppState()
   *   Kotlin → val state = remember { PyreonAppState() }
   *
   * `useAppState()` takes no arguments. The reactive read is `state.phase`
   * (a `String`: "active"|"inactive"|"background") — a plain @Observable
   * property on Swift, a Compose `MutableState` (`.value`) on Kotlin. The web
   * accessor `state()` lowers to `state.phase` / `state.phase.value`.
   */
  | { kind: 'app-state'; name: string }
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
   * Phase 4 — permission set via `usePermissions(['posts.edit', 'posts.*'])`
   * from `@pyreon/permissions` (the native subset). Emits the PyreonPermissions
   * reactive container the runtime ports ship:
   *   Swift  → @State private var can = PyreonPermissions(["posts.edit", "posts.*"])
   *   Kotlin → val can = remember { PyreonPermissions(setOf("posts.edit", "posts.*")) }
   *
   * `grants` carries the literal initial grant keys captured from the array
   * argument (string literals only; a non-array / non-literal arg yields an
   * empty set — `usePermissions` never bails). Reads are METHOD CALLS
   * (`can.can("x")` / `cannot` / `all` / `any` / `grant` / `revoke` / `set`),
   * so unlike useFetch / useForm there is NO `.value` field-read rewrite —
   * the methods read the underlying reactive set internally and return a
   * plain Bool / Void on both targets.
   */
  | { kind: 'permissions'; name: string; grants: string[] }
  /**
   * Phase 4 — clipboard service via `const clipboard = useClipboard()`
   * from `@pyreon/hooks`. Emits the PyreonClipboard reactive wrapper
   * the runtime ports ship:
   *   Swift  → @State private var clipboard = PyreonClipboard()
   *   Kotlin → val clipboard = remember { PyreonClipboard() }
   *
   * `useClipboard()` takes no arguments. Reads are method calls
   * (`clipboard.copy("hi")` + `clipboard.copied` field read), so unlike
   * useFetch / useForm there is NO `.value` field-read rewrite — the
   * methods read the underlying reactive flag internally. The `copied`
   * field reads as a plain Bool / Boolean property on both targets
   * (auto-resets to false ~2s after each copy — matches the web
   * @pyreon/hooks contract).
   *
   * V1 supports the single-binding form `const cb = useClipboard()`
   * only. Destructure form `const { copy, copied } = useClipboard()`
   * is a documented follow-up — needs the per-key rewrite logic that
   * `params-destructure` uses.
   */
  | { kind: 'clipboard'; name: string }
  /**
   * M3.1 — haptic feedback via `const h = useHaptics()` from
   * `@pyreon/hooks`. Emits the PyreonHaptics fire-and-forget wrapper:
   *   Swift  → @State private var h = PyreonHaptics()
   *   Kotlin → val hHaptic = LocalHapticFeedback.current
   *            val h = remember { PyreonHaptics(hHaptic) }
   *
   * `useHaptics()` takes no arguments and has NO reactive state. Calls
   * are member methods (`h.impact("light")` / `h.notification("success")`
   * / `h.selection()`) whose string arg flows through unchanged — the
   * runtime container maps the style string to the platform generator
   * (iOS UIImpactFeedbackGenerator/UINotificationFeedbackGenerator/
   * UISelectionFeedbackGenerator; Android Compose LocalHapticFeedback,
   * which is coarser — several styles map to the nearest constant).
   */
  | { kind: 'haptics'; name: string }
  /**
   * M3.2 — share sheet via `const share = useShare()` from
   * `@pyreon/hooks`. Emits the PyreonShare wrapper:
   *   Swift  → @State private var share = PyreonShare()
   *   Kotlin → val shareCtx = LocalContext.current
   *            val share = remember { PyreonShare(shareCtx) }
   *
   * `useShare()` takes no arguments and has NO reactive state. Calls are
   * member methods with STRING args (`share.text("hi")` / `share.url(...)`
   * / `share.textUrl(t, u)` / `share.canShare()`) that flow through
   * unchanged — the runtime container presents the platform share sheet
   * (iOS UIActivityViewController from the key window; Android
   * Intent.createChooser(ACTION_SEND)). Android needs a Context (hoisted
   * from LocalContext, like clipboard); iOS grabs the key window itself.
   */
  | { kind: 'share'; name: string }
  /**
   * M3.2b — external-URL open via `const linking = useLinking()` from
   * `@pyreon/hooks`. Emits the PyreonLinking wrapper:
   *   Swift  → @State private var linking = PyreonLinking()
   *   Kotlin → val linkingCtx = LocalContext.current
   *            val linking = remember { PyreonLinking(linkingCtx) }
   *
   * `useLinking()` takes no arguments and has NO reactive state.
   * `linking.openUrl("...")` (string arg) flows through unchanged — the
   * runtime hands the URL to the OS (iOS `UIApplication.shared.open`;
   * Android `startActivity(Intent(ACTION_VIEW, Uri.parse(url)))`). Android
   * needs a Context (hoisted from LocalContext, like share); iOS uses the
   * shared application.
   */
  | { kind: 'linking'; name: string }
  /**
   * M3.3 — local notifications via `const notifs = useNotifications()` from
   * `@pyreon/hooks`. Emits the PyreonNotifications wrapper:
   *   Swift  → @State private var notifs = PyreonNotifications()
   *   Kotlin → val notifsCtx = LocalContext.current
   *            val notifs = remember { PyreonNotifications(notifsCtx) }
   *
   * `useNotifications()` takes no arguments and has NO reactive state.
   * Methods (`notifs.notify("t", "b")` / `notifs.requestPermission()`) flow
   * through unchanged — the runtime posts a local notification (iOS
   * UNUserNotificationCenter; Android NotificationManager + a channel).
   * Android needs a Context (hoisted from LocalContext, like share); iOS
   * uses the shared notification center. Distinct from usePush (which
   * RECEIVES remote push).
   */
  | { kind: 'notifications'; name: string }
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
  | { kind: 'value'; name: string; expr: ExprIR }
  | { kind: 'geolocation'; name: string }
  | { kind: 'websocket'; name: string; url: string }
  | { kind: 'database'; name: string }
  | { kind: 'push'; name: string }
  | { kind: 'payments'; name: string }
  | { kind: 'map'; name: string }
  | { kind: 'auth'; name: string; userType: TypeIR }
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
   * Gap 4 PR-3 (2026-06-05 native-readiness audit) — Strategy-B port
   * for `@pyreon/i18n/core`. `const i18n = createI18n({ locale,
   * messages, fallbackLocale? })` emits the PyreonI18n container the
   * runtime ports ship:
   *   Swift  → @State private var i18n = PyreonI18n(locale: "en",
   *               messages: ["en": ["hello": "Hi"]],
   *               fallbackLocale: nil)
   *   Kotlin → val i18n = remember { PyreonI18n(
   *               initialLocale = "en",
   *               messages = mapOf("en" to mapOf("hello" to "Hi")),
   *               fallbackLocale = null) }
   *
   * Method calls flow through unchanged (`i18n.t("key")`); the runtime
   * container defines `t(_:)` / `t(...)`.
   *
   * v1 SCOPE — single-arg `t(key)` only. Interpolation values
   * (`t('key', { name })`), locale writes (`setLocale` /
   * `locale.set`), pluralization, namespaces, and async loading are
   * documented follow-ups — each its own PR.
   *
   * `locale` is the literal default locale; `messages` is parsed from
   * the literal `{ <locale>: { <key>: <value> } }` config (string-
   * keyed, string-valued, dot-key expansion preserved by the parser);
   * `fallbackLocale` is optional string literal.
   */
  | {
      kind: 'i18n'
      name: string
      locale: string
      messages: Record<string, Record<string, string>>
      fallbackLocale?: string
    }
  /**
   * Gap 4 (2026-06-05 native-readiness audit) Strategy-B first port —
   * `createMachine({ initial, states })` from `@pyreon/machine`. Emits
   * the PyreonMachine reactive container the runtime ports ship:
   *   Swift  → @State private var m = PyreonMachine(initial: "idle",
   *               transitions: ["idle": ["FETCH": "loading"], ...])
   *   Kotlin → val m = remember { PyreonMachine(initial = "idle",
   *               transitions = mapOf("idle" to mapOf("FETCH" to "loading"), ...)) }
   *
   * Method calls flow through unchanged (`m.send("X")` / `m.matches("Y")`
   * / `m.can("Z")` / `m.nextEvents()`) — the runtime container defines
   * them. The `m()` read-current-state syntax also works unchanged via
   * Swift `callAsFunction()` and Kotlin `operator fun invoke()`.
   *
   * `initial` is the string-literal state name from the config's
   * `initial: 'X' as const` (the `as const` is stripped). `transitions`
   * is the parsed `{ state: { event: nextState } }` map from the
   * `states` config field. Closed PR #1319's "machine emit structurally
   * broken" silent-drop AND PR #1444's Tier-2 diagnostic warning (it
   * disappears now that emit is correct).
   */
  | {
      kind: 'machine'
      name: string
      initial: string
      transitions: Record<string, Record<string, string>>
    }

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
  | { kind: 'let'; name: string; expr: ExprIR; mutable?: boolean }
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
  | { kind: 'arrow'; params: string[]; body: ExprIR; stmts?: StatementIR[] }
  /**
   * RX-2 — `@pyreon/rx` namespace call. Produced by parse.ts'
   * `tryRxNamespaceLowering` when it encounters `rx.METHOD(signal, ...)`.
   * Each emitter handles the dispatch per-target since Swift `[T]` and
   * Kotlin `List<T>` have divergent method names for many operations
   * (`rx.count` → Swift `.count` / Kotlin `.size`, `rx.take` → Swift
   * `Array(s.prefix(n))` / Kotlin `s.take(n)`, etc.).
   *
   * `source` is the signal/collection source (typically a call
   * expression `signalName()` representing a signal read), `args` are
   * the remaining arguments after the source.
   */
  | { kind: 'rx-call'; method: string; source: ExprIR; args: ExprIR[] }
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
  | { kind: 'object'; fields: { name: string; value: ExprIR }[]; spreads?: ExprIR[] }
  | { kind: 'paren'; inner: ExprIR }
  /**
   * Spread element in array literal (`[...todos(), newTodo]`) used by
   * TodoMVC's mutation functions. The emit on Swift becomes `todos +
   * [newTodo]` (immutable concat) — preserves the source's
   * value-semantics. Kotlin emit: `todos + listOf(newTodo)`.
   */
  | { kind: 'spread'; argument: ExprIR }

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
 * inline `const X = model({ state: { ... literal ... } }).create()`
 * shape. PMTC emits a per-model PyreonModel_<id> class at module
 * scope + a `@State` / `remember` binding inside the component body.
 *
 * v2 scope: literal state values only (string / number / boolean).
 * Actions, views, .asHook(), getSnapshot, onPatch, etc. are
 * deferred follow-ups.
 */
export interface ModelDefnIR {
  /** User-side instance binding name (e.g. `counter`). */
  instanceName: string
  /** Suffix used to derive the emitted class name (PyreonModel_<id>). */
  modelId: string
  /** State fields extracted from the literal `state: { ... }` config. */
  fields: { name: string; type: 'string' | 'number' | 'boolean'; initial: string | number | boolean }[]
}

/**
 * Gap 4 follow-up — @pyreon/validate `withField(schema, meta)` v1.
 * PMTC discards the schema arg (it's a Zod/Valibot/ArkType runtime
 * object that doesn't translate) and emits a metadata struct holding
 * the literal `meta` fields. Downstream native code can reference
 * `emailField.label`, `emailField.placeholder`, etc. — useful for
 * form labels / UI hints even without runtime schema validation.
 *
 * v1 scope: literal meta object with string fields. Validator runtime
 * (parseReactive, formatErrors, getMeta, watchValid) is NOT ported.
 */
export interface FieldMetaDefnIR {
  /** Top-level binding name (e.g. `emailField`). */
  bindingName: string
  /** Literal meta fields (string values only in v1). */
  meta: { name: string; value: string }[]
}

/**
 * Gap 4 follow-up — @pyreon/feature schema-driven CRUD config.
 * `const Todo = defineFeature({ name: 'todo', schema: { ... } })`
 * with literal field-type map emits a per-feature schema struct +
 * a module-scope const exposing `name` + `initialValues`. The CRUD
 * runtime methods (`useList`, `useById`, etc.) are NOT ported —
 * tier2 silent-drop diagnostic still fires for component-body uses
 * pointing users to the Layer-4 workaround. Schema struct + name
 * + initialValues are the v1 deliverable: gives downstream code
 * something REAL to reference for forms / data shapes.
 *
 * v1 scope: literal schema shape `{ field: "string" | "number" |
 * "boolean" }`. Zod / Valibot / ArkType schemas fall through to
 * the existing tier2 silent-drop diagnostic.
 */
export interface FeatureDefnIR {
  /** Top-level binding name (e.g. `Todo`). */
  bindingName: string
  /** Feature name from `defineFeature({ name: 'X', ... })`. */
  featureName: string
  /** Schema fields parsed from the literal `schema: { ... }` map. */
  fields: { name: string; type: 'string' | 'number' | 'boolean' }[]
}

/**
 * Gap 4 follow-up — `@pyreon/validation` Zod-schema v1.
 * Recognizes the simplest `zodSchema(z.object({...}))` pattern and
 * emits a per-binding struct representing the validated shape.
 * v1 supports `z.string()` / `z.number()` / `z.boolean()` fields.
 * Schema-modifier chains (.min(), .max(), .email(), etc.) are
 * accepted at the AST level but their constraints are NOT
 * enforced in the emitted struct — v1 is shape only. v2 follow-up
 * will emit runtime validation methods that honor constraints.
 */
/**
 * Gap 4 v2.1 — constraint enforcement for emitted schemas.
 * Extracted from Zod modifier chains: `.min(N)`, `.max(N)`,
 * `.email()`, `.url()`, `.uuid()`. Each constraint becomes a
 * runtime check inside the generated `parse()` method.
 *
 * For string fields:
 *   - min: minimum length
 *   - max: maximum length
 *   - email: rough RFC-5322 email regex check
 *   - url: rough URL regex check
 *   - uuid: UUID-format check
 *
 * For number fields:
 *   - min: numeric minimum (inclusive)
 *   - max: numeric maximum (inclusive)
 */
export interface ZodFieldConstraints {
  min?: number
  max?: number
  email?: boolean
  url?: boolean
  uuid?: boolean
}

/**
 * Gap 4 v2.2 — compound field type extension.
 * 'array' marks a list-of-primitive field (z.array(z.string()) etc.);
 * the `element` carries the inner primitive type.
 *
 * Gap 4 v3 — `elementConstraints` carries constraints applied to the
 * INNER element call (`z.array(z.string().min(2))`). v3 ships
 * arrays-of-primitives + per-element constraints; nested arrays and
 * arrays of objects remain deferred.
 */
export type ZodFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  /**
   * Gap 4 v3.2 — nested object reference. `schemaName` points at a
   * sibling `ZodSchemaDefnIR` (typically synthesized + listed in the
   * parent's `auxSchemas`). Emitters render as `<schemaName>` (struct
   * or data class name) and route parse() through the named schema's
   * own `parse()` method.
   */
  | { kind: 'object'; schemaName: string }
  | {
      kind: 'array'
      /**
       * Element type. v2.2 shipped primitives only; v3.2 adds nested
       * object elements via `{ kind: 'object', schemaName }`.
       */
      element:
        | 'string'
        | 'number'
        | 'boolean'
        | { kind: 'object'; schemaName: string }
      /** v3 — applies to PRIMITIVE element types only. */
      elementConstraints?: ZodFieldConstraints
    }

export interface ZodSchemaDefnIR {
  /** Top-level binding name (e.g. `userSchema`). */
  bindingName: string
  /** Field shape extracted from `z.object({ ... })`. */
  fields: {
    name: string
    type: ZodFieldType
    /** Gap 4 v2.1 — constraints extracted from the modifier chain. */
    constraints?: ZodFieldConstraints
    /**
     * Gap 4 v2.2 — `.optional()` or `.nullable()` modifier present.
     * Emitted as `T?` in both Swift and Kotlin; parse() returns nil
     * (not throw) when the field is missing.
     */
    optional?: boolean
  }[]
  /**
   * Gap 4 v3.2 — auxiliary schemas synthesized while parsing this
   * one. A `z.object({ address: z.object({...}) })` produces an
   * auxiliary `<binding>_address` schema; a `z.array(z.object({...}))`
   * produces a `<binding>_<field>_Item`. The top-level schema's
   * emitter must emit each aux schema as a sibling struct/data-class
   * BEFORE the main schema (Swift compiles top-down; Kotlin uses
   * forward references either way, but ordering improves readability).
   */
  auxSchemas?: ZodSchemaDefnIR[]
  /**
   * Gap 4 v3.3 — discriminated union shape. Set when the source is
   * `z.discriminatedUnion('<field>', [z.object({...}), ...])`. When
   * set, `fields` is empty — the emitter renders the schema as a
   * Swift enum / Kotlin sealed class with each variant as an
   * associated-value case. Each variant references an aux schema in
   * `auxSchemas` (one per variant).
   */
  discriminator?: {
    /** Discriminator field name (e.g. `'type'`). */
    field: string
    /** One entry per variant. */
    variants: {
      /** Literal value the variant matches (e.g. `'cat'`). */
      literal: string
      /** Aux schema name (the variant's struct/data class). */
      schemaName: string
      /**
       * Variant tag (PascalCased literal). Used as the enum case /
       * sealed-class subclass name (e.g. `Cat`, `Dog`).
       */
      caseName: string
    }[]
  }
}

export interface ParseResult {
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
   * Gap 4 follow-up: @pyreon/validate withField metadata structs.
   * Each one emits a per-binding metadata struct at module scope
   * holding the literal meta fields.
   */
  fieldMetas: FieldMetaDefnIR[]
  /**
   * Gap 4 follow-up: @pyreon/feature definitions from
   * `const X = defineFeature({ name, schema })`. Each one emits a
   * per-feature schema struct + module-scope const exposing the
   * schema's initialValues + name.
   */
  features: FeatureDefnIR[]
  /**
   * Gap 4 follow-up: @pyreon/validation Zod-schema v1 definitions
   * from `const X = zodSchema(z.object({...}))`. Each one emits a
   * per-binding struct + module-scope const.
   */
  zodSchemas: ZodSchemaDefnIR[]
  /**
   * Top-level pure-logic HELPER functions — a function that takes value
   * parameters and returns a non-JSX value (`function dbl(x: number) { return
   * x * 2 }`, CLAUDE.md's L1 "shared pure logic"). Emitted at file scope as a
   * Swift `func` / Kotlin `fun` (a sibling of enums / structs / stores, BEFORE
   * the component View structs so components + store methods can call them).
   * A GENERIC helper (`function first<T>(…)`) is NOT collected here — the IR
   * has no generic-parameter representation, so it stays a NAMED warning (see
   * `tryComponentFromTopLevel`). Distinct from `StoreDefnIR.methods` (same
   * `DeclIR{kind:'function'}` shape, but those emit as CLASS methods on the
   * store singleton, these emit free at file scope).
   */
  helperFns: Extract<DeclIR, { kind: 'function' }>[]
  /** Diagnostic messages produced during IR construction. */
  warnings: string[]
}

export interface TransformResult {
  /** Emitted source code for the target language. */
  code: string
  /** Diagnostic messages from the IR construction. */
  warnings: string[]
}
