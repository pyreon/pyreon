# @pyreon/native-compiler

## 0.52.0

### Minor Changes

- Add `useCrashReporter()` — cross-platform crash capture, persistence, and rehydration. Captures uncaught errors (web `window.onerror`/`unhandledrejection`, iOS `NSSetUncaughtExceptionHandler`, Android `Thread.setDefaultUncaughtExceptionHandler` chaining to the previous handler), persists the report (localStorage / Application Support / app files dir), and rehydrates the previous session's report on the next launch — the credential-free half of crash reporting. The vendor transport (Sentry, a custom endpoint) is app-wired via `setCrashTransport` / `PyreonCrashTransportRegistry`, so the framework never fakes an upload. `useCrashReporter()` lowers to both native targets (SwiftUI + Compose); the Android factory self-installs a file-backed backend so the report survives the crash it reports. Signal crashes (iOS) and NDK crashes (Android) are disclosed out of v1 scope. (c4c2d52)
- Add `useDeviceInfo` — describe the device from one call on web, iOS and Android. (1275e17)

  `platform` needs no runtime on native: it lowers to a compile-time constant
  per target. `model`, `osVersion`, `isTouch` and `screen` come from a
  `PyreonDeviceInfo` runtime co-located in `@pyreon/hooks`, with the platform
  queries behind an injected probe so the shape is testable with no UIKit, no
  Android SDK and no device.

  Two deliberate contracts:

  **`model` and `osVersion` are empty strings on the web.** The browser cannot
  answer them reliably — `navigator.platform` is deprecated, User-Agent Client
  Hints are Chromium-only, and parsing the UA string is a well-known source of
  answers that look right and rot as browsers change their strings. These are
  the fields that end up in analytics and support tickets, where a plausible
  wrong answer costs more than a missing one, so empty means "not knowable
  here" rather than a guess. Branch on `platform()` before reading them.

  **`screen` reads through on every access** instead of caching at
  construction. A fold, a rotation or a Stage Manager resize moves it while the
  app is live, and a value captured once would silently describe the old
  geometry. Both native suites assert this by mutating the probe after
  construction.

- `@pyreon/a11y`'s `announce(...)` works on iOS + Android, and its native runtime is **co-located in the package** (`@pyreon/a11y/native/{swift,kotlin}/`) — the per-package architecture, not the monolithic `@pyreon/native-runtime-*`. (02c2bd9)

  **Runtime (co-located) — `PyreonA11y`:**

  - Swift: `announce(_:assertive:)` posts a VoiceOver announcement (`UIAccessibility.post(.announcement)`), raising the iOS 17+ speech priority when `assertive`.
  - Kotlin: `announce(message, assertive)` routes to a registered announcer (`PyreonA11y.setAnnouncer { rootView.announceForAccessibility(it) }`), the "Android needs a host" seam — a safe no-op before wiring.

  Ships in `@pyreon/a11y/native/`, declared via the `pyreon.native` field, so `pyreon-native wire` aggregates it from the installed package. The co-source verify gate (`scripts/check-native-cosource.ts`, wired into native-validate CI) compiles + smoke-runs it against the stub harness — the Kotlin announcer seam is asserted, the Swift wrapper typechecks.

  **Lowering:** `announce("m")` → `PyreonA11y.announce("m", assertive: false)`; `announce("m", { politeness: 'assertive' })` → `assertive: true`. Message is any expression; a renamed import (`announce as say`) is handled. A new `announce-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/a11y` import) + both emits + the `expr-utils` walkers + `infer-type`.

  The **DOM-based helpers stay web-only** — `VisuallyHidden` / `LiveRegion` / `SkipLink` / `createA11yId` still warn (per-export, `announce` excepted).

  Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonA11y` stubs on swiftc + kotlinc); `native-a11y.test.ts` 7 cases + the co-source gate. Full native-compiler suite 2818 pass (fixing two tests that had encoded the old "announce warns" behavior). No device proof yet; `politeness` isn't distinguished on Android.

- Add `useBluetooth` — BLE discovery on web, iOS and Android from one source (408b9b5)

  `@pyreon/hooks` had no Bluetooth surface at all. This adds one that crosses:
  a web implementation over `navigator.bluetooth`, a CoreBluetooth runtime, an
  Android BLE runtime, and the lowering that connects them.

  **Discovery only, deliberately.** GATT — services, characteristics, notify —
  is where the three platforms stop resembling each other: Web Bluetooth
  requires a user gesture per device and exposes no free-running scan at all,
  while CoreBluetooth and Android BLE both scan continuously and model
  connection state differently. Shipping discovery as a real 1:1 surface and
  leaving connection to a native escape hatch is honest; pretending the whole
  stack crosses would not be.

  The one interaction difference that remains is documented rather than papered
  over: on web, `scan()` opens the browser's chooser and resolves with a single
  device, so `scanning` is true only while it is open. The reactive SHAPE is
  identical on all three; the interaction model is the platform's.

  **The contract both runtimes reproduce is first-seen order, deduped by id.**
  BLE peripherals advertise continuously, so a duplicate sighting is the common
  case rather than an edge one — a runtime that appended unconditionally would
  flood the list while still passing a one-shot test. Asserted on all three
  sides, and the FIRST sighting's name is the one kept.

  Errors are state, not exceptions: a denied permission or a cancelled chooser
  lands in `error()` and ends the scan, matching every other permission-shaped
  hook here.

  The runtimes take an injected scanner, so their ordering and state logic
  compiles and RUNS with no radio and no SDK — both native test programs
  execute in the co-source gate. The real `CoreBluetoothScanner` /
  `AndroidBluetoothScanner` are device-verified rather than stub-verified,
  because an approximated stub of a radio proves nothing.

  `bt.scanning()` reads correctly on every target: Swift drops the parens (the
  member is a stored property) and Kotlin resolves `.value`, so the web-correct
  spelling compiles everywhere — the read-inversion `model()`'s state fields had.

- `<Button variant>` lowers to iOS + Android (cce02b3)

  The prop was documented (`primary | secondary | ghost | danger`, default
  primary) and inert on both native targets, so a `danger` button rendered
  identically to a confirm button — the case where the visual difference IS the
  safeguard.

  - **SwiftUI** — `.buttonStyle(.bordered)` / `.plain` /
    `.borderedProminent` + `.tint(.red)`.
  - **Compose** — the role selects the COMPOSABLE (`OutlinedButton` /
    `TextButton`) rather than a modifier; `danger` keeps `Button` and overrides
    its container colour via `ButtonDefaults.buttonColors(backgroundColor = …)`.

  Material **2** spellings throughout (`backgroundColor`,
  `MaterialTheme.colors`) — the emit's base is `androidx.compose.material.*`,
  and the Material 3 names are the trap that already shipped once with
  `<Heading>` typography. Pinned by a spec.

  `primary` and an absent variant are byte-identical to the previous output. A
  dynamic or unknown value warns and falls back rather than guessing.

- Co-locate native runtimes into their own packages. (ed6518a)

  The Swift/Kotlin runtimes for form, store, state-tree, machine, i18n, permissions,
  and query move out of the `@pyreon/native-runtime-*` monolith into each package's
  `native/{swift,kotlin}/` (declared via the `pyreon.native` package.json field,
  aggregated by `pyreon-native wire`). Framework-base runtimes (reactivity/styling/JSON
  helpers) stay in the monolith. A new `scripts/check-native-cosource.ts` gate compiles
  and smoke-runs every co-located `.swift`/`.kt` against the stub harness so a relocated
  runtime can't rot silently. No API change — this is a source-location move.

- Co-locate the @pyreon/storage native runtime. (dfdb7f4)

  Moves the storage-specific Swift/Kotlin runtimes (PyreonStorage,
  PyreonSecureStorage + the Android impls) out of the monolith into
  `@pyreon/storage/native/{swift,kotlin}`. `PyreonStorageBackends.kt` — the
  shared persistence primitive (backend interface / registry / file backend /
  codec, also used by PyreonCrashReporter) — deliberately STAYS in the base
  monolith runtime; the co-located storage group references it via a new
  `@base/<File>.kt` companion in the co-source gate.

  Gate work (reusable for future batches): `verify-kotlin --files=<set>`
  (per-service-group compile) + a companion-suppression filter that drops the
  monolith companion append while keeping explicitly-listed `@base/` files;
  `check-native-cosource` grows a `pyreon.native.kotlinServices` map (each group
  compiles under one `--service` stub bundle) and a `@base/` prefix for
  framework-base companions. The `PyreonSecureStorageAndroid` stub service now
  also writes the compose-ui LocalContext stub so the whole storage graph
  verifies as one group.

  The six example apps whose shared source uses `useStorage`/`useSecureStorage`
  (finance, router-demo, todomvc × android+ios) gain the co-located storage
  source roots. No public API change — a native-source relocation.

- Lower `useDebouncedValue` — a debounced field never updated on device (f0146a8)

  The call emitted verbatim, so a debounced search field compiled clean and
  never updated.

  The web contract was **measured before this emit was written**, because
  "leading or trailing edge?" is exactly the question two native ports would
  answer the same wrong way and agree with each other. Four properties, all
  now asserted on the web side:

  - the value is available IMMEDIATELY — no first-delay gap
  - updates are TRAILING-edge
  - a burst collapses to the LAST value
  - the timer RESTARTS on each change rather than firing on a fixed cadence

  That last one is what makes the lowering exact rather than approximate:
  `.task(id:)` and `LaunchedEffect(key)` both cancel and restart when their key
  changes, which IS a restarting trailing-edge debounce. No runtime, no stored
  timer handle.

  Two details that took a compile to find:

  - The seed comes from the SOURCE SIGNAL's own initial, not the source
    property. A `@State` initializer runs before `self` exists, so
    `@State var d = query` is "cannot use instance member within property
    initializer" — and a type-default seed would leave the field empty for the
    whole delay on every mount, which the measured immediate-seed contract
    forbids.
  - The element type is inferred at EMIT time, where the component's inference
    context knows the source signal's type. Parse-time inference produced
    `Any`, which breaks every use site.

  The Swift stubs gained the id-keyed `task` overload — without it the stub
  matched the un-keyed one and reported "extra trailing closure", rejecting a
  correct emit. That is the stub-narrower-than-reality trap again.

  Non-literal delays and block-body getters decline by name.

  Note: the `kotlinx.coroutines.delay` stub and its conditional import also
  appear in the `useInterval`/`useTimeout` PR. Either merge order resolves
  trivially — both add the same three lines.

- Lower dynamic `useQuery` to native (SwiftUI + Compose). The v1 emit only crossed a STATIC queryKey + an inline `fetch('<url-literal>')` queryFn; this closes the common real-app shapes: (8b49de2)

  - **Runtime `queryKey`** — a `queryKey` array with non-literal parts (`['user', userId]`, `['k', id()]`) now builds a RUNTIME cache key. SwiftUI's `@State` default can't reference another property (a prop/signal), so the query constructs KEYLESS and is re-keyed in the async harness via a new `PyreonQuery.setKey(_:)`, with the harness KEYED on the computed string (`.task(id:)` / `LaunchedEffect(key)`) so a key change re-keys the cache and re-fetches — matching the web's reactive queryKey.
  - **Templated fetch URL** — `queryFn: () => fetch(`/users/${userId}`)` emits native string interpolation inside the harness (`self`/params in scope), through `URLSession`/`readText` or PyreonHttp exactly as the literal path does.
  - **Direct-value queryFn** — `() => <expr>` / `async () => <expr>` (no fetch, no await) resolves the computed value directly (no URLSession/decode).

  Both backends emit byte-identical shapes and typecheck against real `swiftc`/`kotlinc`. Static literal-key queries are unchanged (byte-identical `.task {}` / `LaunchedEffect(Unit)`). Anything still beyond scope — a non-array queryKey, a `fetch(<call-expression>)` URL, an `await`/multi-statement direct-value body, a function-reference queryFn — stays a NAMED warning rather than mis-lowering.

- PMTC: a mixed String/non-String `+` now concatenates on both native targets. (cbb7c29)

  JS `+` where either operand is a string is string concatenation (`"count: " + 5 === "count: 5"`), but native has no such implicit coercion, so a shared `.tsx` using this everyday shape failed to compile. `"count: " + n()` emitted Swift `"count: " + n` → _binary operator '+' cannot be applied to operands of type 'String' and 'Int'_; the mirror `n() + " items"` failed the same way. Kotlin's `String.plus(Any?)` coerced a right-hand non-string so `"count: " + n` happened to compile there, but the left-hand form (`Int.plus(String)`) had no candidate and failed — so the two targets diverged and one whole idiomatic concat shape was uncompilable.

  `inferType` already types a string-concat `+` as `string`; only the emit lacked the coercion. Both backends now coerce each concrete non-string operand of a string-concat `+` — Swift `String(...)` (Int/Double/Bool conform to `LosslessStringConvertible`), Kotlin `(...).toString()` — regardless of operand order. A purely numeric `+` is untouched (arithmetic handling unchanged), and a `string + <unknown>` leaves the unknown operand alone.

- PMTC now lowers `@pyreon/http`'s endpoint DSL onto the existing PyreonFetch machinery: a same-file `const api = createHttp({ baseUrl })` + `const getUser = api.endpoint('GET /users/:id')` lets `useFetch<T>(getUser({ params: { id: '1' } }))` resolve at compile time to a concrete templated URL + method, emitting identically to `useFetch<T>('/api/users/1', { method: 'GET' })` on both targets. Literal params only — reactive params, a computed baseUrl, and the `.query()` fetcher form warn and stay web. No new emit/IR/stub; `createHttp`/`.endpoint` are metadata and emit nothing. `@pyreon/http`'s manifest declares the `nativeFrontend` (partial crossing). (d873013)
- Fix two silent defects in PMTC's `@pyreon/http` endpoint lowering. (5a31e4e)

  **The same source file no longer produces different URLs per platform.** The
  native path substituted `:params` and assembled query pairs raw, while the web
  runtime encodes both — so `getUser({ params: { id: 'a b' } })` requested
  `/users/a%20b` on the web and `/users/a b` on iOS/Android, with no diagnostic. A
  literal containing `#` truncated the URL at the fragment, and `?` / `&` injected
  query structure into a path segment. Because the native path only ever
  substitutes LITERALS, encoding now happens at COMPILE time and costs nothing at
  runtime: the emitted URL is a fully-encoded constant.

  The encoders are the web's own primitives rather than a re-implementation —
  `encodeURIComponent` for a path segment, a real `URLSearchParams` for the query
  — so the two positions stay correctly DIFFERENT (a space is `%20` in a path and
  `+` in a query) and equality holds by construction. A differential test asserts
  the baked URL is byte-identical to what `@pyreon/http`'s own `buildUrl` returns,
  across space / `#` / `?` / `&` / `+` / `/` / non-ASCII / `$'`. Path substitution
  also moved to a function replacement: `String.replace` interprets `$&` / `` $` ``
  / `$'` / `$$` in a string replacement, so `id: "$'"` previously emitted
  `/users/` with the id gone entirely.

  **Options are lowered or named, never dropped.** `resolveEndpointParts` read
  only `params` and `query`, so `createUser({ json: {…} })` emitted a POST with no
  body and no warning. A literal `json` now lowers to the request body plus a
  `content-type: application/json` the caller can override, and `headers` lower
  from both the call and the endpoint declaration (a per-call object replaces the
  declared one, matching the web). `signal` / `timeout` / `meta`, a non-literal
  body or header, an unreadable spread, and unhonourable declaration options
  (`timeout`, `throwHttpErrors: false`) each warn by name. Both lower onto fields
  the fetch/query IR already carried, so there is no emit, IR or stub change.

- Lower `useInterval` and `useTimeout` — a ticking clock did nothing on device (06c618f)

  Both are pure timing over a callback, with no platform capability behind
  them. Neither lowered: they are called at STATEMENT position, and the
  component walker's bare-statement arm DROPPED them. So a ticking clock or a
  delayed action compiled clean and did nothing on device.

  They lower to the idiom that already carries each target's
  auto-cancellation — SwiftUI's `.task`, Compose's `LaunchedEffect(Unit)` —
  which is what reproduces the web hooks' `onUnmount` cleanup with no runtime
  and no stored handle.

  Two details that are load-bearing rather than stylistic:

  - The Swift interval loop consults `Task.isCancelled` instead of `while
true`. A cancelled sleep returns immediately, so an unguarded loop would
    SPIN rather than stop.
  - The `.task` attaches to the ZStack-wrapped body, not a transparent Group.
    A modifier on a Group is redistributed onto the conditional branches inside
    it, so it would be cancelled and restarted on every state flip — the
    device-found bug the fetch harness already guards against.

  What cannot be baked declines BY NAME: a `null` (paused) delay, a reactive
  getter delay, and a non-inline callback. Silently treating a paused timer as
  a running one would be worse than declining it.

  `delay` is emitted unqualified, because the Kotlin stub file is a single
  default-package unit and cannot declare `package kotlinx.coroutines`. The
  real build gets it from a conditional import in `@pyreon/native-cli`, with
  specs in both directions — without that, the device build would fail on
  `unresolved reference 'delay'` while the stub gate stayed green.

- feat(native): `JSON.stringify(x)` lowers to native serialization (1abcaef)

  `JSON.stringify(x)` — the SAFE half of the JSON gap — now lowers to SwiftUI + Compose instead of warning: Swift `String(data: try! JSONEncoder().encode(x), encoding: .utf8) ?? ""`, Kotlin `Json.encodeToString(x)`. Emitted structs are already `Codable` / `@Serializable`, and scalars/arrays conform too, so serialization has a target on both platforms; `try!` is safe because a Codable value never throws on encode. The native-cli adds `import kotlinx.serialization.encodeToString` for the real device build (the kotlinc stub fakes it as a `Json` member, so the validate gate passed without it — the classic stub-masks-a-missing-import case).

  `JSON.parse` still emits a named warning: it throws on malformed input, which needs a native error model (`try`/`throw` lowering) PMTC does not carry yet — a tracked follow-up. Decode typed API responses via `useFetch<T>` instead.

  Verified end-to-end against real swiftc + kotlinc (object and array-of-structs); bisect-verified.

- Lower reactive `Map`/`Set` signals to native collections (iOS + Android). (cbb7c29)

  `signal(new Set<string>())` / `signal(new Map<string, number>())` previously
  inferred to `Any`, so every read (`.size`/`.has`/`.get`) passed through
  verbatim and failed swiftc/kotlinc. The signal-declaration type path
  (`inferTypeFromInitial`) now maps a `new-collection` initializer to the
  `set`/`map` TypeIR the type mapper and the already-wired Map/Set method
  vocabulary consume, so the annotation and its reads agree on one native
  collection type — `@State private var seen: Set<String>` (Swift) /
  `mutableStateOf(mutableSetOf<String>())` (Kotlin).

  v1 scope (scalar element/key/value — number/string/boolean): reads
  (`.size`→`.count`, `.has`→`.contains`/`.containsKey`, `.get`→`map[k]`),
  construction (`new Set<T>()`, `new Set([...])`, `new Map<K,V>()`), and the
  mutation vocabulary (`.add`/`.delete`/`.set`/`.clear`) all type-check on both
  real toolchains. Non-scalar element/key/value types (`Set<{...}>`,
  `Map<string, {...}>`) and seeded `new Map([...])` now WARN by name instead of
  silently mis-emitting uncompilable native code (a non-scalar Swift `Set`
  element is a hard `does not conform to Hashable` error).

- Nested anonymous-object literals now synthesize nested structs/data-classes on both native targets. A nested object field (`signal({ name, meta: { … } })`) or an array of nested objects previously degraded the outer object to `Any` on Swift / an invalid tuple on Kotlin; each all-scalar-leaf level now gets its own synthesized struct named `Parent` + capitalized-field (e.g. `CProfile` + `meta` → `CProfileMeta`), so the whole shape compiles. (70f069f)
- PMTC: a mixed Int/Double conditional (`cond ? 1 : 2.5`) now unifies to Double on both native targets — the ternary was typed by its `then` branch alone, so Swift annotated the computed `Int` while its value was `Double` and swiftc rejected it. The Int-typed branch is coerced (`Double(n)` / `(n).toDouble()`) so a non-literal Int branch compiles too. (ce75e18)
- Lower `useToggle` and `useCounter` — pure state needed a lowering, not a runtime (408b9b5)

  Both are pure state containers: a signal plus a few mutators, with no platform
  dependency at all. Neither lowered, so the call emitted verbatim and the native
  build failed with `cannot find 'useToggle' in scope`.

  That is the shape of most of the unlowered hook surface. Of `@pyreon/hooks`'
  56 exported hooks, 22 lower; roughly a dozen of the remainder are logic both
  targets already have (`usePrevious`, `useDebouncedValue`, `useInterval`,
  `useTimeAgo`, …). This closes the first two and establishes the pattern.

  The state becomes a plain `@State` / `mutableStateOf` field and every mutator
  is rewritten at its USE SITE into the arithmetic it stands for — no runtime,
  no wrapper type, and `useCounter`'s clamp visible in the emitted output. The
  clamp expression is written once and shared by both emitters, because a
  counter that clamped differently per platform is precisely the divergence a
  shared helper prevents.

  Values that cannot be baked in decline BY NAME rather than silently dropping:
  a non-literal initial value, and — the one that matters — a non-literal bound,
  which would otherwise emit a counter that simply stopped clamping on device.

  Measured against the web rather than between the two targets: the web arm in
  `@pyreon/hooks` pins the semantics both emits reproduce, including the subtle
  one — `reset()` restores the CLAMPED initial, not the raw argument, so an
  out-of-bounds seed cannot reappear. Both emits compile on real `swiftc` and
  `kotlinc`.

- Lower `useDebouncedCallback` and `useThrottledCallback` (290a386)

  Both emitted verbatim, so a debounced save or a throttled scroll handler
  compiled clean and never fired on device.

  Unlike `useDebouncedValue`, these need a **runtime**: they return a callable
  carrying `.cancel()` / `.flush()`, so there is a handle a caller reaches and a
  latest-args slot to hold. A `.task(id:)` has no identity to offer. This adds
  `PyreonRateLimit` — co-located in `@pyreon/hooks/native`, on both platforms.

  **The edges are the contract, and were measured on the web before either port
  existed** — two native ports would otherwise agree with each other on the
  wrong ones:

  - debounce → **no** leading edge; nothing fires until the caller goes quiet
  - throttle → leading edge **and** a trailing one, carrying the latest args

  Three design decisions worth stating:

  - **Throttle is modelled as a WINDOW, not a clock.** The web compares
    `Date.now()` against the last invocation; porting that would make the
    runtime either untestable without real waiting or dependent on a fake clock
    whose advance rate is its own source of divergence. A window is observably
    identical and needs neither.
  - **The scheduler is injected**, so both state machines are exercised
    synchronously with no real clock. Both native test programs RUN in the
    co-source gate. A timing test that actually sleeps is a timing test that
    eventually flakes on a loaded runner.
  - **Swift attaches the action post-init.** A `@State` initializer runs before
    `self` exists, so a closure capturing sibling state cannot be passed to
    `init` — the emit binds it in `.onAppear`, the same late attachment
    `PyreonForm`'s `onSubmit` already uses.

  Kotlin's default scheduler is a `java.util.Timer` task rather than a
  `CoroutineScope`: a scope handed to a long-lived limiter either outlives the
  composable that made it or is cancelled under it, and a Timer task is
  cancellable by token with neither hazard.

  A multi-argument callback declines BY NAME — the runtime carries one, and
  silently dropping the rest would produce a callback that runs with the wrong
  data rather than one that visibly does not run.

- Lower two-element responsive style arrays on iOS and Android (eed8fe9)

  `style={{ padding: [8, 16] }}` — unistyle's mobile-first idiom — previously
  refused on the native targets, so a responsive web layout had to be rewritten
  with an explicit `useSizeClass()` branch to cross. It now lowers directly:

  - **iOS** — `.padding((pyreonSizeClass == .regular ? 16 : 8))`, with the
    `@Environment(\.horizontalSizeClass)` injection the conditional needs.
  - **Android** — `Modifier.padding((if (LocalConfiguration.current.screenWidthDp >= 600) 16 else 8).dp)`,
    the same 600dp boundary `useSizeClass()` already uses.

  Exactly two elements, because that is the only length that maps losslessly:
  native resolves two size classes, not N breakpoints, so a three-element
  array's middle band spans both and collapsing it would silently pick a wrong
  value for part of its range. Longer arrays keep the existing refusal and its
  diagnostic.

- fix(native): a dropped inline router guard now warns by name instead of vanishing silently (27bffa7)

  A global router guard written inline — `createRouter({ beforeEach: [(to) => isAuthed()] })` — is not lowered to native (closure-emit is a tracked follow-up; only a NAMED function reference `beforeEach: [authGuard]` lowers today). Until now it was dropped **silently**, which is the worst failure mode for a guard: the navigation ships **ungated** on iOS/Android with no signal — a security foot-gun. It now emits a named warning pointing at the named-function fix, upholding the compiler's invariant that outside the lowered subset the failure mode is a named warning, never a silent drop. This closes the last enumerated silent-drop shape in the router surface.

- Lower `@pyreon/rx`'s standalone transforms, not just the `rx.*` namespace (35bd5ae)

  `import { filter, map } from '@pyreon/rx'` emitted itself verbatim and failed
  the native build with `cannot find 'map' in scope`. Only the namespace form
  (`rx.map(src, fn)`) lowered — and rx's own manifest reaches for the standalone
  form **43 times** against 5 for the namespace, so the documented, dominant
  idiom was the broken one.

  The two are structurally identical — both source-first, `map(src, fn)` vs
  `rx.map(src, fn)` — so the recognizer only had to accept the second callee
  shape. It resolves through the IMPORT, never the bare name: `map`, `filter`
  and `first` are names a user is overwhelmingly likely to have of their own,
  and claiming them would silently rewrite their code. Aliased imports
  (`map as project`) resolve; a user's own `map` is untouched.

  `pipe()` deliberately does NOT lower, and declines by name. The natural emit
  is an immediately-applied closure per stage, which discards the parameter's
  type — compiled against both real toolchains it fails on each (Swift "value of
  type 'Any' has no member 'count'", Kotlin "cannot infer type for type
  parameter 'T'"). Inlining each stage by substituting its parameter would fix
  it and is the follow-up; shipping the closure form meanwhile would have
  emitted code that does not build. The transforms `pipe` composes DO lower, so
  the advice names a real alternative rather than an escape hatch.

  The emitted transforms are verified against real `swiftc` and `kotlinc`.

  ## `unique()` returned an arbitrary order on iOS

  Swift emitted `Array(Set(_:))`, whose comment claimed it matched rx's "set of
  unique values" semantic. Measured, rx returns **first-occurrence order**
  (`[3,1,2,3,4]` → `[3,1,2,4]`), and Kotlin's `distinct()` preserves it — so
  Swift was the only one of the three that did not, and a `<For>` over
  `unique(...)` rendered in an arbitrary order on iOS and a stable one
  everywhere else.

  The obvious replacement (`reduce(into: [])`) does not typecheck: the empty
  seed leaves the accumulator ambiguous, so `contains` resolves to
  `contains(where:)`. The shipped form needs no seed annotation and was proven
  by executing it against the same input the web arm asserts.

- feat(native): seeded `new Map([[k, v], …])` lowers to a native dict literal (f109aea)

  The mirror of the already-supported seeded `new Set([...])`. `new Map([["apple", 3], ["pear", 2]])` now lowers instead of warning + dropping: Swift `["apple": 3, "pear": 2]` (typed `[String: Int]`), Kotlin `mutableMapOf("apple" to 3, "pear" to 2)`. Key and value must be SCALAR (a native dictionary key needs Hashable; the value is held to the same scalar bar as the empty `new Map<K,V>()` form). Any other shape — a non-pair element, a non-scalar key/value, a computed pair array — stays a named warning, never a mis-emit.

  Verified end-to-end against real swiftc + kotlinc; bisect-verified.

- `useSortable` lowers to a native reorder engine — list drag-and-drop crosses to iOS and Android (71c4409)

  `@pyreon/dnd` wraps pragmatic-drag-and-drop, which is DOM pointer machinery, so
  the package as a whole stays web. But list REORDER — the highest-value case, and
  the one users actually reach for on a phone — is gesture-shaped rather than
  DOM-shaped, and both platforms have first-class support for it.

  `useSortable({ items, by, onReorder })` now lowers to a co-located
  `PyreonSortableState<T>` engine on both targets: SwiftUI `.draggable` /
  `.dropDestination`, Compose long-press drag. The engine ships as co-located
  Swift and Kotlin source under `packages/fundamentals/dnd/native/`, verified by
  the co-source gate.

  The rest of the surface is honest about staying web: `useDraggable` /
  `useDroppable` are element-getter hooks, `useDragMonitor` is page-global, and
  `useFileDrop` is an OS file-picker concept. Each still warns BY NAME rather than
  emitting a call that does not exist natively.

  The lowering requires the full contract — `items`, a single-param `by`
  (`(item) => item.id`), and an arrow `onReorder`. Anything else warns naming the
  exact prop and the exact shape it needs, instead of silently degrading.

- Lower `@pyreon/storage`'s process-scoped backends; name why the other two cannot (408b9b5)

  `@pyreon/storage` exports five backends and only `useStorage` lowered. The
  other four warned with the GENERIC line, which left an author unable to tell
  whether their backend was merely unimplemented or genuinely impossible — two
  very different pieces of news.

  Two have an exact native analogue and now lower to plain state:

  - **`useSessionStorage`** — on the web, sessionStorage survives a reload and
    dies with the tab. Native has neither a tab nor a reload: the PROCESS is the
    session, so in-memory state is the analogue rather than an approximation of
    one.
  - **`useMemoryStorage`** — definitionally process-scoped on every platform.

  Both emit a `signal` decl WITHOUT a storage key — the same IR `useStorage`
  produces, minus the `@AppStorage` / `rememberSaveable` persistence that would
  wrongly outlive the process. That negative is asserted, because persisting
  them would be the opposite of what both hooks mean.

  The remaining two have no native analogue at all and now say so by name:
  `useCookie` (a native app has no cookie jar its own UI reads from) and
  `useIndexedDB` — which points at `useDatabase()`, the hook that lowers to
  SQLite on both targets and is the answer the author actually wants.

- Lower `@pyreon/sync`'s `syncedSignal` to native (iOS + Android). (7ee508e)

  `const doc = new PyreonCrdtDoc()` + `const title = syncedSignal({ doc, key, initial })`
  in shared `.tsx` now compile to a native `PyreonSyncedSignal` over a shared
  `PyreonCrdtDoc` — scalar `string`/`number`/`boolean`, `title()` read + `title.set(v)`
  write flowing 1:1 to the facade.

  - **Swift**: the doc + signals are typed `@State` seeded in a GENERATED component
    `init()` (`_title = State(initialValue: PyreonSyncedSignal(doc: doc, …))`),
    because a synced signal's `@State` initializer references the doc and one
    `@State` cannot reference another at property init. Props thread through the
    init as parameters, so a component can still take props.
  - **Kotlin**: sequential `remember { }` blocks (no init needed).

  `@pyreon/sync` leaves `WEB_ONLY_PACKAGES` and declares a `nativeFrontend` (the
  Yjs engine + IndexedDB/WebSocket transports stay web; cross-device transport is
  tracked). Verified end-to-end: the emit type-checks against the real SwiftUI SDK

  - the real facade on macOS, and against the Swift/Kotlin validate stubs.

- Lower `@pyreon/table`'s `createTableState` to native (iOS + Android). (2eb6540)

  `const t = createTableState({ data: () => rows(), columns: [{ id }], pageSize })`
  in shared `.tsx` now compiles to the `@Observable` PyreonTableState engine —
  sort / filter / paginate / select, rendered with `<For each={t.rows()}>` +
  `@pyreon/primitives`.

  - **Column cell accessors are codegen'd** from the row struct's inferred field
    types: a `String` field → `.string($0.name)`, a number → `.number(Double($0.age))`.
  - **Swift** wires the reactive data source in `.onAppear` (`t.setData { rows }`),
    because a `@State` initializer can't capture the source signal; the table
    itself is a self-seeding `@State`. **Kotlin** passes it in the constructor
    (sequential `remember`).
  - Use-sites: `t.rows()`/`t.toggleSort(id)`/`t.setFilter(q)`/… flow through as
    methods; `t.page()`/`t.sortColumn()`/… drop parens (property reads).
  - The `PyreonTableState` port is now `@Observable` (Swift) / `mutableStateOf`-
    backed (Kotlin) so sort/filter/page mutations recompose.
  - `@pyreon/table` declares a `nativeFrontend` and leaves WEB_ONLY_PACKAGES; the
    TanStack-backed `useTable` (row model / faceting / virtual sizing) stays web.

  Verified: the actual emit type-checks against the real SwiftUI SDK + the real
  port on macOS, and both targets validate against the compiler stubs. v1: scalar
  columns with the default `row[id]` accessor; explicit accessors / rowId /
  filterFn are follow-ups.

- `<Text truncate>` lowers to iOS + Android; four inert props now say they are (cce02b3)

  Three documented props on the canonical primitives reached the native emit and
  produced NOTHING, on either target, with no diagnostic:

  - `<Text truncate>` → a plain `Text`, so a label that should ellipsize wrapped
    instead and reflowed the layout around it.
  - `<Stack justify="between">` → a bare `VStack` / `Column`.
  - `<Inline wrap>` → a plain `HStack` / `Row`.
  - `<Link external>` → an ordinary in-app route push, so a link to an external
    site is matched as an app route instead of opening the browser.
  - `<Button variant="danger">` → the default style, so a destructive button is
    indistinguishable from a confirm button.

  `truncate` now lowers exactly on both — `.lineLimit(1).truncationMode(.tail)`
  on SwiftUI, `maxLines = 1, overflow = TextOverflow.Ellipsis` on Compose (both
  halves are required on each: a line bound alone clips mid-glyph).

  The other four now WARN. `<Link external>` is the sharp one — not a layout
  nicety but a link that silently does the wrong thing. Compose could express `justify` on its own
  (`Arrangement.SpaceBetween`), but SwiftUI's stacks have no equivalent, and
  shipping one platform's half would put the two out of agreement — the failure
  `<Transition name>` already taught us to avoid. The warning names the tag the
  author wrote and points at the escape hatches that do lower.

- `@pyreon/toast` works on iOS + Android — and its native runtime is **co-located in the package** (`@pyreon/toast/native/{swift,kotlin}/`), the per-package architecture rather than the monolithic `@pyreon/native-runtime-*`. This is the first package to prove that model end-to-end. (5fc3b9f)

  **Runtime (co-located) — `PyreonToast`** (Swift `@Observable` singleton / Kotlin `object`): a process-global observable queue (add/dismiss/remove/clear), newest-last, distinct monotonic ids, a bounded stack (drops the oldest past `maxToasts`), and an auto-dismiss timer. It ships in `@pyreon/toast/native/`, declared via the package.json `pyreon.native` field, so `pyreon-native wire` aggregates it into a native app build straight from the installed package — no monolith, native tree-shakes to what you import, and a third-party package can follow the same convention.

  **Co-source verify gate** (`scripts/check-native-cosource.ts`, wired into the native-validate CI job): scans every package's `pyreon.native` sources and compiles + smoke-runs them against the stub harness (Kotlin via `verify-kotlin --source`, which gained a path override; Swift via `swiftc -parse-as-library` + run), so a co-located `.swift`/`.kt` can't rot silently now that it lives outside `@pyreon/native-runtime-*`'s own `src/`. Toast's queue behavior is unit-tested this way on both toolchains.

  **Lowering:**

  - `toast("msg")` → `PyreonToast.shared.add("msg", type: "info")` (Swift) / `PyreonToast.add("msg", "info")` (Kotlin). The message is any expression; a renamed import (`toast as notify`) is handled; a literal `{ duration }` (ms → the auto-dismiss; `0` = persistent) lowers.
  - Preset methods `toast.success/error/warning/info/loading("msg")` select the type.
  - `<Toaster />` → a native overlay iterating the reactive queue.

  A new `toast-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/toast` import) + both emits + the `expr-utils` walkers + `infer-type`. Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonToast` stubs on swiftc + kotlinc); `native-toast.test.ts` 7 cases + the co-source gate.

  **v1 scope (disclosed):** message + preset type + literal `duration` lower; the other options (`onDismiss`/`description`/`icon`/`action`) are dropped, and `toast.promise()` / `toast.update()` aren't lowered. `<Toaster />` is a minimal message stack (positioning/styling/animation are a follow-up). No device (Simulator/Emulator) proof yet — the runtime is unit-tested by the co-source gate and the emit is stub-typechecked.

- Warn when a `<Transition name>` has no native translation (8f53bc7)

  `<Transition name="fade">` and the slide/scale family lower to each platform's
  own transition. Anything else — a custom CSS animation, `zoom-in`, `bounce` —
  falls back to a fade on iOS and Android. That fallback is correct, but it was
  SILENT: on the web the author's `${name}-enter-*` CSS runs, on device it
  fades, and because a fade still plays there is no symptom to investigate.

  The translatable vocabulary now lives in ONE module both emitters consume, so
  a name can never be known to Swift and unknown to Kotlin — which would itself
  be a per-platform animation divergence. Unknown names warn once per target,
  naming the divergence and listing what does translate. Behaviour is unchanged:
  this warns, it does not refuse.

- PMTC now lowers STANDALONE `@pyreon/validate` schema validation. Before, only a top-level `const X = s.object({ … })` declaration lowered (the `@pyreon/form` path); an inline `s.object({ n: s.number() }).safeParse(x).success` — the shape real feature code writes to validate data — warned and emitted `s.object(...)` verbatim ("cannot find 's' in scope"). Now the inline schema is synthesized into a `PyreonZodSchema_Inline<N>` struct (reusing the Gap-4 field walker, so scalar objects, nested objects, arrays and constraint chains all lower), and `.safeParse(x)` lowers to a web-faithful `safeParseResult(<x-as-dictionary>)` returning `PyreonParseResult { success, data }` — so a wrapping `.success` / `.data` composes. The argument becomes a native dictionary (`[String: Any]` / `Map<String, Any?>`), so validation checks a runtime map the way the web `safeParse(unknown)` does; identical inline schemas dedup to one struct. Only a LITERAL `s.object({ … })` shape lowers — `s.object(someVar)`, inline `.parse(x)` (throwing), and a user's own `s` binding stay web (warned, never a silent broken emit). Verified end-to-end against real swiftc 6.x + kotlinc 2.x. (0dbf4ac)
- Co-locate a native runtime for `@pyreon/sized-map`, and lower its constructor (5b93f4c)

  `@pyreon/sized-map` is 102 lines of pure logic with no platform edge, and it did
  not work natively at all: `new SizedMap(...)` fell through to the generic "class
  constructors are not supported" path and emitted `let m = ""` — an empty STRING
  where a bounded map was expected.

  It now ships `native/{swift,kotlin}/PyreonSizedMap` and
  `new SizedMap<K, V>({ maxEntries, lru })` lowers to it on both targets, so the
  tier moves from `web-only` to `shared`.

  The ordering is the whole of the work. JavaScript's `Map` preserves insertion
  order, so the web gets eviction for free from `map.keys().next()`. Kotlin's
  `LinkedHashMap` does too and mirrors it almost line for line; Swift's
  `Dictionary` is explicitly UNORDERED, so the Swift runtime carries the recency
  order in a parallel array — O(n) per touch against the web's O(1), which is a
  deliberate trade for a structure whose cap is small by construction, and is
  stated in the file rather than left to be discovered.

  Three semantics are easy to get wrong and are asserted one-for-one on both
  platforms: FIFO is the DEFAULT (a read does not rescue an entry from eviction),
  LRU is opt-in, and `set` ALWAYS refreshes position in BOTH modes — otherwise a
  just-written entry is evicted on the very next call.

  The constructor recognizer gates on the IMPORT, not the bare name: `SizedMap` is
  a plausible name for a user's own class. A non-literal `maxEntries` declines
  with a reason rather than baking in a wrong constant.

- Derive the native compiler's web-only warning set from the package manifests (e56b865)

  Importing a web-only `@pyreon/*` package into shared source is meant to warn at
  parse time, naming the `<Web>` escape hatch. Four packages — `@pyreon/url-state`,
  `@pyreon/head`, `@pyreon/hotkeys` and `@pyreon/feature` — declared
  `multiplatform: { tier: 'web-only' }` but were absent from the compiler's
  hand-written `WEB_ONLY_PACKAGES` literal, so importing one produced **no
  diagnostic at all**: the call emitted verbatim and the native build failed with
  `cannot find 'x' in scope`, pointing nowhere near the cause.

  The set is now derived from the manifests (`tier === 'web-only'` and no
  `nativeFrontend`) and regenerated by `check-multiplatform-tier`, which gates that
  it stays in sync. The hand-written list had already been repaired twice by hand —
  `@pyreon/sync` and `@pyreon/rich-text` were missing, `@pyreon/toast` went stale
  the other way once its core lowered — each time with a comment recording the
  incident rather than closing the class.

  A cross-check test existed but ran in one direction only (every compiler entry
  must declare web-only), and its comment waved the other direction through as
  acceptable. That was the direction that shipped the bug; it now asserts equality.

  Two supporting changes:

  - `multiplatform` gains an optional `nativeFrontend` field for packages that
    lower part of their surface. The three-value tier vocabulary could not express
    partial crossing, which is what made `@pyreon/toast` go stale. `toast`, `a11y`,
    `query` and `validation` now declare it.
  - The blanket warning defers to `UNLOWERED_PYREON_MODULES`, the finer per-symbol
    mechanism, so packages covered there (`validate`, `validation`, `http`, `rx`)
    warn exactly once with their specific advice instead of twice.

  `@pyreon/query` and `@pyreon/validation` also had factually stale rationales:
  query's said native fetching is `useFetch/PyreonFetch` although `PyreonQuery`
  shipped and `useQuery` is lowered, and validation's said per-validator lowering
  was "not shipped" although the Gap-4 schema forms emit native validators.

  ## Lower `@pyreon/validate`'s `s` DSL to native validators

  A top-level `const X = s.object({ … })` declaration now emits a Swift `Codable`
  struct and a Kotlin `data class`, each with `parse` / `safeParse` and real
  constraint enforcement — from the same source, on both targets. Before this,
  `@pyreon/validate` had no native story at all: a native app could not validate
  data, and the schema emitted verbatim.

  It reuses the existing Gap-4 schema pipeline (recognizer → IR → per-target
  emit) rather than adding a second one. The only structural difference from
  zod / valibot / arktype is that `s.object({ … })` arrives with no wrapper call —
  it already IS a Standard Schema — so the shared walker's `schemaFn` became
  nullable instead of being copied.

  Scope, stated plainly: the DECLARATION form lowers. Inline uses
  (`s.string().parse(x)`), the JIT, JSON-schema export and the v1/mini compat
  surfaces stay web, and still warn.

  The recognizer gates on the IMPORT, not the bare name: `zodSchema(...)` is a
  distinctive wrapper but a lone `s` is not, and claiming it would silently
  rewrite a user's own binding.

  ## Native router: implement the `query` it has always advertised

  `PyreonRouter`'s header has listed `query` (typed search params) since the C1
  scaffold on BOTH platforms, and neither implemented it. Worse than missing: a
  path carrying `?…` was handed to `matchPath` whole, so `/users/42?tab=a`
  captured `id == "42?tab=a"` and a static route stopped matching altogether.
  Every deep link with a query string — an OAuth callback, a shared link — hit
  that, on iOS and Android alike.

  Both routers now parse the query alongside `params`, in the same step, so the
  two always describe one navigation. New surface, identical on each side:
  `query`, `setQueryParam(key, value)` (replace semantics — changing a filter must
  not add a back-stack entry per keystroke), plus `splitPathAndQuery` /
  `parseQuery` / `serializeQuery`. `parseQuery` follows `URLSearchParams`: a bare
  key is present-with-empty-value, a repeated key keeps the last. `serializeQuery`
  sorts, so the rewritten URL is stable. The query survives an unmatched path — a
  404 page usually needs the parameters it was called with.

  ## `useUrlState` lowers to the native router's search parameters

  `const q = useUrlState('q', 'all')` now binds one search parameter on iOS and
  Android, from the same source: `q()` reads and `q.set(v)` writes, exactly as on
  the web. Built on the router `query` support above.

  The helper type is emitted INLINE rather than shipped as a co-located runtime,
  because it needs the ACTIVE router — a standalone runtime would have to import
  PyreonRouter and stop being self-contained. Same reasoning as `PyreonSchemaError`.

  Scope: string-valued keys with literal arguments. A non-string default declines
  WITH a reason rather than coercing silently, and a non-literal key declines
  because it cannot be baked into the emit — the conservative rule `useFetch`
  applies to its URL and `useStorage` to its key. History entries, `popstate`,
  `batchUrlUpdates` and the pluggable serializers stay web.

  ## `<Transition name>` resolves to a native transition instead of always fading

  The native `<Transition>` emit ignored `name` and animated every show/hide as a
  fade. An author who wrote a slide-up got a fade on device — and because an
  animation still played, nothing looked broken enough to investigate.

  `name` is the Vue-style prop `@pyreon/runtime-dom`'s Transition already honours
  on the web, and `@pyreon/kinetic` ships its presets under the same vocabulary,
  so it is the one shape an author writes once. `fade` · `scale-in` · `slide-up` ·
  `slide-down` · `slide-left` · `slide-right` now map to SwiftUI transitions and
  Compose enter/exit pairs respectively. An unknown name still falls back to a
  fade — a custom CSS animation has no native translation, and a fade beats
  refusing to compile — and a `<Transition>` with NO name emits byte-identically
  to before.

  `kinetic()` itself stays web: the chainable class/style factory has no native
  model. What crosses is the preset vocabulary.

  ## An unlowered package's diagnostic names ITS alternative

  `@pyreon/table` was told it "renders via the DOM / a browser-only library".
  TanStack Table is HEADLESS — that claim is simply false — and the message
  stopped short of naming the native answer this package's own manifest states.

  It now says the real thing: the row model (`getRowModel` / `getVisibleCells` /
  `flexRender`) is a WEB render surface with no native analogue, while sort and
  filter state is ordinary logic to hold in signals and render with
  `<For each={rows}>` + `@pyreon/primitives`.

  The hook arc now reads the same per-package advice, so this improves every
  package that has an entry (rx, validate, permissions, storage, http, table) —
  not just the one that surfaced it.

- Add `<Audio>` — sound playback on web, iOS and Android. (1612ed1)

  Mirrors `<Video>` in shape: same `src` dispatch (a bare name is a bundled
  asset), the same three-value `onStatusChange` vocabulary
  (`waiting`/`playing`/`paused`), and a declarative prop surface rather than a
  player-controller hook.

  **It is deliberately NON-VISUAL, which is the one place it does not mirror
  `<Video>`.** Audio has no view on the native targets — `AVAudioPlayer` and
  Media3 are objects, not views — so there is no `controls` prop. The web's
  browser-styled control bar has no cross-platform counterpart, and a prop that
  silently no-ops on two of three targets is the failure this API family
  refuses; `useScreenOrientation` omits `lock()` for exactly the same reason.
  Compose a transport from Pyreon primitives and drive it with these props.

  `volume` is **clamped** to 0..1 rather than rejected — on all three arms, and
  at emit time too, so `volume={1.7}` bakes as `1` and the generated native
  source is honest about what will actually play. An out-of-range value is a
  caller slip, and refusing to play is a worse answer than the nearest legal
  level.

  The native host is a concrete zero-size view rather than `EmptyView`: a
  modifier attached to `EmptyView` is silently inert, which is how a `<Modal>`
  sheet once shipped that never presented. The playback engine is injected on
  both targets, so the status machine and the clamp are testable with no
  AVFoundation, no Android SDK and no device.

  Adds `useAudioRecorder` alongside it — the input half of the same concept.
  `start()` resolves `false` on a denied microphone permission rather than
  throwing: that is the most likely outcome of the call and an ordinary branch
  in any UI that uses it, so callers get an `if` rather than a `try`, matching
  `useWakeLock.request()`. `stop()` resolves a URL — an object URL on the web,
  a file URL natively — because that is the one representation all three targets
  produce and every consumer can use; a zero-length capture resolves `null`
  rather than an empty URL that plays nothing. Disposal releases the microphone
  tracks, which is what turns the OS recording indicator off.

  And `useCamera` — take a photo through the SYSTEM capture UI on every target.
  It mirrors `useImagePicker` exactly, because the two differ only in which
  system flow they open: `capture()` resolves a URI or `null` and never
  rejects, since a cancel and an unavailable camera are the same outcome to a
  caller. The system UI owns the permission prompt, so there is no permission
  plumbing to get subtly different per platform.

  A CUSTOM in-app viewfinder is deliberately out of scope. An AVCaptureSession
  layer, a CameraX PreviewView and a `<video>` element are not one thing
  wearing three hats, and a surface that only half-crosses is worse than one
  that says what it covers — `useNativeModule` is the escape hatch there, as it
  is for Bluetooth GATT.

  Plus `useSpeech` and `useDeviceMotion`, the last two Tier-1 crossers.

  `useSpeech` CANCELS before each `speak()` — queueing is the platform default
  on all three, so without it a second press talks over the first instead of
  replacing it. Rate, pitch and voice are deliberately out of scope: the
  platforms disagree on ranges and on how voices are identified, so one name
  would mean three different things.

  `useDeviceMotion` has an explicit `start()` rather than listening on mount,
  because an always-on hook would be wrong on all three targets: iOS Safari
  gates the event behind a gesture-triggered prompt, and both native targets
  want start/stop so the sensor is not draining battery for a screen nobody is
  looking at. Where `requestPermission` does not exist (everything but iOS
  Safari) its ABSENCE is a grant, not a failure.

- Add `useSafeArea` and `useScreenOrientation` — the display-environment pair, (1025315)
  across web, iOS and Android.

  **`useSafeArea`** returns the insets content must avoid: notch / Dynamic
  Island, home indicator, gesture bar, rounded corners. This is the one device
  fact a multiplatform app cannot work around at the app level — without it,
  content draws under the notch, or every screen pads by a hard-coded guess that
  is wrong on the next device.

  It returns ONE accessor rather than four, because the values move together on
  rotation and separate accessors invite a torn read. On the web the numbers
  come from `env(safe-area-inset-*)` read off an inert probe element, since CSS
  environment variables are not exposed to script any other way; that needs
  `viewport-fit=cover` in the viewport meta, and reports zeros without it —
  which is correct (nothing is obscured) rather than broken. Natively they come
  from `safeAreaInsets` and `WindowInsets`.

  **`useScreenOrientation`** is deliberately read-only. Locking does not cross:
  `screen.orientation.lock()` is Chromium-only and fullscreen-gated on the web,
  and on iOS orientation is an app-level declaration
  (`supportedInterfaceOrientations`), not something a view can request. A
  `lock()` that silently no-ops on two of three targets is worse than a surface
  that states what it covers. `type` is normalised to `'portrait' | 'landscape'`
  — the part true everywhere — and the primary/secondary distinction the web
  exposes lives in `angle`, so nothing is lost.

  Both runtimes read THROUGH on every access rather than caching at
  construction: a rotation, fold or Stage Manager resize moves them while the
  app is live, and a captured value would silently describe the old display.
  Both native suites assert that by mutating the probe after construction.

- Lower `model().views().actions()` — `@pyreon/state-tree` was 1:1-inverted on native (8ab41a7)

  The source that compiled natively was the source that is wrong on web, and the
  canonical web source did not compile. Two halves, each independently broken.

  **The chain.** The web API is a builder — `model({ state }).views(f).actions(f)
.create()`. The recognizer matched only the bare `model({ state }).create()`,
  so every model with an action — that is, every model that can change — fell
  through to a verbatim emit:

  ```swift
  private let cart = model((state: __Obj0(count: 0)))
    .actions({ `self` in (__Obj1(increment: "")) }).create()
  ```

  `model` exists on neither target, and the action became a `String` field.
  Zero warnings on either target, so the failure surfaced as `cannot find 'model'
in scope` / `unresolved reference 'model'` inside generated code, naming
  nothing about what was unsupported. A model with no actions cannot mutate its
  own state, so the one shape that did lower was the shape a real model never has.

  **The read.** A model's state field is a signal, so the web read is
  `cart.total()`. That emitted `…shared.total()` — calling an `Int`. The only
  form that compiled was `cart.total`, which on web renders the accessor function
  rather than its value. The emit already lowered the _write_
  (`cart.total.set(1)` → `total = 1`): it knew the field was a signal when
  written and forgot when read.

  Views now emit as computed properties (Swift `var doubled: Int { total * 2 }`,
  Kotlin `val doubled get() = total * 2`), actions as methods, and member bodies
  address state through the factory's `self` the same way a component body
  addresses its props param. This mirrors `defineStore`, which had already solved
  every hard part — the model recognizer simply stopped at state.

  Two smaller fixes ride along, both consequences of the state seed having been
  stored as a raw literal plus a three-value type tag rather than the `TypeIR` /
  `ExprIR` the store uses: a fractional seed (`{ total: 2.5 }`) emitted
  `var total: Int = 2.5`, and an unsupported builder step now declines by name
  instead of falling through to the verbatim emit.

  Still deferred, and still declining loudly: `.asHook()`,
  `.create(initialOverride)`, the two-step `const M = model(...); M.create()`
  form, `getSnapshot` / `onPatch`, and nested field-models. The emitted model is
  a singleton, so multiple instances of one definition remain out of scope — the
  two-step form is the only way to reach them, and it declines.

  The web arm that measures the semantics the emit mirrors lives in
  `@pyreon/state-tree`'s `native-parity.test.ts`; the native specs compile
  through real `swiftc` and `kotlinc`.

- Add `useWakeLock` — keep the screen awake on web, iOS and Android from one call. (e506bcf)

  Lowers to `isIdleTimerDisabled` on iOS and `FLAG_KEEP_SCREEN_ON` on Android,
  with `PyreonWakeLock` runtimes co-located in `@pyreon/hooks`.

  The web arm carries a normalization the native ones do not need. A
  `WakeLockSentinel` is released by the browser whenever the document hides and
  is **not** reacquired, while the native flag survives backgrounding — so the
  same call would leave the screen sleeping on web and lit on native. The hook
  listens for the sentinel's `release` event and re-acquires on
  `visibilitychange` unless the caller explicitly released, which is what makes
  it 1:1 rather than merely mirrored.

  Also closes a gap in `check-native-cosource`: it failed on a _declared_ Kotlin
  runtime file that did not exist, but never on a file that exists and is
  declared nowhere — so such a file was silently never verified.
  `PyreonWebView.kt` had been in that state. The gate now requires every runtime
  `.kt` to sit in a service group or in a new `pyreon.native.kotlinSdkOnly` list
  (files importing the real Android SDK, which the device gate covers), so a
  deliberate omission and a forgotten one are no longer indistinguishable.

- PMTC: `useUrlState` lowers NUMBER and BOOLEAN defaults, not just strings (080752b)

  `useUrlState('page', 1)` previously warned and stayed web — only a string
  default lowered to the native router's query. Number and boolean defaults now
  lower on both targets, with a codec that mirrors the web's `inferSerializer`
  rather than deferring to each platform's own string→number initializer.

  That distinction is the substance of the change. The web decodes with `+raw`
  (JS `ToNumber`), whose grammar neither `Double(_:)` nor `toDoubleOrNull()`
  matches — `""` is `0` in JS and `nil`/`null` on both targets, `"0b101"` is `5`
  in JS and unparseable on both, `"inf"` is `NaN` in JS but infinity in Swift,
  and `"1.5f"` is `NaN` in JS but `1.5` in Kotlin. Since the inputs that expose
  those cases are exactly the ones this feature exists for — a pasted deep link —
  the emit reproduces the JS grammar itself, identically on both targets.
  Booleans decode by exact `'true'` match, as the web does, so `?open=1` is
  `false` on every platform.

  An integer default lowers to `Int` and a fractional one to `Double`, following
  the same `inferTypeFromInitial` rule every other PMTC lowering uses, so
  `` `Page ${page()}` `` renders "Page 1" rather than "Page 1.0". `set` mirrors
  JS `String(v)`, so a whole `Double` round-trips as `?zoom=1`, not `?zoom=1.0`.

  A file that binds only string parameters emits byte-identically to before —
  each helper is emitted only when a binding of that type exists.

  Still web, and still warned by name: array and object defaults (the web infers
  a comma-join and a `JSON.parse`, neither of which has a native type to decode
  into at this call site), non-literal defaults and keys, and the
  `clearOnDefault` / `debounce` / custom-serializer options.

- `useQuery` now lowers to native — `@pyreon/query`'s flagship hook emits SwiftUI + Compose (v1). (69b6ad5)

  PMTC compiles `useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` to the `PyreonQuery` runtime — the useFetch lowering plus the one thing a query library adds over a bare fetch: a **keyed cache with stale-while-revalidate**.

  - **Swift** → `@State private var q = PyreonQuery<T>(queryKey:, staleSeconds:)` + an `isStale`-guarded `.task` on the stable ZStack host (`begin → resolve|reject`). Reactive reads (`q.data`/`q.isPending`/`q.isFetching`/`q.error`) are bare `@Observable` properties.
  - **Kotlin** → `remember { PyreonQuery<T>(queryKey =, staleMillis =) }` + an `isStale`-guarded `LaunchedEffect(Unit)`. Reactive reads append `.value` (Compose `MutableState`).

  The `.task`/`LaunchedEffect` runs the fetch **only when the cache is stale**, so a fresh hit skips the network and serves the hydrated value — and a background refresh flips only `isFetching`, never `isPending`, so already-shown data never blanks. `useQuery` also participates in `<Suspense>`/`<ErrorBoundary>` and the `const { data, isPending } = useQuery(...)` destructure, exactly like `useFetch`.

  A `queryFn` whose inline `fetch(url, { method, headers, body })` carries a verb/headers/body routes through `PyreonHttp` (mirroring `useFetch`) — so POST/authenticated queries work; a bare `fetch(url)` stays the GET path.

  **v1 scope** (conservative, the same literal-only rule as `useFetch`): `queryKey` is an array of string/number literals (colon-joined into the cache key); `queryFn` is an inline `() => fetch('<url-literal>'[, { method, headers, body }])` whose URL + literal request fields are baked; `staleTime` is a number literal (ms). Anything else — a reactive `queryKey` (`['todo', id()]`), a `queryFn` function reference, a non-literal fetch URL, a non-literal method/body — **warns by name and bails**, so `useQuery` still reports as unsupported rather than mis-lowering a shape it cannot honour. Tracked follow-ups: reactive keys, `queryFn` references, mutations, infinite queries, cross-instance invalidation.

  Proven at R2 (emit) + R3 (typecheck): the emitted Swift **and** Kotlin typecheck against the `PyreonQuery` stubs on both real toolchains (`swiftc`/`kotlinc`). The runtime it targets ships in `@pyreon/native-runtime-{swift,kotlin}` (`PyreonQuery` — a separate PR); a device (Simulator/Emulator) proof arrives with an example app that emits `useQuery`.

- The web-only import warning now explains itself per package (687d0eb)

  Importing any web-only `@pyreon/*` package into shared source produced one
  identical sentence for all 29 of them — "render it behind a `<Web>` escape
  hatch". That set spans a linter, a `<head>` manager, a virtualization library
  and an animation engine, and the advice is wrong for most:

  - `@pyreon/lint` is dev-time tooling that never reaches a component.
  - `@pyreon/head` has no device analogue at all.
  - `@pyreon/virtual` has a BETTER native answer — native lists are lazy by
    construction, so `<For>` inside `<Scroll>` beats a WebView.
  - `@pyreon/kinetic`'s preset vocabulary genuinely DOES cross via
    `<Transition name>` (verified: it lowers to `.transition(.opacity)` on
    SwiftUI and `AnimatedVisibility(fadeIn/fadeOut)` on Compose), so the old
    advice steered users away from a working native path.

  The reason now comes from each package's manifest `rationale` — already
  required for web-only by `check-multiplatform-tier`, which generates this
  mapping, so it cannot drift from the docs tier table. The native-equivalent
  option is stated FIRST and the escape hatch second.

### Patch Changes

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- `@pyreon/feature` declares the native frontend it already had (5ff6d4a)

  `defineFeature({ name, schema })` with the literal field-type map has been
  lowering to a Codable struct plus a module-scope const (`name`,
  `initialValues`) on both targets — but the manifest still said the package had
  NO native emit, so the compiler's derived web-only set kept warning about it and
  the coverage registry counted it as an open gap.

  The declaration half now says what it does, and the runtime half (the generated
  CRUD hooks, the fetcher, validator/form integration) is scoped honestly as the
  part that stays web. A runtime schema (Zod / Valibot / ArkType) is still not
  introspected and warns by name.

  Native app-runtime coverage: 34/37 → 35/37.

- Correct `@pyreon/hotkeys`'s multiplatform rationale, which was factually wrong (8abff03)

  The manifest said _"touch platforms have no hardware-shortcut surface"_, and the
  native compiler quotes that rationale verbatim in the warning it prints when you
  import the package — so the claim was reaching users as guidance.

  It is false. Both targets expose a hardware-shortcut surface, and both the
  control-bound and view-level iOS shapes typecheck against the real iOS SDK:

  ```swift
  Button("s") {}.keyboardShortcut("s", modifiers: .command)   // iOS 14+
  Color.clear.onKeyPress(.init("s")) { .handled }             // iOS 17+
  ```

  Compose has `Modifier.onPreviewKeyEvent`. iPads with keyboards, Chromebooks,
  DeX and keyboard-equipped tablets all reach them.

  The rationale now says what is actually true: no lowering is implemented yet.
  That is an unbuilt lowering, not a platform limitation — a distinction that
  decides whether anyone attempts it.

  No emitted code changes.

- `useClipboard`'s reads were 1:1-inverted, and `text` was missing natively (39db4ce)

  Two findings, both in the same hook.

  **The reads.** On the web `copied` and `text` are accessors (`copied: () => boolean`), and the hook's own documented example is
  `{() => copied() ? 'Copied!' : 'Copy'}`. Natively they are stored properties, so that documented spelling failed with
  `cannot call value of non-function type 'Bool'` — while the spelling that DID compile natively (`c.copied`) renders the accessor function on the web. Reads now drop their parens on both targets; a real method (`copy(text)`) keeps its parens and arguments.

  This is the third instance of the class, after `model()`'s state fields and the one `useBluetooth` avoided by construction: **a hook whose web surface is accessors and whose native surface is fields needs a use-site rewrite, or the two spellings are mutually exclusive.**

  **The missing member.** `text` — "the last successfully copied text" — has been in the web hook since inception and existed on neither native runtime, so a component reading it compiled on the web and failed with `has no member 'text'`. Both runtimes now expose it, set on the successful-copy path.

  Found by taking each lowered hook's web-correct spelling and compiling it. Worth noting what that same sweep did NOT find: `useOnline` returns an accessor directly rather than an object, and `useCrashReporter` exposes getter-backed plain properties that already match — both were spellings I had guessed wrong, not bugs.

  ## The Swift stubs were narrower than the runtimes

  Sweeping every lowered hook's web-correct spelling through the compiler
  surfaced a second class: the **type gate was rejecting correct emits**,
  because several Swift stubs carried a fraction of their runtime's surface.

  - `PyreonShare` — stub had `url`; the runtime has `text` / `url` / `textUrl` / `canShare`
  - `PyreonHaptics` — stub had `impact`; the runtime has three
  - `PyreonNotifications` — stub had `notify`; the runtime also has `requestPermission`

  Every one of those members is reachable from the web hook, so a component
  using them compiled on the web and was refused here. This is the mirror of
  the documented superset-stub trap and just as costly: a stub NARROWER than
  reality fails working code.

  `useBiometrics.isAvailable` was the one real product gap in the sweep — it
  has been in the web hook since inception and existed on neither runtime.
  Swift now answers it with `canEvaluatePolicy` (honest: no sensor or no
  enrolment reports false); Kotlin returns `false` alongside its v1
  `authenticate` scaffold, because a hardcoded `true` would send a caller down
  a path that cannot authenticate.

  A new suite compiles the web-correct spelling of each lowered hook's surface,
  so this class cannot recur silently.

- Reset the emitters' hook-binding-name sets per file (cb67b5f)

  Both emitters keep module-level `Set`s of hook binding names (`_motionSwift`,
  `_speechKotlin` and seven siblings each) so a read like `m.active()` knows to
  drop its parens. A pre-pass fills them by walking every component at once, so
  they are file-scoped — but nothing ever reset them, and they grew for the life
  of the process.

  That is a leak Class C, and it is what took `audit-leak-classes` from 44
  findings to 51 against its ceiling of 40. Clearing them at each emitter's
  entry brings the audit to 37.

  This is hygiene, not a bug fix: no input was found where the stale names
  changed the emitted output.

- feat(native): lower CSS `letter-spacing` to native (SwiftUI `.tracking` / Compose `letterSpacing`) (3d22293)

  Extends the CSS-in-JS → native style mapping with `letterSpacing`, which round-trips exactly 1:1: it is an absolute per-character spacing on both targets (unlike `line-height`, a unitless multiplier on web), so `<Text style={{ letterSpacing: 0.5 }}>` lowers to SwiftUI `.tracking(0.5)` and Compose `letterSpacing = 0.5.sp`. Wired through the typography path with faithful stub entries (`View.tracking`, `Text(letterSpacing=)`) so the validate-against-stubs gate compiles it.

- Native `.*` granted more than the web did (4be7791)

  `PyreonPermissions.can()` resolved a `"prefix.*"` grant with a bare prefix
  match on both platforms, so granting `"posts.*"` also granted
  `"posts.comments.edit"` — a key the web **denies**. A permission check that
  grants more on device than in the browser, from the same source, is the wrong
  direction to be wrong in. Neither runtime recognised `.**` or `*` at all, so
  the two wildcards that _should_ widen a grant were silently ignored.

  The two native runtimes agreed with each other and disagreed with the web:
  both were written from one belief about what `.*` means. `can()` now resolves
  in the web's order — exact, then one-segment `.*`, then recursive `.**`
  most-specific-ancestor-first, then global `*`.

  Measured three ways rather than mirrored: the web resolver via
  `native-parity.test.ts`, and both runtimes compiled and **run** against the
  same nine cases.

  ## The call site was inverted too

  Web `usePermissions()` takes no arguments — the grants come from
  `<PermissionsProvider>`, which has no native lowering. So the correct web call
  emitted an empty native set in which every check denies, silently: guarded
  views simply never appeared on device. The only way to get a non-empty native
  set is `usePermissions([...])`, a call the web API rejects.

  Seeding the provider natively is a larger arc. What changes here is the
  silence — the empty-set case now says so and names the shape that works, and
  the provider's own advice no longer tells an author already holding the hook
  to "use the hook instead", which changed nothing.

  Still web-only: predicate permissions (`(context) => boolean`) and explicit
  `false` values, both of which need a value-carrying granted set rather than
  the current `Set<String>`. The web arm pins them so the gap is visible.

  ## `<PermissionsProvider>` now lowers

  Web `usePermissions()` takes no arguments — the grants come from the provider
  above it, which had no native lowering. A literal
  `<PermissionsProvider permissions={{ 'posts.*': true }}>` now injects them
  into the SwiftUI environment / Compose `CompositionLocal` that a bare
  `usePermissions()` reads, so the web-correct call works unchanged instead of
  denying everything.

  The plumbing is emitted INLINE rather than shipped in the co-located runtime,
  for the reason `PyreonUrlState` already is: it needs SwiftUI's environment
  machinery / Compose's CompositionLocal, and a runtime that pulls those in
  stops being self-contained (and stops verifying against the compile gate's
  stub set).

  A NON-literal map (`permissions={fromServer}`) cannot be baked into the emit
  and declines from the emitter, which is the only layer that knows whether the
  injection happened — the blanket import warning is suppressed once the tag is
  present, so without this a provider that injects nothing would have gone
  silent.

  One more silent drop fixed on the way: an object literal with a STRING key
  (`{ 'posts.*': true }` — ordinary TS) was dropped by the parser with no field
  and no warning, unlike the computed-key case beside it which warns. String
  keys are now preserved.

- Add the `repository` field npm provenance requires. All six packages were (2b5be05)
  rejected from the 0.51.0 release with a 422 (`"repository.url" is "",
expected to match "https://github.com/pyreon/pyreon"`) — `--provenance`
  publishing validates the field against the OIDC attestation, so its absence
  is a publish blocker, not cosmetic metadata.
- Native schema validation accepted data the web rejects (b1f9914)

  Two constraints resolved differently on device, both in the ACCEPTING
  direction — the wrong way for a validator to be wrong.

  **`.regex()` was silently dropped.** The constraint walker recognised
  min/max/email/url/uuid and had no `regex` arm, so the modifier fell through
  its `else if` chain: the field emitted with only a type guard, no check and
  no diagnostic. A schema that rejects `"Not A Slug!"` on the web accepted it
  on device.

  **`.url()` parsed instead of validating.** `URL(string:)` and
  `java.net.URI(...)` are permissive parsers; measured against zod, four of six
  cases diverged and every one of them accepted something the web denies —
  `"not a url"`, `"x.com"` and `"/relative"` all passed. Requiring a scheme
  reproduces zod's rule (an absolute URL) while still accepting `mailto:` and
  `ftp://` as zod does. All six now agree.

  The regex arm is deliberately conservative. JS, NSRegularExpression and
  java.util.regex agree on the common syntax — anchors, classes, quantifiers,
  groups, alternation — and diverge on the rest, so a pattern carrying a
  non-portable flag (anything but `i`), lookbehind, a named group or a Unicode
  property escape declines BY NAME. A declined field is no worse off than it
  was; it is just no longer silent. Both targets test for a partial match,
  which is what `RegExp.test()` does on the web.

  **The diagnostic contradicted the emit.** `zodSchema` warned "has NO native
  lowering … the native build fails with `cannot find 'zodSchema' in scope`",
  printed directly above the native struct it was denying, with advice sending
  the author to a `<Web>` escape hatch for code that works. A top-level
  `zodSchema(...)` / `valibotSchema(...)` / `arktypeSchema(...)` declaration
  now suppresses it, decided in the same syntactic pre-scan `@pyreon/validate`
  already uses because the warn pass runs before schemas are recognised. An
  import with no such declaration still warns.

  Measured against zod rather than mirrored between the two targets: the web
  arm is `@pyreon/validation`'s `native-parity.test.ts`, and the emitted
  Swift and Kotlin both compile on the real toolchains.

- PMTC: stop telling authors `withField` has no native lowering — it does (2d7a108)

  Importing `withField` from `@pyreon/validate` printed:

  > `withField` (from `@pyreon/validate`) has NO native lowering — it is
  > reproduced verbatim in the emitted Swift/Kotlin, where no such symbol
  > exists, so the native build fails with "cannot find 'withField' in scope".

  directly above the `PyreonFieldMeta_*` struct the same compile had just
  emitted. A top-level `const X = withField(schema, { label: '…' })` has lowered
  since the Tier-2 validate emit landed, and `tier2-validate-emit.test.ts` locks
  that struct on both targets — but `withField` was never added to the
  suppression list its siblings (`s`, the `@pyreon/validation` adapters,
  `PermissionsProvider`) are all on.

  So the diagnostic told authors a working API was unusable and pointed them at a
  `<Web>` escape hatch they did not need. That is the same stale-blanket-warning
  class as the `@pyreon/toast` entry, and the direction
  `native-audit-warnings.test.ts` already calls out as the more damaging one.

  The suppression is conditional, not a blanket exemption. When nothing lowers —
  a non-literal meta object, a meta object with no string-valued entries, or an
  import with no top-level declaration at all — the warning is accurate and still
  fires. And when one declaration lowers while a sibling does not, the blanket
  line is suppressed but the precise per-declaration diagnostic (naming the
  binding and the reason) still fires, so nothing is silently dropped.

  `warnUnloweredPyreonModules` runs before the top-level recognizer, so the
  decision comes from a syntactic pre-pass. To keep the two from drifting apart,
  the recognizer's structural match and its meta extraction are now shared
  helpers that both callers use, rather than a hand-copied predicate.

- Fix three ways the native type gate rejected correct code. (88fe476)

  **The permissions stub was the wrong kind.** `PyreonPermissions` is an
  `@Observable final class` at runtime but a `struct` in the validation stub.
  That is not cosmetic: the emit binds it through `@Environment` (read-only), so
  a struct cannot typecheck the mutators at all. It was also missing five
  members (`can` / `cannot` / `set` / `grant` / `revoke`) and the `granted`
  property, so `perms.grant("post.edit")` failed with _value of type
  'PyreonPermissions' has no member 'grant'_.

  **`perms.set(...)` emitted an assignment.** The `signal.set(v)` → `signal = v`
  lowering fired on any `.set(` with an identifier receiver unless the name sat
  in a hand-maintained exclusion list — a silent-hole generator: every binding
  whose `set` is a _real_ method has to be remembered, and a forgotten one emits
  `x = v` against a non-assignable receiver. Three had to be remembered
  (`useUrlState`, `syncedSignal`, and now `usePermissions`, found only because a
  stub-parity sweep happened to compile the call). Identifier receivers are now
  deny-by-default, keyed on the tracked signal/computed declarations, so the next
  one is correct without anyone noticing it exists. Member-expression receivers
  (`store.field.set(v)`) keep their previous behaviour.

  **`PyreonSyncedSignal.dispose` was missing from both stubs**, so a correct
  `s.dispose()` was rejected. This had left the stub/runtime parity gate red on
  `main`; it is fixed by mirroring the runtime rather than widening the ratchet,
  which is now six entries shorter.

  **`PyreonMachine` was the same class of defect, on iOS only.** It is an
  `@Observable final class` at runtime but a `struct` in the Swift stub, missing
  `can` / `nextEvents` / the `state` property / `transitions`. The Kotlin stub
  was already complete — so `m.can("GO")`, a documented member of the web
  `Machine` interface that `createMachine` lowers to this type, compiled on
  Android and failed on iOS from the same source. Mirroring the Swift stub takes
  the ratchet four entries lower.

  **The gate I added last week had the same blind spot it exists to catch.** It
  asked whether a runtime member was missing from the stub, but never whether a
  `KNOWN_NARROW` entry was _still_ narrow. A stale entry is not noise — it is a
  permanent hole, because it keeps excusing that member if someone later removes
  it from the stub. Fifteen were stale. The list is now **per-target**: sharing
  one set across Swift and Kotlin meant an entry could be stale on one and
  genuinely narrow on the other, which is precisely why nothing could tell them
  apart.

- Close the stub-narrower-than-runtime class with a derived gate (62417b9)

  A stub NARROWER than the runtime it mirrors rejects **correct** code. That is
  worse than a missed bug: it reports a failure that does not exist and sends
  an author to "fix" working code.

  It was found four separate times in one session — `PyreonShare` (stub had
  `url`; the runtime has four members), `PyreonHaptics` (one of three),
  `PyreonNotifications` (missing `requestPermission`), and the un-keyed `task`
  overload — each caught only because someone happened to compile a snippet
  that used the missing member. The documented trap is the SUPERSET stub, which
  masks breakage; this is the mirror image, and the two need opposite checks.

  The gate is **derived**, not a list: it reads every co-located and monolith
  runtime, and for every type the stubs already declare, asserts the stub
  carries each public member the runtime does. A member added to a runtime is
  covered the day it lands, with no test edit — the hand-written alternative is
  the shape this repo calls a silent-hole generator.

  Deliberately out of scope: types the stubs do not declare at all (a runtime
  with no stub may simply be unreachable from any emit, and requiring one would
  teach people to add empty stubs), and signatures (comparing parameter lists
  across two languages needs a real parser each; NAMES catch the whole observed
  class).

  The 53 existing gaps are recorded in a ratchet that may only shrink, rather
  than fixed in one pass — a stub with a WRONG signature masks breakage, which
  is the worse direction, so hand-writing 53 signatures blind would have traded
  a small problem for a larger one. Roughly half are platform delegate
  callbacks the emit never calls; the rest (`perms.grant(...)`,
  `machine.can(...)`, `i18n.locale`) are real refusals an author can hit today,
  and are now visible instead of latent.

  Bisect-verified: removing `canShare` from the Swift stub fails the gate
  naming exactly `PyreonShare.canShare`; restoring it passes.

- Ship `<Transition>` / `<TransitionGroup>` from `@pyreon/primitives` — the animation vocabulary now has an import path that resolves on every target (5a83e86)

  PMTC has lowered `<Transition>` and `<TransitionGroup>` to real platform
  animation since M2.7/M2.8 — SwiftUI `.transition(…)` + `.animation(_:value:)`,
  Compose `AnimatedVisibility(enter =, exit =)` — with preset mapping, asymmetric
  enter/leave timing and device proof. But `@pyreon/primitives` exported neither
  name, and the only runtime export lived in `@pyreon/runtime-dom`, which the
  compiler correctly flags web-only. So the one import that worked on web warned
  on native, and the import native accepted did not exist: a fully built
  capability with no reachable door.

  `@pyreon/primitives` now exports both, with a self-contained web
  implementation built on `h()` + `renderEffect` alone (no `@pyreon/runtime-dom`
  dependency — the package keeps its two peer deps, which is what lets it be the
  multiplatform vocabulary).

  The prop contract mirrors the native emitters exactly: `show`, `name`
  (`fade` / `scale-in` / `slide-up|down|left|right`, camelCase and kebab-case
  both accepted), `duration`, `easing`, and the asymmetric
  `enterDuration` / `leaveDuration` / `enterEasing` / `leaveEasing` overrides that
  fall back to the symmetric value. Direction is the direction of travel, so a
  slide-up rises into place from below — matching `.move(edge: .bottom)` and
  `slideInVertically { it }`.

  On web the hidden state is `display:none` on the wrapper rather than an unmount,
  so an animation wrapper never gates its children out of SSR and a hidden
  `<Transition>` contributes no flex `gap`. Only transition LONGHANDS are ever
  assigned, so a consumer's own `transition-delay` survives.

  The native emit is unchanged and asserted byte-identical to the bare-tag form.
  The web-only warnings for `@pyreon/kinetic` and `@pyreon/runtime-dom` now name
  `@pyreon/primitives` as the import that actually crosses, instead of naming a
  tag whose only import was broken.

## 0.51.0

### Minor Changes

- `useFieldArray` lowers to native on both targets — dynamic form lists with (9590027)
  stable keys, device-proven.

  - **Runtimes**: `PyreonFieldArray` (Swift `@Observable` / Kotlin
    `SnapshotStateList`) mirrors the web `@pyreon/form` surface one-for-one:
    `items` (keyed rows), `length`, `append`, `prepend`, `insert`, `remove`,
    `update`, `move`, `swap`, `replace`, `values`. Keys are monotone and never
    reused — a removal never re-keys survivors (row identity/focus survives),
    `replace` always re-keys. Byte-aligned contract suites on both platforms.
  - **Compiler**: `useFieldArray(['a'])` lowers on both targets (String-
    specialized v1 — the PMTC form vocabulary is String-typed; initial must be
    an array literal, the useWebSocket literal rule). The load-bearing seam is
    the ACCESSOR UNWRAP: on web `tags.items()` / `tags.length()` /
    `item.value()` are signal calls, natively they are properties — the emit
    strips the parens (For-item params tracked through
    `<For each={tags.items()} by={i => i.key}>`, which lowers to
    `ForEach(tags.items, id: \.key)` / `items(tags.items, key = { it.key })`),
    and the validate stubs mirror the property shape so a paren-keeping emit
    fails both toolchain gates by construction. `move` emits with Swift labels
    (`move(from:to:)`).

  Device-proven in router-demo on both platforms (add renders the row,
  remove-first drops exactly row 0 with the survivor still rendered, count
  tracks length) and bisect-verified by no-oping the runtime `remove()` on
  both.

- `useSecureStorage` is real on all three targets — the encrypted secret store (9590027)
  (iOS Keychain / Android Keystore AES-GCM / web in-memory), device-proven.

  The sub-capability was three-quarters missing: the PMTC emit was a warn-drop
  ("deferred v1"), the Kotlin runtime shipped no real backend (in-memory only,
  behind an app-injection requirement the compiler could not satisfy), and the
  web half did not exist, so the shared import resolved on neither web app.

  - **`@pyreon/native-runtime-kotlin`**: `KeystoreSecureBackend(context)` —
    AndroidKeyStore AES-256-GCM over app-private SharedPreferences (no new
    gradle dependency; androidx security-crypto is deprecated and wrapped
    exactly this surface) + a `PyreonSecureStorage(context)` factory, the
    `PyreonDatabase(context)` shape. Fail-closed reads (tampered/undecryptable
    → null).
  - **`@pyreon/native-runtime-swift` + `-kotlin` (BREAKING, pre-1.0)**:
    `write` is now KEY-FIRST — `write(key:value:)` / `write(key, value)`. The
    old `write(value, key)` order was a live hazard: both parameters are
    String, so a positional lowering of the natural TS call
    `sec.write('auth', token)` would have compiled with the arguments crossed
    and stored the secret under the wrong key.
  - **`@pyreon/native-compiler`**: `useSecureStorage()` lowers on both targets
    (Swift `PyreonSecureStorage()` Keychain default; Kotlin Context-threaded
    Keystore default); method calls emit with Swift labels
    (`write(key:value:)`), making a crossed positional call uncompilable.
    Validate stubs mirror the real key-first surface on both toolchains.
  - **`@pyreon/hooks`**: the web `useSecureStorage()` — a module-scoped
    in-memory store (the web has no OS secret store; persisting secrets to
    localStorage would be the exact bug the hook prevents), same key-first
    surface.

  Device-proven in router-demo and bisect-verified on both platforms by
  swapping the defaults to the in-memory backend: iOS's secret survives a
  genuine terminate+relaunch only with the real Keychain; Android's cold
  `PyreonSecureStorage(context)` decrypts the UI's write and the raw prefs
  value is asserted to be ciphertext, not plaintext (encryption at rest).

- `<Transition>` gains configurable `duration` (ms, static literal) + `easing` (9154c8a)
  (`linear | ease-in | ease-out | ease-in-out`) on both native targets:
  `.animation(.linear(duration: 2.5), value:)` on SwiftUI,
  `AnimatedVisibility(enter/exit = fadeIn/fadeOut(tween(ms, easing)))` on
  Compose, with the CSS easings mapped to the canonical curves. Absent props
  emit byte-identically to the previous default shape (spec-locked); a
  non-literal duration warns + falls back. The CLI's conditional-import table
  learns the animation sub-package symbols (fadeIn/fadeOut/tween/easings) —
  the stub-masked-symbol class, caught by the real gradle build.

### Patch Changes

- `useAppState()` now observes the real app lifecycle with zero wiring — the third member of the never-wired class. Swift: the emit calls `PyreonAppState.start()` from `.onAppear` on the stable host (the UIApplication notification observers existed from inception; nothing called them). Kotlin: `rememberPyreonAppState()` installs a `LifecycleEventObserver` on the hosting Activity for the composable's lifetime (ON_RESUME/ON_PAUSE/ON_STOP → active/inactive/background). Both containers gain a sticky `wasBackgrounded` flag — the device-assertable end-state a frozen container can never reach. (a8c9fab)
- Add asymmetric enter/leave transition timing, and give the numeric timing vocabulary a web implementation it never had. (b315e7a)

  `<Transition>` gains `enterDuration` / `leaveDuration` (and `enterEasing` / `leaveEasing`), each falling back to the symmetric `duration` / `easing`. "Quick in, slow out" is the common real shape and had no expression on any target before this.

  - **Web (`@pyreon/kinetic`)**: `duration` / `easing` were never typed at all, so the numeric timing both native targets had honoured since the config arc was silently ignored in a browser — one shared source animating over 2.5s on a phone and over the CSS default on the web. `TransitionProps` now carries the timing vocabulary and synthesizes the CSS shorthand from it; an explicit `enterTransition` / `leaveTransition` still wins, so nothing that already worked changes.
  - **Swift**: lowers to `.transition(.asymmetric(insertion:removal:))` with a per-side `AnyTransition.animation(_:)`. The symmetric shape is untouched, byte for byte.
  - **Compose**: separate `fadeIn` / `fadeOut` tween specs.

  Also brings the Swift `AnyTransition` validation stub up to the real SwiftUI surface (`asymmetric` and the per-side `animation(_:)` were missing), which failed an emit the real SDK accepts.

- Fix three emit bugs that made the natural session-rehydration and form-submit shapes uncompilable on both native targets. (66b1a18)

  - **Service method returns are now typed.** `SERVICE_OPTIONAL_FIELDS` typed member reads on the service containers but nothing typed their METHOD returns, so `const token = secrets.read('k')` inferred as unknown and the optional-condition lowering never fired: `if (token)` emitted a bare optional as the condition, which swiftc rejects ("optional type 'String?' cannot be used as a boolean") and kotlinc rejects ("condition type mismatch"). A new `SERVICE_METHOD_RETURNS` table types `secureStorage.read` as `string | null`.
  - **Swift lowers a bare-identifier optional condition to the `if let` BINDING**, not just a nil-test. `if token != nil` leaves the then-body reading `String?` where `String` is expected, so the rehydrate shape `if (token) { auth.signInSucceeded({ name: token }) }` still failed on the argument. The then-body now emits with the local narrowed to its unwrapped type. Kotlin needs no twin — it smart-casts a val local by language rule — but its emitter narrows the same way so type-dependent emits agree.
  - **`onSubmit: (values) => values.username` now lowers to the dictionary lookup.** `PyreonForm` hands the callback a string-keyed map, and the identical rewrite already existed for `form.values().username`; the submit parameter was missing it, so the member access passed through verbatim and compiled on neither target. Hidden because every gated app named the parameter `_values` and never read a field off it.

  Also brings the Swift `PyreonForm` validation stub up to the real runtime's surface (`values`, `touched`, `setFieldValue`, `validateField`, `validateAll`, `isValid`, `reset` were missing), which was failing form shapes the real toolchain accepts — the subset-stub-manufactures-failures half of the stub-fidelity rule.

- Fix two Compose layout bugs in the `@pyreon/coolgrid` `<Col>` lowering, both found by measuring real geometry on a device. (55cca94)

  - **A column span now lowers to RowScope `Modifier.weight(size)`, not `fillMaxWidth(size/12f)`.** A Compose `Row` measures each child against the REMAINING width, so fractional fills compound: a 3/12 column followed by a 9/12 column laid out as 25% + 56%, and the row never added up. `weight(3f)` + `weight(9f)` divides the row exactly — which is what a twelve-column grid means, and what the Swift twin's `containerRelativeFrame(count:span:)` did all along.
  - **A `<Col>`'s `data-testid` now rides the SIZED node.** It was landing on the inner stack while the width lived on the wrapper `Box`, so the tagged node hugged its glyph — a 3/12 column measured 7.2dp of a 308dp row — and the column's real geometry was unaddressable, hence unassertable. Same class as the earlier `<Link>` identifier drop. Swift never had the split; it puts the identifier and the span on one node.

  Both were invisible to the emit tests, which asserted the old `fillMaxWidth` string and passed throughout — a compile-level assertion can only confirm that the code agrees with itself. The emit tests are updated to the corrected truth and a new one locks the identifier onto the weighted node (exactly once, so `onNodeWithTag` stays unambiguous).

- Fix two PMTC emit bugs that made `<Modal>` non-functional and `<Link>` (f9b8abc)
  unassertable on iOS, and close the capability matrix's Core-UI row.

  Both bugs emitted **valid Swift that `swiftc -typecheck`ed clean**, which is
  exactly the class R1-R3 cannot see. They were found by the established method —
  write the code an author would actually write, then run it on a device.

  **`<Modal>` never presented on iOS.** The emit anchored `.sheet(isPresented:)`
  to an `EmptyView()` host. `EmptyView` contributes nothing to the render tree, so
  there is no view for SwiftUI to attach the presentation to and the modifier is
  silently inert. An XCUITest accessibility dump after tapping the open button
  showed no sheet, no dialog and no modal body anywhere in the hierarchy. Now
  anchored to a zero-sized `Color.clear`, which is a real view and therefore a
  valid presentation anchor, with `.frame(width: 0, height: 0)` keeping it
  layout-neutral so no surrounding stack shifts.

  This was iOS-only. Compose reaches `<Modal>` by a different mechanism —
  `if (open) { Dialog(onDismissRequest = …) { … } }`, a conditionally-composed
  real node with no anchoring requirement — so the Kotlin emit was already correct
  and is unchanged. Same family as the documented `<Inline>` asymmetry (a
  shrinking SwiftUI HStack vs a non-wrapping Compose Row): when the two targets
  reach a primitive through different mechanisms, only a per-target device check
  settles it.

  **`<Link>` dropped its `data-testid`.** `<Link>` is a special-case emitter that
  builds `PyreonLink(...) { ... }` and returns BEFORE the generic modifier tail
  where `data-testid` becomes `.accessibilityIdentifier` / `Modifier.testTag`. The
  identifier was silently discarded, so the element could not be selected by
  XCUITest or `onNodeWithTag` at all — it was structurally _unassertable_, which is
  the likeliest reason it sat in the matrix's "not individually asserted" list. You
  cannot assert on an element you cannot select. Fixed on both backends; Swift also
  emits `.accessibilityElement(children: .contain)` because `PyreonLink` wraps its
  label and SwiftUI flattens a plain wrapper out of the accessibility tree (the
  same trap already documented for `VStack`/`ScrollView`). `.contain` rather than
  `.combine` keeps the child label individually queryable. A Link with no
  `data-testid` emits byte-identically to before.

  **Core-UI row closed (0.8 → 0.95, +1.5 weighted points, ≈52% → ≈54%).** The four
  primitives the row itself named as gaps — Modal/Toggle/Scroll/Link — are now
  device-asserted on a real simulator: Toggle flips an observable text, Modal
  presents and dismisses a sheet body, Scroll's container is queryable with its
  child still individually queryable, and Link navigates through `PyreonLink`. The
  row keeps 0.05 rather than claiming 1.0: `Layer`/`Spacer`/`Heading` have no
  dedicated behavioural assertion, and the four new assertions are iOS-only (the
  Compose halves emit and typecheck; the Android device assertions are follow-ups).

  Bisect-verified at the device layer, both fixes, with restore: reverting the
  Modal host to `EmptyView()` failed `test_modalPresentsAndDismisses`; reverting
  the Link identifier emit failed `test_linkNavigatesToAbout`; restored, both pass.
  Full suites green — counter-ios 22 tests / 0 failures, router-demo-ios 4 / 0.

- The flagship device-proven example used native-only idioms and a wrong import. (fc58ea0)

  `examples/native-counter-ios/src/Counter.tsx` — the kitchen-sink example with 19
  passing XCUITests — does not typecheck. Measured: 40 TypeScript errors. It
  compiles for native anyway because PMTC matches component and hook NAMES and
  never resolves imports, and this example is one of four with no typechecked web
  sibling, so nothing caught any of it.

  Four independent problems, all fixed here:

  - `onMount` was imported from `@pyreon/reactivity`, which does not export it;
    it lives in `@pyreon/core`. A second wrong import in the same file, the
    sibling of the `useDatabase`-from-`@pyreon/primitives` one.
  - `Button`, `Stack`, `Inline` and `Press` were used but never imported —
    33 of the 40 errors.
  - `<VStack>` is a SwiftUI name, not one of the 15 canonical primitives. It
    lowers correctly (`VStack` on Swift, `Column` on Kotlin) but has no web
    equivalent and is exported from nowhere, so its presence made the file
    native-only by construction.
  - `onClick` is not the canonical prop; the primitives take `onPress`.
    `ButtonProps` rejects `onClick` outright.

  SAFE BY PROOF, not by inspection: the emitted Swift and Kotlin are BYTE-IDENTICAL
  before and after, verified per target. Identical bytes cannot behave differently
  on a device, so the 19 XCUITests cannot regress — and the full device suite was
  run to confirm rather than assumed.

  This takes the file from 40 errors to 8, as measured when the change was
  written. NOTE the before-count has since shifted: main added a geolocation
  `Locate` button (#2570) that also used `onClick`, which this change converts
  too, so the exact starting number is now higher by at least one. The RESIDUAL is
  what matters and it is enumerated below; it was not re-measured after the
  rebase, and the number above is left as originally measured rather than silently
  updated to a guess.

  The remainder are NOT example bugs and are deliberately left:

  - `rocketstyle({ component })` is missing the required `name` (2).
  - `<Press onLongPress>` without `onPress`, which `PressProps` requires (1) —
    arguably too strict for a long-press-only target, but that is an API
    decision, not an example fix.
  - A reactive accessor among MULTIPLE children (5). That one is a framework
    type asymmetry, not this file's fault: the JSX runtime types children as
    `VNodeChild | VNodeChild[]`, while the primitives' `ChildrenProp` is bare
    `VNodeChild`, whose array arm is `VNodeChildAtom[]` — atoms only. So an
    accessor is legal as a SOLE child and rejected among multiple, making
    `<Text>Count: {count}</Text>` fail on the canonical primitives while the
    identical shape on a `<div>` compiles. Widening `ChildrenProp` to match the
    runtime was tried and REVERTED: it breaks 11 internal `h()` call sites in
    the primitives' own web implementations, so the narrow type is load-bearing
    there and this needs a considered change rather than a one-line widening.

  The example is not yet typecheck-clean, and this change does not add a typecheck
  script claiming it is. Giving `counter` / `finance` / `analytics` / `viz`
  typechecked web siblings remains the gate that would have caught all of this at
  author time.

- Maps/geolocation reaches a BEHAVIORAL R4 on iOS — the matrix row's first non-zero score. (84f1d67)

  The row read "R2 runtimes; no device test", which understated it: a device test
  alone could never have raised it. Three defects were stacked underneath, each
  found only by writing the code an author would actually write.

  1. No web half at all — `import { useGeolocation } from '@pyreon/hooks'` did
     not resolve, so the hook was native-only in practice (#2567).
  2. `geo.start()` did not build on Android — Swift's is 0-arg, Kotlin's took a
     host closure. `native-counter-android` compiles the SAME `Counter.tsx`, so
     geolocation could not be added to the shared counter at all (#2569).
  3. An interpolated `Double?` rendered `Optional(37.3349)` instead of the
     value (#2566).

  Only the third would have been visible from the test. The first two would have
  made writing it impossible.

  The assertion is behavioral, not does-not-crash: it reads the RENDERED
  coordinate, which requires the whole chain to have executed on-device — tap →
  real CLLocationManager watch → CoreLocation fix → @Observable update → SwiftUI
  re-render. That is a stronger claim than the biometric gate's denied-path proof,
  which only shows an async handler completing.

  Deterministic via `simctl privacy … grant location` + `simctl location … set`,
  so there is no permission dialog and no waiting on real GPS.

  BISECT-VERIFIED at the device level, which matters because a green UI test is
  exactly the kind of signal that passes for the wrong reason: injecting London
  (51.5074) makes it FAIL after polling 25s; restoring 37.3349 makes it pass. It
  genuinely reads the injected fix.

  It also PINS the optional-render fix — the assertion is an exact prefix, so a
  regression to `Optional(…)` fails it, and the failure message distinguishes that
  case from "the watch never delivered a fix".

  One gotcha worth recording: `NSLocationWhenInUseUsageDescription` had to go in
  `project.yml`, not `ios/Info.plist`. xcodegen's default merge STRIPS fields it
  does not know about, so a plist edit is erased on the next generate — and iOS
  refuses the authorization request SILENTLY without it (no prompt, no error, a
  watch that never fires).

  Full device suite 19/19 (the pre-existing 18 undisturbed).

- `geo.start()` compiled on iOS and web and failed to build on Android. (ed5eff8)

  Swift's `PyreonGeolocation.start()` is 0-arg. Kotlin's only overload took a host
  closure — `start(register: (GeolocationHandlers) -> (() -> Unit))` — because
  taking a real location source would drag the Android SDK into a file that must
  stay stub-verifiable. So the SAME source built for two targets and not the
  third, silently, with no warning: the documented "OkHttp-for-WebSocket
  asymmetry".

  That was not academic. `native-counter-android` compiles the SAME `Counter.tsx`
  as `native-counter-ios`, so geolocation could not be added to the shared counter
  example at all — which is why the maps/geolocation matrix row could not be
  raised by a device test even with the runtimes present and the harness working.

  Closed with the seam this runtime already uses twice: a registry plus an
  `installDefault…` guard that only fills an EMPTY slot, mirroring
  `PyreonStorageRegistry` / `installDefaultStorageBackend`. An app that chose its
  own source in `Application.onCreate` is never overwritten.

  The Android-SDK half lives in its own file (`PyreonGeolocationAndroid.kt`).
  That is a gate decision, not a style one: `run-kotlin-tests.ts` EXECUTES only
  modules importing no `android.*` / `androidx.*` / `kotlinx.*`, so folding it
  into the core would silently drop the whole class out of the executing test set
  — the same split already used by `PyreonDatabaseAndroid` and
  `PyreonStorageAndroid`.

  With no source installed, the 0-arg `start()` fails LOUDLY through the same
  error channel a denial takes. A silent no-op would leave `latitude` null forever
  — indistinguishable from "no fix yet", the harder bug to diagnose — so the error
  names the wiring call instead.

  Uses the platform `LocationManager` rather than Play Services'
  `FusedLocationProviderClient`: fused lives in a separate Google dependency this
  runtime does not take, and taking it would force it on every consumer. An app
  wanting fused assigns `PyreonGeolocationRegistry.source` with its own
  implementation — which is what the seam is for. `applicationContext` is used
  internally so a rotated-away Activity is never retained by a running watch, and
  `hasAccuracy()` guards the platform's 0.0 sentinel rather than reporting it as a
  real 0-metre fix.

  The kotlinc stub now mirrors BOTH overloads. Mirroring only the 0-arg one would
  be a SUBSET stub, which manufactures failures for the closure form exactly as an
  over-strict `PyreonPermissions` stub rejected correct code.

  Bisect-verified: reverting the stub reproduces `unresolved reference 'start'` —
  the literal Android build failure. Full compiler suite 245 files / 2501 tests;
  Kotlin runtime smoke tests 8/8; duplicate-declaration gate clean across 87
  top-level declarations.

- A form `onSubmit` that references the form ITSELF — `onSubmit: () => form.setFieldValue('note', '')`, the "clear the field after submit" idiom — now compiles on Android. The Kotlin emit passed `onSubmit` as a constructor argument inside `remember { PyreonForm(…) }`, making the handler body a self-reference in the form's own initializer (`unresolved reference 'form'`), so the shape built on iOS and failed to compile on Android. The emit now assigns `form.onSubmit` after the declaration — mirroring what Swift already did from `.onAppear` — and `PyreonForm.onSubmit` becomes a settable `var`. (8f3b127)
- Fix `emitKotlinToggle` silently dropping `data-testid` — the `<Link>` bug's (9a963f0)
  Toggle sibling. The special-case emitter returned before the generic modifier
  tail, so a `<Toggle data-testid>` emitted a Compose `Switch` with no
  `Modifier.testTag`, making the element unselectable by `onNodeWithTag` at
  all (the Swift half already chained its modifiers). A Toggle without
  `data-testid` emits byte-identically to before. The kotlinc validate stub's
  `Switch` also gains the `modifier` param the real Material signature has —
  its absence made the stub a subset that rejected the corrected (valid) emit.

  Device-bisect-verified on a real emulator: reverting the emit makes the new
  Compose instrumented assertion fail with `could not find … TestTag =
'core-toggle'`; restored, counter-android runs 19/19.

- Device-assert `accessibilityLabel` on Android — it had no coverage at all. (624a51e)

  The cross-platform prop lowers per target: iOS `.accessibilityLabel(...)`,
  Android `Modifier.semantics { contentDescription = … }`. iOS has asserted its
  half on-device since the a11y pass. Android asserted nothing — the counter's
  instrumented test file contained no content-description query at all — so the
  Compose lowering was emit-locked only, and the matrix said so (0.15, "the
  Android side not device-asserted here").

  The new assertion is differentiating rather than merely present: it finds the
  node BY THE LABEL and asserts its text is the glyph "●", which pins the
  semantics block to the element the author annotated. Asserting only that some
  node carries the description would pass if the block landed on a wrapper, a
  sibling, or an empty spacer.

  Matrix: accessibility 0.15 → 0.3 — label lowering proven on both platforms;
  `accessibilityHidden`, roles, focus order and live announcements remain
  unproven on either.

- Summing a column in a loop now compiles. `let acc = 0` followed by `acc += it.price` over a Double column did not typecheck on EITHER target — `var acc = 0` is Int — and there was no way to write it correctly, since `0.0` is `Number.isInteger` and reads as an integer literal too; the only workaround was to abandon the loop for `reduce`. An integer-seeded local is now widened to Double when the function provably writes it a fractional value, mirroring what `widenFloatSignals` already did for `signal(0)` and `refineReduceSeedFloats` for a reduce seed. Two halves were needed: marking the literal makes the emitters print `0.0`, but `inferType` ignored the marker and still typed the expression from the value, so the digits changed and the emitted `-> Int` return type did not. Additive — an integer accumulator is untouched on both targets. (a52b032)
- Component-scope flat array destructure (`const [a, b] = xs()`) now lowers on (7955d7e)
  both native targets — it was the last silent destructure drop. The declaration
  fell through the parser's name-based bail (an ArrayPattern id has no `.name`)
  and vanished with zero warnings, so the emitted Swift/Kotlin referenced
  `a`/`b` unbound and failed the platform compiler with "cannot find 'a' in
  scope" while the transform reported success. Function/computed-body array
  destructure already lowered; only the component-body form was affected.

  The lowering mirrors the component-level object arm: a synthetic container
  const (`__pyDestrN = xs()`) plus per-element index aliases (`a` →
  `__pyDestrN[0]`), the exact IR of the documented explicit-index shape
  (`xs()[0]`), so emit and type inference ride a proven path on both targets.

  Non-simple patterns — holes (`[, b]`), rest (`[...r]`), defaults (`[a = 1]`),
  nested — now fail with a NAMED warning at component scope, and the same loud
  residual covers non-simple component-level OBJECT patterns, which previously
  also vanished silently. The declaration is skipped whole, never half-bound.

  Regression-locked in `native-array-destructure-component-scope.test.ts`
  (emit-shape both targets + real `swiftc -typecheck` + real `kotlinc`),
  bisect-verified: reverting the parse arm fails 6/7 specs with the exact
  `cannot find 'a' in scope` typecheck error.

- `attrs(Text)` — the form the library actually exposes — emitted uncompilable (eec2612)
  native code.

  `@pyreon/attrs` is documented as `attrs(component)` chainable: in its own docs,
  in CLAUDE.md, and in the multiplatform styling table. The native parser
  accepted only `attrs({ component: Base })`, a config-object shape the runtime
  does not require and no document showed.

  The documented form fell through to the generic emit —
  `private let Label = attrs(Text).attrs(__Obj0(…))` — and there is no `attrs`
  function in Swift or Kotlin, so the native build failed with "cannot find
  'attrs' in scope". Nothing warned. Anyone following the documented API got
  uncompilable output; only someone who had read the COMPILER's internal
  doc-comment would have written the shape that worked.

  Fixed by accepting both forms rather than warning that the documented API is
  unsupported: when the implementation and a reasonable documented API disagree,
  the implementation is what should move. Both now lower identically, and a test
  asserts they produce byte-identical emits so they cannot drift apart. The
  existing non-primitive-base warning still fires in the bare form.

- PMTC no longer accepts `attrs(Base)`, a call shape `@pyreon/attrs` rejects at runtime. The signature is `attrs({ name, component })`; the bare form throws `Parameter \`component\` is missing in params!` at mount, so a shared source using it compiled clean on iOS and Android and rendered a blank page in the browser. The compiler had been taught to accept it on the strength of a comment claiming the bare form was "the form the library actually exposes, per its own docs" — the README and manifest have always shown the options object, and the belief traces to a prose shorthand in a capability line being read as a call signature. The bare form is now refused with a named warning that carries the corrected call, so the three targets fail consistently rather than two of them silently succeeding. (d478d14)
- A bare reference to a zero-arg function in text/child position — `const shout = () => raw().toUpperCase()` used as `<Text>{shout}</Text>` — is now CALLED on both native targets, matching the inline `{() => shout()}` form and what Pyreon renders on web. Previously it emitted the function itself: Kotlin failed to compile (`function invocation 'shout()' expected`) while Swift only warned and rendered a debug description, so one shared source built on iOS and did not build on Android. A bare SIGNAL child (`{raw}`) was always correct, which is what made the gap invisible. Scoped to text/child position and arity zero — a reference in prop position (`onPress={handler}`) stays a reference. (0f0f8ad)
- Lock the headline multiplatform claim: all 15 canonical primitives type-check (624a51e)
  on both targets.

  "All 15 canonical primitives map to both targets" is what the four-layer
  shared-code model rests on. It was locked at the emit-STRING level
  (`canonical-primitives.test.ts` asserts the SwiftUI/Compose names) and by
  fixtures exercising some of them — but nothing compiled all fifteen and asked
  whether the result type-checks on both platforms.

  That distinction has mattered repeatedly here: `useDatabase` emitted Swift
  without argument labels for months, `db.insert` lowered a record to a tuple,
  and four of the eight documented control-flow components reproduce their tag
  verbatim. Each looked fine as a string.

  Audited: all 15 pass, both targets, zero warnings, with realistic prop usage
  (a bare tag can lower while its documented props are dropped). So this is a
  regression guard for a working contract rather than a ratchet over debt — and
  the count itself is asserted, so the list cannot shrink into passing by testing
  less.

- `useClipboard()` had no type-gate coverage on either target. (0734f52)

  The emit was fine, but neither `swift-stubs.ts` nor `kotlin-stubs.ts` declared
  `PyreonClipboard` — so the per-fixture type gate could not compile a clipboard
  app at all. Every attempt died on `cannot find 'PyreonClipboard' in scope`
  before it could say anything about the emit, which is indistinguishable from
  "the gate has no opinion", and was.

  That is the same blind spot that hid `useDatabase`'s missing Swift argument
  labels (#2514): a capability whose emit is never type-checked is a capability
  whose emit is unverified, however clean the string looks. The gate's coverage
  is only as wide as its stub table, and nothing tracked which hooks sat outside
  it.

  Both stubs mirror the REAL surface rather than being convenient: `copy` takes
  no argument label on Swift, `copied` is read-only on both, and the Kotlin
  constructor takes `(Context, CoroutineScope)` — the shape the emit hoists and
  injects. Two tests assert the stubs REJECT a write to the read-only `copied`,
  so they are load-bearing rather than decorative.

  Auditing the rest found NINE more shipped runtime types missing from one stub
  file each — Geolocation, MapState, Payments, PushNotifications and WebSocket
  have no Swift stub; Haptics, Linking, Notifications and Share have no Kotlin
  one. Clipboard was one of ten. That is the mechanism behind a recurring
  pattern here: emit bugs reaching the DEVICE gate (minutes of CI, or a nightly)
  when a per-fixture type-check (seconds) should have caught them.

  A ratchet now locks it. `stub-coverage-ratchet.test.ts` enumerates every
  `Pyreon*` type the emitters construct, keeps the real framework ones (a
  same-named runtime source file exists — a structural discriminator, not a
  hand-maintained denylist), and asserts each is stubbed on both platforms. The
  nine gaps sit in `KNOWN_UNCOVERED` and may only SHRINK; a new capability
  without a stub fails immediately, and an entry that has since gained a stub
  must be deleted or the test fails as stale.

  Two of the nine are now filled — `PyreonWebSocket` and `PyreonGeolocation` —
  so `useWebSocket` and `useGeolocation` type-check on Swift for the first time,
  and the ratchet is down to seven. Writing them produced the lesson worth
  keeping: a stub mirrors the surface the EMIT USES, not the source text of the
  runtime. The first `PyreonGeolocation` stub copied `public override init()`
  verbatim, which is correct in the runtime (it subclasses NSObject for
  CLLocationManagerDelegate) and invalid in a stub with no superclass.

  All nine are now filled — WebSocket, Geolocation, MapState, Payments and
  PushNotifications on Swift; Haptics, Linking, Notifications and Share on
  Kotlin — so every emitted framework type is type-checked on both platforms and
  `KNOWN_UNCOVERED` is EMPTY. The list stays as the mechanism rather than as
  debt: it is what makes "a new capability arrives without a stub" fail loudly
  instead of silently widening the blind spot again.

  Filling the Kotlin four unlocked something larger: running the COUNTER app's
  whole emit through `validateKotlin` (rather than one hook at a time) exposed
  two missing COMPOSE apis — `AnimatedVisibility` and `combinedClickable` — both
  backing DEVICE-PROVEN features (`<Transition show>`, `<Press onLongPress>`).
  Neither is a `Pyreon*` name, so the ratchet is structurally blind to them; only
  whole-app validation catches that class. With those added, the counter app's
  entire Kotlin emit type-checks for the first time, and a new test keeps it that
  way — including a spec that FAILS without the app-owned `DeviceInfo`, so the
  gate cannot pass on a trivially-satisfied input.

  Bisect-verified twice: removing both clipboard stubs fails the two type-gate
  specs; removing the Swift one alone makes the ratchet name
  `PyreonClipboard (missing: swift)`.

- Half the documented control-flow vocabulary silently emitted uncompilable (624a51e)
  native code.

  `docs/multiplatform.md` listed eight as supported. Measured against the Swift
  stub type-check:

      lowers    <Show> · <For> · <Suspense> · <ErrorBoundary>
      does NOT  <Switch>/<Match> · <Dynamic> · <Portal>

  The four that do not fall through to the generic component emit, which
  reproduces the tag verbatim — `Switch { Match(when: …) { … } }`, `Portal { … }`
  — and SwiftUI has no such view, so the native build fails with "cannot find
  'Switch' in scope". Nothing warned, so the first sign was a device build
  failing.

  `<Index>` is worse than uncompilable: the render callback is stringified INTO a
  Text, `Text(verbatim: "\({ x in … })")`. Nonsense rather than an error, which
  is the harder failure to notice.

  Each now warns at compile time, on both targets, with a CONCRETE alternative —
  nested `<Show>` for `<Switch>`, `<Modal>` for `<Portal>`, `<For each by>` for
  `<Index>` — and lists the four that do lower, so the author can pick rather
  than guess.

  Warnings rather than four lowerings: `<Dynamic>` needs AnyView-style erasure,
  and `<Portal>` is a category error on native (sheets and dialogs are a
  different model — which the styling table already recorded as web-only, while
  the control-flow list disagreed with it). The doc row is corrected to say which
  four work and which four warn.

- `useDatabase` reaches R4 on iOS — a record that survives a real relaunch. (4479761)

  The shared counter source gains a `useDatabase()` store, a Save Note button,
  and a rendered count; the iOS XCUITest taps Save, asserts the count advanced by
  one (so `db.insert` ran on-device and the record landed), then TERMINATES the
  app, relaunches, and asserts the count survived. On the relaunched process
  `onMount`'s `db.count()` is the only source of that number, so an in-memory
  backend renders 0 — bisect-verified: reverting the Swift default to
  `InMemoryDatabaseBackend` fails with `("0") is not equal to ("1") — the
database is not persisting`.

  The assertion is RELATIVE to the count at launch, never absolute: the Simulator
  keeps the app container between test runs, so the store legitimately
  accumulates records. An absolute `Notes: 1` would pass once and fail forever
  after — the classic way a persistence test gets deleted instead of fixed.

  The Android counter compiles from the SAME shared source, so its instrumented
  test asserts the WRITE path on an emulator: tap → the rendered count advances,
  proving the emit compiles, `PyreonDatabase(LocalContext.current)` resolved a
  real file-backed store, the record landed, and `db.count` read it back. That is
  the half that never compiled. A second Android test then proves DURABILITY: a
  freshly-constructed `PyreonDatabase` over the app's own `filesDir` reads what
  the UI just wrote, and a fresh instance carries no in-memory state, so the
  record demonstrably came off the device's disk — eliminating the cache
  explanation the previous Android "persistence" assertion could not.

  The remaining delta versus iOS is narrow and named rather than glossed:
  AndroidJUnitRunner executes instrumented tests INSIDE the app process, so an
  `am force-stop` would kill the test runner along with the app. The cold-LAUNCH
  `onMount` re-read is therefore iOS-only; the disk round trip — the part that
  was actually broken — is covered on both.

  Matrix: Storage 0.3 → 0.45, with the Android scope written into the row rather
  than rounded away.

  The headline moves ≈52% → ≈51%, DOWN, because the same pass added a
  `Styling & design system` row (weight 6, R4 fraction 0.2) that had been missing
  entirely. The whole `styled` / `elements` / `coolgrid` / `attrs` / rocketstyle /
  theme-token surface lowers to both targets and is documented as supported — yet
  had no row at all. Its fraction is 0.2, not 0: the rocketstyle-over-`Text`
  pattern with a reactive dimension flip IS device-asserted on both platforms at
  the RE-RENDER level (the counter's `StatusBadge` flips `Badge:ok` →
  `Badge:warn`; the rendered COLOUR is NOT asserted — neither harness can read it,
  and those device tests say so explicitly rather than implying otherwise), while `styled()` / `Element` / `coolgrid` /
  `attrs` / `defineTheme` tokens / typography have no native example. Drafted as
  0.0 and corrected on review — that reading was true of this branch and false of
  main, where the badge had already landed; overstating a gap is as wrong as
  hiding one. Omitting a track a real app leans on heavily made every percentage on
  that page flattering rather than true, and the table is supposed to BE the
  denominator. The drop is a correction to the measurement, not a regression in
  the product.

- `useDatabase()` did not persist — on either platform. (33d6aed)

  Both native runtimes' `PyreonDatabase` defaulted to an in-memory backend, and
  the compiler emit constructed exactly that default. An app that inserted
  records and relaunched found them gone: no warning, no error, nothing failing.
  The entire reason `useDatabase` exists over `useStorage` is structured data
  that OUTLIVES the process, so an ephemeral default was not a conservative
  starting point — it was silent data loss wearing the word "default".

  `FileDatabaseBackend` is now the default on both platforms — one JSON file per
  collection, written atomically, under `Application Support` (iOS) / the app's
  private `filesDir` (Android). The Kotlin emit threads `LocalContext.current`
  into the constructor, because Android cannot resolve app-private storage
  without a `Context`; Swift needs no equivalent, since Foundation resolves
  Application Support unaided. The spelling is asymmetric on purpose (Swift's
  no-arg initialiser IS the persistent one; Kotlin has no no-arg form at all, so
  the shortest thing you can write can no longer be the one that loses data), and
  the on-disk bytes are identical — locked by a cross-language format test that
  asserts the same string from Swift's `JSONSerialization` and Kotlin's
  hand-written codec.

  Foundation/JVM-only, no SQLite: a record is an id plus string fields, and a
  SQLite module map differs between Apple platforms and Linux — the toolchain
  split that has broken this runtime's CI before. Apps that outgrow the file
  store inject Room / SQLDelight / Core Data through the same constructor.

  Failure is non-fatal: a corrupt file reads as an empty collection and a failed
  write is dropped after `onError`. Collection names are percent-encoded before
  touching a path, so an app-supplied `"../escape"` cannot leave the store
  directory.

  Behaviour changes worth knowing: `PyreonDatabase()` on Swift now persists (it
  previously did not), and Kotlin's `PyreonDatabase()` no longer exists — pass a
  `Context`, an `InMemoryDatabaseBackend()`, or your own backend. Tests that
  want no filesystem should pass `InMemoryDatabaseBackend()` explicitly.

  And `db.insert(collection, { id, fields })` — the primary write, and the only
  way to get data into the store — never compiled on EITHER target. The generic
  object-literal path lowered the record to an anonymous tuple
  (`(id: "1", fields: __Obj0(...))` in Swift, a not-even-valid `(id = ...)` in
  Kotlin), with zero warnings. It now lowers to a real `PyreonRecord`. That
  explains the ordering of this capability's three defects: `insert` being
  uncompilable made everything downstream unreachable, so "no gated app renders
  FROM the database" had a cause rather than being an absence of effort.

  Also closes a gate hole the fix itself walked into: the codec was first named
  `PyreonJson`, which already existed for the WebView bridge. Every native app
  compiles the whole runtime source set as ONE Gradle module, so that is a hard
  `Redeclaration:` error — but the per-file kotlinc gates compile one module at a
  time (deliberately, so a module can be checked without the Android SDK), so
  nothing local could see it and the first thing that noticed was an 8-minute
  `gradle assembleDebug` on the device workflow. `check-duplicate-declarations.ts`
  now scans every top-level name across runtime-kotlin + router-kotlin in
  milliseconds, needs no toolchain, and runs unconditionally in build/test/
  typecheck.

  Bisect-verified. Still open, and stated plainly: no device-gated app renders
  FROM the database yet, so the capability's matrix row moves R2 → R3, not R4.

- An empty object literal `{}` emitted Void — silently on Swift. (4d91b74)

  Both emitters render a fieldless object as `()`, which on Swift is the empty
  TUPLE, i.e. `Void`:

      signal({})                     Swift   @State private var u: Any = ()
                                             COMPILES. The value is Void, not an
                                             object. Nothing warned.
                                     Kotlin  cannot infer T — loud failure.

      signal<{ name?: string }>({})  Swift   @State private var u: CU = ()
                                             "cannot convert value of type '()'"
                                     Kotlin  same — loud on both.

  So the shape was inconsistent ACROSS targets and silent on one of them, which is
  the combination that ships broken apps: the author builds for iOS, sees green,
  and the semantic break surfaces later or on the other platform.

  Found by probing nine everyday authoring idioms against BOTH targets. Worth
  recording that the other eight are clean on both — `&&` conditional children,
  `.map` over a signal array, nested components with props, a handler taking a
  parameter, template literals, computeds, `.filter().length`, and a ternary
  between two DIFFERENT view types. This is a narrow gap in an otherwise solid
  core, not a symptom of a broad one.

  WARNED, NOT LOWERED, and deliberately. Emitting an empty struct would fix the
  first shape and not the second: there the literal is empty while the TYPE
  ANNOTATION carries the fields, so a struct synthesized from the literal would
  drop `name` and the later `u().name` would fail regardless. Synthesizing from
  the annotation is a real feature; a warning that names the shape and the fix is
  what is honest to ship today.

  Over-warning was MEASURED, not assumed — object literals are everywhere (every
  hook config, every nested message map), so a false positive here would be worse
  than the bug. Non-empty literals, spread-only literals, nested i18n message
  maps, machine configs and defineStore setups all stay silent, each locked by a
  test on both targets.

  Bisect-verified: reverting fails the four warning specs with
  `expected [] to have a length of 1` — zero warnings, the silent failure — while
  all ten over-warning guards stay green.

- Lock the platform escape hatches, because two new warnings now depend on them. (624a51e)

  The warnings added for hooks and control-flow components with no native
  lowering both tell the author to "use it behind a `<Web>` escape hatch". That
  advice is only worth giving if `<Web>` genuinely excludes its children from the
  native emit — and wrong guidance inside a compiler warning is worse than none,
  because it sends people down a path that cannot work while looking
  authoritative.

  Verified before those warnings shipped rather than after: `<Web>` excludes from
  both natives, `<NativeIOS>` and `<NativeAndroid>` include on their own target
  only, and content OUTSIDE a hatch survives everywhere — the half an
  exclusion-only test forgets, since a hatch that excluded everything would pass
  it. What remains after exclusion is type-checked on both targets too, since a
  dangling wrapper would satisfy every string assertion and fail on compile.

- `@pyreon/form` was device-proven on native — via source that cannot compile on web. (6e12444)

  The web API types the accessors as FUNCTIONS (`values: () => TValues`,
  `errors: () => …`), so shared source reads `form.values().email`. The native
  emit only lowered the PROPERTY form, `form.values.email`. That made a form
  non-shared in BOTH directions:

  - `form.values().email` — correct web → **uncompilable native, zero warnings**
  - `form.values.email` — compiles native → **type error on web**

  There was no shape that worked on both, which is the entire premise of the
  four-layer shared-code model. Worse, both device-proven examples were written
  in the native-only shape, so every device gate passed while the promise those
  examples exist to demonstrate — one source, three targets — was not being met
  for forms. Device proof actively pointed away from the defect.

  Fixed by normalising a zero-arg call on the accessor to the property form in
  both backends, at BOTH sites that recognise it: the general member read, and
  the `<Field>` binding special-case (which routes the setter through `setValue`
  → re-validation, and would otherwise fall through to a generic, unbuildable
  field). Additive — the property form still works.

  Both device-proven examples migrated to the web shape. That is provably safe
  without re-running the device gate: the two forms produce **byte-identical**
  native emit on both targets, verified per example per target, and identical
  bytes cannot behave differently on a device.

  Locked by a test asserting the web form type-checks on both targets, that it
  routes through the runtime binding rather than a generic field, the
  byte-identity that justified the migration, and a drift guard on the examples
  themselves — a regression to the native-only shape would silently stop being
  web-compatible while every native gate stayed green.

- `useFetch(url, { method, headers, body })` now reaches the wire on iOS and (25b5f5a)
  Android. Every field of that init object was previously read by nobody — the
  native parser only looked at the first argument — so both targets emitted a
  plain GET and an app asking for a POST silently performed the wrong verb with
  no diagnostic anywhere.

  Requests carrying a verb, headers or a body now lower to `PyreonHttp`, which
  had shipped on both runtimes with full verb support and nothing calling it:
  Swift had a live `URLSession` edge no emit reached, and Android had an executor
  interface whose real OkHttp implementation did not exist (`PyreonHttpOkHttp`,
  new here). A non-2xx now rejects rather than being handed to the JSON decoder,
  where it read as "the server sent bad JSON" instead of a 404. Values the
  compiler cannot bake — a computed method, a `JSON.stringify(...)` body — now
  WARN loudly instead of degrading to a GET.

  Two pre-existing breaks in the same container, both fixed here and both hidden
  by the fact that every existing example fetches an array and reads
  `data() ?? []`:

  - a single-object `data()?.field` read emitted `data.field` on Swift, which
    does not compile — the inference reported the container's `data` as
    non-optional even though the web hook, Swift and Kotlin all declare it
    optional, so the member emit stripped the `?.` the author wrote;
  - `error()` in call form inferred `unknown`, so `{f.error() ? … }` emitted a
    bare `Throwable?` as a Kotlin condition ("condition type mismatch").

  `@pyreon/hooks`: `useFetch` takes an optional second argument (`UseFetchInit` —
  `method` / `headers` / `body`), matching the native lowering.

  **`useFetch` decoding on Android now matches iOS.** kotlinx.serialization's
  default `Json` THROWS on a JSON key the target type does not declare; Swift's
  `JSONDecoder` silently ignores it. The emit used the bare default, so the same
  shared `useFetch<T>(url)` against the same server decoded fine on iOS and threw
  on Android the moment the response carried one extra field — i.e. against
  essentially every real API, since a server returning exactly the fields one
  client declares is the exception. Decoding now goes through
  `PyreonFetchJson` (`Json { ignoreUnknownKeys = true }`).

  This was PRE-EXISTING and is not limited to the new verb path — the plain GET
  path decoded the same way. It stayed invisible because the only device-proven
  fetch fixture is a hand-written `quotes.json` whose shape matches its type
  exactly; measured on a real emulator, a 200 response with one extra field
  raised `JsonDecodingException: Encountered an unknown key 'contentType'` while
  the identical iOS run passed.

  Deliberately scoped: `ignoreUnknownKeys` only. NOT `isLenient` (malformed JSON
  is a real error worth surfacing) and NOT `explicitNulls = false`.

- Annotating your data types no longer makes the app uncompilable. `signal<{ id: number; price: number }[]>([{ id: 1, price: 2.5 }])` synthesised a struct with `price: Int` and initialised it with `2.5` — invalid Swift AND Kotlin — and everything downstream inherited it (a `reduce` over the column typed Int against a Double accumulation; the same for an imperative accumulator loop). Deleting the type annotation was the only fix, and there was no way to spell it correctly since `0.0` reads as an integer literal. Root cause was one assumption in three places: an INLINE object type produces no `StructIR` at parse time, and all three Double-refinement passes resolved element types through a NAMED struct only — one via `structNameOfType`, one via an outright `structs.length === 0` bail, and one via a `typeRef`-only element check. All three now accept the inline form, so the annotated and un-annotated spellings emit identically. Additive: an all-integer column is untouched. (9179250)
- Sorting by a fractional column now compiles on Android. `items().sort((a, b) => a.price - b.price)` emitted a Kotlin `Comparator` returning Double where `Int` is required (`argument type mismatch: actual type is 'Double', but 'Int' was expected`) — a JS comparator returns any number and only its sign matters, but `Comparator.compare` does not. Kotlin only: Swift converts the difference to the Bool its `sorted(by:)` wants, so it never saw the comparator's own type and compiled throughout. The fix converts the sign explicitly when the body is fractional, and is gated on inferred float rather than applied everywhere — an Int comparator's emit is byte-identical, and a non-numeric body (`a.name > b.name ? 1 : -1`) is left alone. (2ed340e)
- The 28 hooks the compiler claims lower natively were never verified. Three defects. (6e12444)

  `NATIVE_LOWERED_HOOKS` is the allowlist that suppresses the "no native lowering"
  warning, so every name in it is an implicit promise that the hook emits
  compilable code on both targets. The warning arc verified the 38 hooks that do
  NOT lower; nothing verified the 28 that supposedly do. Probing all 28 against
  both type-checkers found three defects, each of a different kind:

  **`useFetch` without a response type — emit bug, iOS only.** No generic lowers
  to `decode(Any.self, …)`, and `Any` cannot conform to `Decodable`. Kotlin
  compiles either way. Now warns, naming the typed form. Not rewritten to infer a
  type: there is no sensible default for a response shape, and the typed form is
  already the documented one.

  **`useStorage` scalars — gate hole.** Scalars lower to SwiftUI's own
  `@AppStorage`; a struct value routes to the runtime's Codable
  `@PyreonAppStorage`. Only the latter was stubbed, so the COMMON path was outside
  the type gate entirely while the uncommon one was covered. The stub now mirrors
  SwiftUI's real constrained overloads rather than a loose generic — a permissive
  `<Value>` would mask an emit that ever sent an unsupported type to `@AppStorage`.

  **`usePermissions` — stub bug, in the INVERSE direction of the usual one.** The
  real init defaults its parameter on both targets; both stubs required one, the
  Swift stub took an Array where the real type takes a Set, and the Kotlin stub
  renamed the parameter and typed the property as a plain Set where the real one
  is Compose `MutableState`. Three divergences, all strict. **The emit was
  correct and the gate was wrong.** The documented trap is a superset stub masking
  breakage; this is the mirror image, and it fails in a way that looks like an
  emit bug. Latent only because no fixture used the hook.

  The through-line, again: each hook is exercised by an example along ONE shape,
  and the other shapes were never compiled. `useFetch` is device-proven — with a
  generic. `useStorage` is device-proven — through the struct path. Device
  evidence covers the path the example takes, not the API surface.

  Locked by a permanent test over the whole allowlist, with the three exclusions
  (`useNativeModule`'s user-supplied FFI class, `useLoaderData`, `useSecureStorage`)
  named with rationales rather than quietly omitted, and a count assertion so a
  new hook cannot be added to the allowlist silently.

- `isAvailable()` was documented on the shared picker surface and implemented on one of three targets. (b40ebfc)

  `UseImagePickerResult` and `UseFilePickerResult` both declare
  `isAvailable: () => boolean`, and their own JSDoc already specifies the native
  behaviour — "Native: always `true` — the runtime's `pick` collapses an
  unavailable picker to `null`." Neither native runtime had the method.

  So `if (picker.isAvailable()) { … }` — an ordinary defensive guard, and valid
  TypeScript on web — failed BOTH native targets with ZERO warnings:

        Swift    value of type 'PyreonImagePicker' has no member 'isAvailable'
        Kotlin   unresolved reference 'isAvailable'

  Documented-but-unimplemented, which is the `audit-types` class: the field IS
  referenced by the type surface, so nothing flagged it, and the failure appears
  only if someone writes the guard AND builds for native.

  IMPLEMENTED rather than warned, because the documentation already specified the
  answer and it is a true one — these pickers really are always available
  natively. Warning people off a documented method would have been the wrong
  shape.

  On Kotlin, returning `launcher != null` was considered and REJECTED. It is
  arguably truer there (the launcher is null until composition wires it), but it
  would make the same call return different answers on iOS and Android for the
  same source — a new cross-target divergence, which is the class of bug this
  method exists to close. The unwired case is already handled: `pick()` resolves
  null.

  Found by sweeping the async platform-API tier. Worth recording that the tier is
  otherwise HEALTHY — the matrix calls the `await hook.method()` lowering "the
  keystone for the whole async-platform-API tier", and awaiting a picker,
  awaiting biometrics, branching on the result, two SEQUENTIAL awaits, and an
  await nested inside an `if` all compile on both targets. This one member was the
  only gap.

  VERIFICATION, with its limit stated: the REAL Swift runtime BUILDS (`swift
build` compiles both pickers), which is stronger than the stub gate. The Kotlin
  half is stub-verified only — `verify-kotlin` covers `PyreonStorage`, and the
  pickers import `androidx`, so they are excluded from the local runner by
  design. The change adds no new imports, so it cannot trip the
  conditional-import class; the real Android build remains the true gate there.

  Bisect-verified: removing ONE of the two stub occurrences (the "only one picker
  updated" shape, which is exactly how this bug shipped) fails the parity spec
  with `expected 1 to be 2`.

- Optional service fields rendered `Optional(37.3349)` on iOS instead of `37.3349`. (4cb8c0b)

  Not a missing feature — the opposite, which is why it survived. BOTH emitters
  already render an optional interpolation web-equivalently (Swift
  `\((x).map { "\($0)" } ?? "")`, Kotlin `${x ?: ""}`), but the guard is
  `typeIsOptional(inferType(...))` and inference had no field model for the
  service containers. So every optional service field fell through as
  non-optional and emitted a RAW interpolation.

  Measured before the fix: `geo.latitude`, `geo.longitude`, `f.error`,
  `w.lastMessage`, `p.purchasing` and `m.selectedMarkerId` ALL emitted raw — i.e.
  every optional field of every service container, which is the most common way
  to display service state. Swift renders those as `Optional(…)` where web
  renders the value, and `nil` where web renders nothing; Kotlin renders `null`.

  swiftc warns about exactly this interpolation, but the stub gate does not
  surface warnings — the same blind spot that let the `LocalizedStringKey`
  locale-formatting bug ship (`Text("\(balance)")` rendering "2 700" for 2700).
  Both are "compiles fine, renders wrong, invisible in the counter example
  because `Count: 0` exercises neither".

  Fixed with a field table in the SHARED inference, so one change serves both
  backends with zero emit churn. The test also asserts the guard stays narrow — a
  plain signal read and a non-optional field of the same container must not be
  wrapped.

  One existing test needed correcting, not silencing: it asserted
  `toContain('\(loc.latitude)')`, the raw form. Its invariant is in its name —
  "reactive fields read BARE (@Observable — no .value rewrite)" — and that still
  holds, since the field is read bare and only the interpolation around it
  changed. Assertion corrected to the bare-read invariant plus a guard that the
  raw form cannot return.

- `useStorage()` did not persist on Android. (33d6aed)

  `PyreonStorageRegistry.backend` defaulted to an in-memory map; the docs pointed
  at a `DataStoreBackend` for "actual cross-launch persistence"; that class did
  not exist anywhere in the repo, and no example app ever assigned the registry.
  So the most-used hook in the framework silently lost every value on process
  death — on the platform where process death is routine. iOS was unaffected
  (`@PyreonAppStorage` is UserDefaults-backed), so the same shared source
  persisted there and not here: a parity break that only shows up when you RUN
  the app on both platforms.

  It looked proven. The Android device gate asserted
  `todosPersistAcrossActivityRecreation`, and activity recreation keeps the
  PROCESS — so the in-memory map survived it. A green test named "persist" was
  measuring the one form of persistence that needs no persistence layer at all.

  `FileStorageBackend` (one JSON file under the app's private `filesDir`, atomic
  write-then-rename) now installs itself the first time `rememberPyreonStorage`
  runs, so a scaffolded app persists with no wiring. It only ever replaces the
  UNCONFIGURED in-memory backend: an app that assigned its own store in
  `Application.onCreate` keeps it, and the factory is not even constructed in
  that case.

  The backend layer (interface, in-memory, file, registry, install policy) moved
  into a dependency-free file so the Kotlin test gate actually RUNS it —
  `rememberPyreonStorage` needs Compose, and modules importing `androidx.*` are
  typecheck-only there. "Does a value survive the process" and "does installing a
  default clobber the app's own backend" are precisely the questions a typecheck
  cannot answer.

  Also fixed on the way: `PyreonStorage.kt` was never in any verify list, so it
  had never been typechecked by the package's own gates. It is now, along with
  the two new modules.

  Bisect-verified (three, each restored): removing the remove()-flush →
  "removed key must not come back"; removing the install guard → "an app that
  chose a backend must keep it"; the codec's escaping has its own
  adversarial-string round trip.

  Still owed, and stated plainly: no device test asserts survival of real
  process death on Android. That is R3, not R4, and the matrix says so.

- `const { store } = useApp()` failed both native targets with zero warnings. (cddba1e)

  `defineStore` returns `() => StoreApi<T>` and `store` is a real property on that
  api, so destructuring it is ordinary, valid web code. On native it lowered to
  nothing: the destructured name emitted unbound and both builds failed with
  `cannot find 'store' in scope`. The identifier-alias lowering
  (`const app = useApp()` → alias `app` → `useApp`) only fires for an Identifier
  binding; an ObjectPattern falls straight through.

  Warned rather than lowered. The alias map is identifier → hook name, and a
  destructured `store` aliases `useApp().store` — a member PATH, not a call — so
  supporting it means threading a second alias kind through `parseExpr`. The three
  other shapes all work (`useApp().store.x`, `const api = useApp(); api.store.x`,
  and the same with an action call), so naming them costs the author one line.

  Worth recording how this was found, because it is the counter-example to the
  session's usual pattern: the FIRST THREE probes of this surface were my own
  errors, not defects. `const s = useApp(); s.n()` and `useApp().n()` both fail on
  web too — they skip `.store` — and an earlier probe used a non-shorthand
  `return { n, inc: () => … }`, which the compiler correctly warns about. Only
  after reading `defineStore`'s actual return type did a real gap appear. A probe
  that fails is a hypothesis, not a finding.

- The concise defineStore setup failed both targets silently — and the warning written for it was unreachable. (3df5fbb)

      defineStore('app', () => ({ n: signal(1) }))

  emitted uncompilable Swift:

      private let useApp = defineStore("app", { ((n: signal(1))) })

  referencing `defineStore` and `signal`, neither of which exists in Swift, and
  warned about NOTHING. The block-body form immediately next to it lowers
  cleanly, so whether an author got working native code or silently broken native
  code came down to writing `() => ({ … })` versus `() => { … }`.

  The warning for this exact case already existed in `parse.ts` and its text was
  correct — it names the block-body form to switch to. It was simply unreachable.
  The branch tested `body.type === 'ObjectExpression'`, but a concise-object arrow
  body parses as a `ParenthesizedExpression`, and those parens are MANDATORY
  syntax (`() => { … }` would be a block). The condition was therefore false for
  every input that could ever reach it: dead from the moment it was written, with
  the shape falling through to a silent `else { return null }`.

  Verified against the real parser rather than reasoned about — for this source
  oxc-parser reports `arrow.body.type === 'ParenthesizedExpression'`.

  Fix is to unwrap before the branch, with `while` rather than `if` since `(( … ))`
  is legal and nests.

  SCOPE CHECKED, not assumed: this is the only site in `parse.ts` testing for a
  concise-object arrow body. The other `body?.type` checks look for
  `BlockStatement`, which is never parenthesized, and one site at line ~6154
  already unwraps parens correctly.

  RESIDUAL, stated plainly because the build still fails after this change: the
  emit remains uncompilable passthrough. That is PRE-EXISTING and identical on
  every defineStore bail path — the non-shorthand-key bail, which has warned since
  v2, emits the same passthrough. This change brings the expression-body form to
  parity with those paths: a NAMED failure carrying a fix instruction rather than
  a silent one. Removing the passthrough is a separate change across all bail
  paths and would not make the build pass either, since the component still
  references the store — so the warning is the load-bearing signal either way.

  Bisect-verified: reverting the unwrap fails the four warning specs with
  `expected [] to have a length of 1` (zero warnings — the silent failure), while
  both block-body guard specs stay green, proving they do not pass merely because
  of the fix. Restored, 6/6 pass, and all four store suites are green (35 tests).

- `str.replace(a, b)` now lowers to a FIRST-only replace on both native targets, matching JS. It was previously unmapped, and an unmapped method is emitted verbatim — so one line of shared source produced a hard swiftc error (`missing argument label 'with:'`, no such signature) and a Kotlin build that compiled and quietly replaced EVERY occurrence, with no warning on either. Kotlin now emits `replaceFirst`; Swift an IIFE over `replacingOccurrences(of:with:options:range:)` bounded to the first match, with operands bound as parameters so the receiver is evaluated once. `replaceAll` keeps its replace-ALL mapping. Fixes a sibling gap found alongside: `replaceAll` and `repeat` were missing from the string return-type table, so a helper wrapping either emitted a Swift function returning Void. (a6a6d88)
- Device-assert the STATIC rocketstyle cascade through geometry — on Android. (624a51e)

  The existing badge test proves a REACTIVE dimension re-renders and is careful to
  claim nothing about colour. The static side — dimension → emitted modifier →
  rendered layout — had no device coverage: a `size` that emitted no modifier, or
  one the platform ignored, looked identical to a working one.

  The counter gains a `size`-dimensioned component whose `narrow`/`wide` values
  drive `width`, so the cascade's result is measurable. Compose's
  `getBoundsInRoot()` reads real layout bounds, and the Android instrumented test
  asserts ~120dp / ~240dp.

  NO iOS assertion, deliberately, and the reason is in the iOS test file: XCUITest
  exposes an element's ACCESSIBILITY frame, which hugs the content rather than the
  layout frame. Measured on iPhone 17 Pro, the same shape reported 52.7/36.0pt
  with the ids on Texts (the glyph widths of "narrow" and "wide") and 9.7/13.0pt
  on Stacks — never the 120/240 the modifier requested. Any tolerance band wide
  enough to pass would admit a dropped modifier, so the assertion was written,
  measured, found to be measuring the font, and removed. A screenshot-diff
  instrument is the tracked follow-up.

  Matrix: the styling row's 0.2 now covers two mechanisms — reactive re-render on
  both platforms, static cascade geometry on Android.

- A Pyreon hook with no native lowering emitted uncompilable code, silently. (624a51e)

  The parser lowers 28 hooks. Anything else imported from a `@pyreon/*` package
  and called as `useX()` fell through to the generic `const x = <call>` emit,
  which reproduces the call verbatim:

      const items = useFieldArray('tags')
      →  let items = useFieldArray("tags")      // cannot find … in scope

  There is no `useFieldArray` in the Swift or Kotlin runtime, so the native build
  fails — and nothing warned. 38 of the 52 hooks `@pyreon/hooks` and
  `@pyreon/form` export behave this way (`useFieldArray`, `useToggle`,
  `useElementSize`, `useMediaQuery`, `useWatch`, …), so the first sign of trouble
  was a device build failing, or nothing at all for an app nobody type-checked.

  Now warned per hook, on both targets, naming the hook, its package, the exact
  error it would otherwise produce, and three ways out (a `<Web>` escape hatch, a
  hook that IS lowered, or hand-rolling from signals).

  Deliberately a warning rather than 38 lowerings: implementing `useElementSize`
  on SwiftUI is a different project, while telling the author it will not work is
  a compile away — and the PMTC arc's stated direction is that failure outside the
  supported subset should be a NAMED warning, not a silent drop.

  Scoped to `@pyreon/*` imports: a user's own `useThing()` is ordinary code the
  compiler may handle, and warning about it would be noise. The lowered set is
  declared in one place (`NATIVE_LOWERED_HOOKS`) so its complement is nameable,
  with a drift test asserting every entry is genuinely referenced by the parser —
  an entry that stopped being handled would silently stop warning.

- `const p = useParams()` then `p.id` failed on both native targets, silently. (eec2612)

  The hook lowers to a native dictionary (`[String: String]`) / map, so the
  natural JS property read emits `p.id` — which is not how either is accessed.
  Both targets failed to type-check and nothing warned.

  The destructured form has always worked, per key and with the Optional handled:

      const { id } = useParams()
      →  private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }

  That is why the matrix records `useParams` at R5 while this shape was broken:
  the device-proven router-demo reaches params through `props.params.id`, so no
  example exercised the hook's whole-object form. A capability can be genuinely
  device-proven along one path and silently broken along another.

  Warns rather than rewriting `.id` → `["id"]`. Member access is emitted from
  everywhere in this compiler, and narrowing a codegen rewrite to exactly this
  binding wants a reliably-green full suite to land safely; the destructure is
  already the supported idiomatic shape, so the warning costs one line and
  nothing in correctness. The tests include the measurements the warning is
  derived from, so if the whole-object form ever compiles, the suite fails and
  the warning goes.

- Content-address the native compile-validation harness so `swiftc` / `kotlinc` (f110299)
  verdicts are not re-derived on every run.

  The `Native Compiler Validation` job measured 35-40 minutes and had become the
  last check on every PR. The cause was not the number of tests but the number of
  **process spawns**: the suite makes ~600 compiler invocations across 123 test
  files, and vitest isolates modules per file, so every per-process memo fired
  once per file. Measured on an M3 Max (CI runners are 2-3x slower):

  | Operation                                        | Cost     | Calls | Total   |
  | ------------------------------------------------ | -------- | ----- | ------- |
  | `kotlinc` compiling a 1-line file                | 2.07s    | 282   | 9.7 min |
  | `kotlinc -version` (availability probe)          | 1.36s    | 123   | 2.8 min |
  | `swiftc -typecheck` SwiftUI + Observation probes | ~1s each | 246   | ~4 min  |

  The two recorded responses to this pain were a 180s per-spec `testTimeout` and a
  50-minute workflow timeout. Both raise the ceiling; neither removes the cost.

  Measured effect (same machine, same worktree, identical pass counts throughout).
  The A/B holds vite's transform cache warm in BOTH arms so the only variable is
  the verdict cache — an unqualified "second run was faster" would otherwise be
  measuring vite:

  | Suite                              | Uncached | Empty cache | Warm   |
  | ---------------------------------- | -------- | ----------- | ------ |
  | 14-file subset (381 tests)         | 117s     | 113s        | **1s** |
  | Full suite (223 files, 2655 tests) | 397s     | 306s        | **6s** |

  Two honest caveats on those numbers:

  - The **empty-cache** column is faster than uncached only because the
    tool-availability probes are cached intra-run (the first test file probes
    `kotlinc`, the other 122 read the result). That is worth 91s on the full suite
    — real, and it lands on the very first CI run with no cross-run persistence —
    but it is 91s, not the minutes a serial `123 x 1.36s` estimate suggests: vitest
    runs files in parallel, so probe cost is amortized across workers.
  - These are local wall-clock figures. The CI job also installs two toolchains and
    runs scaffold + iOS simulator smokes, none of which this change touches, so the
    job total will not fall in the same proportion as the test step. No job-level
    number is claimed here because none has been measured.

  A validate call is a pure function of (validator kind, compiler identity, the
  exact stub text, the exact source text, the compiler argv), so its verdict is
  content-addressable. Verdicts and tool-availability probes are now cached on
  disk, which is the tier that matters — per-file module isolation means an
  in-process `Map` is never shared between test files, while disk is shared across
  workers _and_ across runs.

  Correctness properties, each pinned by a test:

  - The key folds in the **stub text**. This is load-bearing rather than tidy: the
    stubs are edited regularly, and a superset stub MASKS real breakage. A key
    that omitted them would serve a stale `ok` after a stub edit, silently
    defeating the gate this harness exists to be.
  - The key folds in the **compiler version**, so a toolchain upgrade invalidates.
  - The key folds in the **validator kind**, because `-parse` accepts sources that
    `-typecheck` rejects.
  - `skipped` verdicts are never cached — they encode tool availability, not a
    compiler judgement, so caching one would make an installed toolchain look
    absent.
  - A corrupt or wrong-shape cache entry reads as a miss, never as a verdict.
    Entries are written via write-then-rename, so a killed writer cannot leave a
    truncated file that happens to parse.
  - "Tool absent" is never cached against a stable key, so installing a toolchain
    takes effect immediately.
  - Entries are written with an unpredictable temp name and an **exclusive-create**
    flag, at mode 0600, and the last-resort temp-dir location is per-uid and
    created 0700. A cache another user can write is a cache that can feed this gate
    a forged `ok`, so the temp-file path is a real attack surface rather than a
    lint detail (CodeQL flagged the first cut; the fix is structural, not a
    suppression).
  - `PYREON_VALIDATE_NO_CACHE=1` bypasses both tiers;
    `PYREON_VALIDATE_CACHE_DIR` relocates the store.

  CI wiring: the `Native Compiler Validation` job restores/saves the store with an
  accumulating `actions/cache` key (unique per run, `restore-keys` prefix), so a PR
  inherits `main`'s warm cache. The **nightly drift run deliberately runs
  uncached** — a gate that can only read a cache is one you have to trust blindly,
  and that schedule exists to catch a fresh compiler release changing strictness,
  which a cache hit would mask.

  No emit, warning, or verdict changes — this only stops re-deriving verdicts that
  are already determined.

- Give `useOnline()` a real connectivity monitor on Android, and make the database presence check compile. (d62ce1a)

  - **`useOnline()` on Android reported `true` forever.** `PyreonNetworkStatus` shipped as a pure state container defaulting to online, with a `start(register)` seam for the app to wire its own `ConnectivityManager.NetworkCallback` — and nothing wired it, so the hook could not report the device's real state no matter what the radios did. A new `rememberPyreonNetworkStatus()` self-installs a real callback (seeded from the current state, torn down on leave, degrading to the optimistic default if `ACCESS_NETWORK_STATE` is missing rather than crashing). An app that wants different semantics still calls `start()` with its own registrar. Same shape as the geolocation registry fix: a default that requires a step nobody takes is not a default.
  - **`const found = db.get(c, id); if (found) { … }` compiled on neither target.** Reading a row and branching on whether it exists is the single most common database shape, and `db.get`'s optional record return had no inference model, so the condition emitted a bare optional — swiftc "optional type 'PyreonRecord?' cannot be used as a boolean", kotlinc "condition type mismatch". `database.get` now joins `SERVICE_METHOD_RETURNS`, which also gives Swift the `if let` binding so the body sees the unwrapped value.

  - **Compose state was written from background threads, crashing layout-heavy screens.** Android delivers `ConnectivityManager.NetworkCallback` on a binder thread and OkHttp delivers `WebSocketListener` callbacks on its reader thread. Both drive Compose `MutableState`, so both raced the UI thread's measure/layout and made Compose throw `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`. It is load-dependent, so it does not fail every run — it surfaced as a 10,000-row lazy-list test failing while nineteen siblings passed, in an app whose only change was adding `useOnline()`. Connectivity callbacks now register with a main-looper `Handler`, and the OkHttp transport hops every listener callback to the main thread. `PyreonGeolocationAndroid` already did this correctly; the two new call sites had simply diverged from it.

  The first two were found by writing the natural offline-first shape for the Offline/sync matrix row and bisect-verified on device. The threading bug was found BY the device gate; its WebSocket twin was found by auditing the same shape rather than by a failure of its own — no compile-level gate can see either, since the emitted Kotlin typechecks clean with the bug present.

- Make the native stack publishable — it was `private: true` while `pyreon new --native` shipped and advertised it. (6378982)

  A scaffolded multiplatform app declares five `@pyreon/native-*` packages and
  resolves the Swift/Kotlin runtimes **out of `node_modules`** — XcodeGen consumes
  `../node_modules/@pyreon/native-runtime-swift` as a local SPM package, Gradle
  adds `../../node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin` as a
  source set. So npm is not an incidental channel, it is the required one. With
  every package private, `npm install` could never fetch them: the paths did not
  exist and the native build could not run. That is why multiplatform was
  unusable outside a workspace checkout, regardless of compiler capability.

  Two of the six needed real work, not just a manifest flag:

  **`@pyreon/native-cli` shipped a `.ts` bin.** `bin` pointed at `./src/cli.ts`,
  and the scaffolded builds invoke it as `npx pyreon-native build …` — i.e. under
  **node**. Measured: node cannot execute it even on v26's type-stripping path,
  because the source uses extensionless relative imports (`./build`) that bun
  accepts and node's ESM resolver rejects. Now builds to `lib/` and ships a
  hand-written `bin/pyreon-native.js` that calls `main()` **explicitly** rather
  than relying on `cli.ts`'s `import.meta.main` guard — that guard is Bun-only
  (undefined on Node < 24.2) _and_ is dropped by the bundler, the exact
  combination that shipped `pyreon-lint` as a silent no-op in every published
  version.

  **`@pyreon/native-compiler` had no build at all** — its exports pointed straight
  at `src/index.ts`, so publishing would have shipped raw TypeScript to a
  consumer resolving `import`. Now builds to `lib/` with proper types.

  The four runtime/router packages ship SOURCE by design (Swift files for SPM,
  Kotlin for Gradle) and needed only `publishConfig.access` + `sideEffects`;
  tarball contents verified (Package.swift + Sources; 65 `.kt` files).

  Also fixes `--help`, which exited **1** and printed to **stderr**. For a
  published CLI that breaks any script or CI step checking exit codes, and hides
  usage from a plain `| grep`. Now exit 0 on stdout; error paths unchanged.

  Verified end to end: the built bin runs under **both node and bun**, produces
  byte-identical Swift and Kotlin for both targets, and `check-bin-liveness` now
  covers it — the gate caught the new bin as uncovered and failed closed, which is
  what it exists to do. `publish.ts --dry-run` completes with all six included.

  Nothing is published by this change; it only makes publishing possible.

- `usePush()` now receives notifications with zero app wiring — the receipt half was the never-wired class. Swift: the no-arg `PyreonPushNotifications.start()` (called by the emit from `.onAppear` on the stable host) installs a container-owned `UNUserNotificationCenter` delegate — foreground presentation and taps land in `notificationReceived`, `requestAuthorization` drives `authorize`; `simctl push` exercises exactly this pipeline, credential-free. Kotlin: `rememberPyreonPushNotifications()` registers a NOT_EXPORTED BroadcastReceiver delivery seam on `PYREON_PUSH_ACTION` for the composable's lifetime (an FCM service forwards into the same seam). The APNs token and FCM transport stay app-wired via `start(register)` — the first start of either kind wins. (5abe7c4)
- A rocketstyle dimension written as an object of FUNCTIONS dropped every style, (97768d7)
  silently.

  rocketstyle takes ONE callback returning the whole map —
  `.sizes((t) => ({ small: { … } }))`. The per-value form,
  `.sizes({ small: () => ({ width: 120 }) })`, reads just as naturally and is a
  documented footgun (`anti-patterns.md` records that it "produces EMPTY
  dimension themes"), but the native emit reported nothing at all:
  `objectExprToStyleObject` returns `{}` for anything that is not an object
  literal, so the styles vanished without a diagnostic.

  A `size="large"` app therefore compiled, ran, and rendered unstyled.

  It now warns per dropped value, on both targets, naming the component, the
  dimension and the value — and quoting the correct shape, because a warning that
  names the problem without the fix just relocates the confusion. The component
  still emits and still applies its `.theme()` base: a dimension typo should not
  take the screen down, and the warning is what makes the loss visible.

  Found by writing the first rocketstyle app for a native target and reading the
  emit. Nothing had, which is why the capability matrix now carries a
  `Styling & design system` row at an R4 fraction of 0.0.

  Bisect-verified: removing the warning fails 3 of the 6 specs.

- coolgrid compiled on Kotlin and failed on Swift — the gate was wrong, not the emit. (5439bd3)

  The capability matrix's HEAVIEST row (Styling & design system, weight 6,
  fraction 0.2) noted that `styled()` / `Element` / `coolgrid` / `attrs` "have no
  native example at all". Nobody had measured whether they LOWER. Three of the
  four do.

  `coolgrid`'s Col emits `.frame(maxWidth: .infinity)` — valid SwiftUI that real
  device builds accept. But the Swift stub defined ONLY `frame(width:height:)`,
  with no flexible-frame overload, so the type gate rejected it with "extra
  argument 'maxWidth' in call". A working capability was being reported as broken.

  A stub NARROWER than reality manufactures failures — the third instance of that
  class in this arc, after the over-strict `PyreonPermissions` init and the
  entirely-absent `@AppStorage`. The tell here was the target asymmetry: Kotlin
  passed and Swift did not, for source that is correct on both.

  The stub now mirrors SwiftUI's real pair of `frame` overloads (fixed and
  flexible) rather than approximating one of them.

  Also measured, and asserted so the results do not have to be rediscovered:
  `Element` and `attrs()` lower cleanly on both targets; `styled()` on a RAW TAG
  does not lower and WARNS by name that only a canonical primitive may be wrapped
  — disclosed rather than silent, so it is asserted as a warning rather than
  treated as a defect.

  Bisect-verified: reverting the stub reproduces the exact
  `extra argument 'maxWidth' in call`. Full compiler suite 247 files / 2539 tests.

- The Swift gate REJECTED valid i18n source — a stub that was stricter than the runtime. (06c743d)

  `createI18n({ locale, messages })` — the two-argument form the docs show, and the
  common case — failed the required `Validate emitted Swift + Kotlin` gate with:

        error: missing argument for parameter 'fallbackLocale' in call

  The source was fine and the emit was fine. The STUB was wrong: it declared
  `fallbackLocale: String` (required) while the real `PyreonI18n` declares
  `fallbackLocale: String? = nil`. Two of the three legal call shapes were
  rejected; only the one that happened to pass a fallback got through.

  TARGET ASYMMETRY WAS THE DIAGNOSTIC. Kotlin's stub already had
  `val fallbackLocale: String? = null` and accepted the identical source. When one
  target rejects what the other accepts, the gate is the first suspect, not the
  emit — the same reasoning that found the coolgrid `frame` stub.

  Both drift directions are now locked in `stub-runtime-drift.test.ts`, which
  previously covered only one of them. Every existing assertion there checks
  REAL-RUNTIME ↔ EMIT ("the signature the emit depends on still exists
  upstream"). Nothing checked STUB ↔ REAL, and that gap admits two opposite
  failures:

        stub is a SUPERSET  → gate accepts an emit the real runtime rejects
                              (green PR, broken app — the masking direction)
        stub is a SUBSET    → gate rejects an emit the real runtime accepts
                              (valid source, failing build — this bug)

  The new locks assert DEFAULTED-ness specifically, on both targets, because that
  is the property that decides whether a call site is legal and it is invisible to
  a "does the symbol exist" check.

  Bisect-verified: reverting the stub fails the lock with
  `expected … to contain 'fallbackLocale: String? = nil'`, and reproduces the real
  symptom — 2 of 3 valid call shapes rejected by swiftc. Restored, 12/12 pass and
  all three shapes typecheck on both targets.

  SECOND INSTANCE, found the same way and fixed here too: `<Image>`.

  `ImageProps.fit` defaults to `"cover"`, which lowers to `.scaledToFill()`. The
  stub had the sibling `.scaledToFit()` but NOT `.scaledToFill()`, so every plain
  `<Image src alt />` — the most common usage of a canonical primitive — failed
  the required Swift gate on valid SwiftUI. Only `fit="contain"` (scaledToFit) and
  `fit="none"` (no modifier) got through; `cover`, `fill` and the default all
  failed. Kotlin accepted the identical source, the same diagnostic as above.

  Found while sweeping all fifteen canonical primitives' props against both
  targets — the highest-blast-radius surface there is, since a broken primitive
  affects every app. Worth recording that the sweep otherwise came back clean:
  Stack gap/padding/align/justify, Inline, Text weight/size/color, Heading, Button
  disabled/variant, Icon, Spacer, Scroll, Layer, Field, Toggle, Press onLongPress,
  Link and `accessibilityLabel` all compile on both targets.

  One correction to my own probe, recorded because it nearly became a false bug
  report: `<Toggle checked>` fails on both targets, but `ToggleProps` is
  `{ value, onChange, disabled? }` — there is no `checked` prop. With the real
  props it compiles fine on both (`Toggle(_:isOn:)` / `Switch(checked=…)`). I had
  guessed the prop name instead of reading the type. The residual — an UNKNOWN
  prop emits uncompilable output with no warning — is real but low severity: the
  build fails loudly and names the prop, and TypeScript rejects it on web.

  THIRD INSTANCE, and the one that turned a hand-found bug into a class-level
  guard: `useLoaderData`.

  `router-swift/Hooks.swift` declares THREE public hooks; the stub had two. So
  `const d = useLoaderData<U>()` — a shipped Phase-B6 feature — failed the
  required gate with "cannot find 'useLoaderData' in scope" on a valid emit, while
  Kotlin accepted it.

  Three subset-stub bugs found by hand in one arc, each surfacing only when
  someone happened to write the affected shape, is a pattern rather than three
  coincidences. The router hooks are a CLOSED SET declared in one file, so the
  drift test now enforces PARITY over the whole set instead of asserting hooks
  one at a time. A fourth omission fails with `stub is missing router hook(s):
<name>` rather than a swiftc error buried in a CI log. The parity test also
  guards itself — a regex that matched nothing would make it vacuously green,
  which is exactly the failure mode it exists to prevent.

  The `useParams` and `useLoaderData` WARNINGS were checked rather than assumed:
  `useParams` advises destructuring (`const { id } = useParams()`), and that
  advised form compiles on both targets. A warning that recommends a broken fix
  would be worse than no warning.

- Fix the Swift emit producing `ws.isConnected()` / `ws.lastMessage()` / (9154c8a)
  `ws.messages()` / `ws.error()` as CALLS — the runtime declares them as
  properties, so any component that READ a WebSocket field emitted
  uncompilable Swift ("cannot call value of non-function type"). Kotlin has
  had the read-field unwrap since the hook landed; Swift never did — invisible
  to the lowered-hooks typecheck matrix because its usage only ever sent.
  Found while device-proving the `useWebSocket` echo round trip.
- Typography theme tokens now lower: `defineTheme` gains `fontSize`/`fontWeight` groups (plural aliases `fontSizes`/`fontWeights`; canonical names mirror `@pyreon/ui-theme`), so `font-size: ${(t) => t.fontSize.display}` in a `styled()` template bakes into `.font(.system(size:))` / `fontSize = N.sp` instead of warn-dropping. Two gaps closed: the groups were absent from the resolver's alias table, and `collectTheme` hand-enumerated color/spacing/radius so app-declared entries in any OTHER group were silently discarded before merge — it now accumulates generically over whatever the theme parser returns. (cb5dff3)
- Non-hook exports from web-only modules failed both targets with no warning. (5439bd3)

  The hook arc keys on `/^use[A-Z]/`, so plain exports fell straight through:

      s                  from @pyreon/validate     ✗ both targets, 0 warnings
      pipe / map         from @pyreon/rx           ✗ both targets, 0 warnings
      createPermissions  from @pyreon/permissions  ✗ both targets, 0 warnings

  while `useQuery` — the same kind of import, right next to them — warned
  properly. Same silent-build-failure class the hook arc exists to eliminate,
  just outside its name filter.

  Scoped to NON-HOOK imports, which avoids double-warning AND handles partial
  support: `usePermissions` genuinely lowers (verified) while
  `createPermissions` does not.

  Per-EXPORT, not per-package, and that distinction was earned the hard way. The
  first version warned on any import from `@pyreon/rx` — but the NAMESPACE form
  (`import { rx } from '@pyreon/rx'`, then `rx.filter` / `rx.map`) genuinely
  lowers, and the blanket warning broke that existing lock. I had probed `pipe`
  and `map`, seen both fail, and generalised to the package: two probes are not a
  package. The existing rx-lowering suite caught it.

  Every entry was MEASURED. `@pyreon/url-state` and `@pyreon/toast` look like
  candidates but already warn through other paths, and `@pyreon/state-tree`'s
  `model()` lowers cleanly — none is listed, and the tests assert that, because
  over-warning turns a diagnostic into noise people learn to ignore.

  Bisect-verified: 11 specs fail without the change. Full compiler suite 246 files
  / 2520 tests, including the rx-lowering lock and the control-flow warning.

  A later sweep took the same probe to `@pyreon/core` and `@pyreon/reactivity` —
  the two most-used packages in the framework. Both are MOSTLY lowered, which is
  exactly why the gaps in them were invisible:

      reactivity   batch / untrack / effectScope              ✗ both targets
                   signal / computed / effect / onCleanup     ✅ lower
      core         lazy / cx / createUniqueId / splitProps    ✗ both targets
                   onMount / h / Show / For / Suspense        ✅ lower

  These two use an explicit `unsupported` DENY list rather than the `supported`
  allow list every other entry uses. That direction is forced: listing what IS
  supported here means enumerating almost the entire public surface of both
  packages, and anything missed false-warns on code in essentially every
  multiplatform component ever written — the `@pyreon/rx` over-generalisation
  above, at the worst possible scale. The guard tests (Show / For / Suspense /
  signal / computed / onMount must stay SILENT) matter more than the warning
  tests, and are written first for that reason.

  `splitProps` initially measured as "lowers" and does not: the probe imported it
  without using it, so nothing reached the emitter. That was the fourth probe of
  this shape to produce a false clean in this arc. Re-probed with the symbol
  genuinely used, it fails with `cannot find 'own' in scope`. Every row in the
  table above was re-measured the same way.

  `batch` is arguably STRIPPABLE rather than unsupported — SwiftUI `@State` and
  Compose `mutableStateOf` already coalesce writes within one action, so the
  wrapper is a no-op on native. It warns rather than lowers here because that is
  an emit change with an open return-value question (`batch(() => x)` yields `x`
  on web), and shipping a warning today beats shipping a wrong lowering.

- `<Video src autoPlay? loop? muted? controls? onStatusChange?>` — the canonical video-playback primitive. Web `<video>` (playsinline, media events → `onStatusChange`); iOS `PyreonVideoPlayer` (AVKit `VideoPlayer` over `AVPlayer`, KVO `timeControlStatus` → the same `waiting`/`playing`/`paused` vocabulary); Android `PyreonVideoPlayer` (Media3 ExoPlayer in an `AndroidView`, `Player.Listener`). The create-multiplatform Android template gains the media3 artifacts — and the okhttp artifact the runtime srcDir has required since the networking arc (absent from the template, masked because scaffolds install the runtime from npm, which lagged the workspace; the next release would have shipped scaffolded Android apps uncompilable). (5ca9b4c)
- `useMap` had no web half, `map.moveTo(…)` did not compile on iOS, and the compiler advertised a field the runtime does not have. (f7541e0)

  Three defects, found by writing the component an author would write and checking
  BOTH targets.

  **1. No web half (`@pyreon/hooks`).** PMTC lowers `useMap()` to
  `PyreonMapState` on both native targets. The web half did not exist, so
  `import { useMap } from '@pyreon/hooks'` compiled for two targets and was
  unresolvable on the third — the fourth hook in this arc with that gap, after
  `useGeolocation`, `useDatabase` and `useWebSocket`. The compiler's own
  `lowered-hooks-typecheck` fixture already writes that import.

  The web half is STATE, not a renderer, exactly as `PyreonMapState` is: camera,
  markers, selection, nothing else. So it needs no mapping library and imposes no
  choice of one — feed `map.camera` / `map.markers` to Leaflet, MapLibre, Google
  Maps or an `<svg>`. Semantics are copied from the native container including the
  parts easy to get subtly wrong, each locked by a test: `addMarker` upserts by id
  and PRESERVES list position; `removeMarker` clears a selection pointing at it;
  `moveTo` keeps the current zoom when omitted (via `??`, since `||` would drop a
  legitimate zoom of 0); `selectedMarker` is DERIVED, never stored.

  **2. `map.moveTo(…)` and `map.removeMarker(…)` did not compile on Swift**
  (`@pyreon/native-compiler`). Swift labels arguments, the shared TS surface is
  positional, and the generic emit is positional — so the primary map API failed
  with `missing argument labels 'latitude:longitude:' in call`. Kotlin accepted
  the identical source, since named arguments are optional there.

  This is the SAME defect #2514 fixed for `PyreonDatabase`, which was fixed in a
  database-shaped way and so left every other service exposed. Rather than add a
  second special case, the table is now per-service-kind with full-positional
  labels — the database table's "labels after a leading unlabelled argument" shape
  cannot express `moveTo`, whose FIRST argument is labelled.

  Scope was ENUMERATED, not guessed: every `public func` in runtime-swift with a
  labelled parameter was listed, then each probed for reachability from the hook
  surface. `PyreonGeolocation.update` and the `PyreonWebSocket` internals are not
  on it, `selectMarker(_ id:)` is unlabelled natively, and `PyreonSecureStorage`
  is not lowered at all — so map was the only remaining reachable gap.

  **3. The service-optional table was wrong in BOTH directions.**

  A PHANTOM entry and a MISSING one, from the same mistake seen from opposite
  sides: the table was written from a pattern rather than from the runtimes.
  `{map.error}` failed swiftc with `value of type 'PyreonMapState' has no member
'error'`. That entry was added in #2566 by generalising "every service container
  has an optional `error`" across the services without checking each runtime —
  my own over-generalisation, the same mistake documented for `@pyreon/rx`.
  `PyreonMapState` holds camera/markers/selection, performs no I/O and cannot
  fail. The entry is removed rather than the field added: an always-nil `error` on
  a container that cannot fail is dead surface, and if map gains I/O the field
  should arrive with the failure it reports. The web half has no `error` either,
  for the same reason.

  Bisect-verified: reverting the label path fails the three map specs while all
  four guards — unlabelled `selectMarker`, the over-long-call fallthrough, the
  unchanged database output, and Kotlin — stay green, proving they do not pass
  merely because of the fix. Verified end to end: the natural component compiles
  clean on both targets with zero warnings.

  The hooks manifest enumeration was also stale — bumped to 48 for
  `useGeolocation` without naming it — so both data hooks are now named.

  The MISSING half, found while auditing `useAuth`: `PyreonAuth` declares
  `error: Error?` (Swift) / `Throwable?` (Kotlin), and `auth` had no entry — so
  `{auth.error}` COMPILED and rendered `Optional("boom")` at runtime. Silent, and
  invisible to a typecheck gate by construction, which is why #2566 missed it
  while claiming to have covered "every optional field of every service
  container". That claim is corrected in the test file rather than quietly
  dropped.

  Sharp edge worth recording: before this fix the bare read rendered wrongly AND
  the workaround an author reaches for first, `{auth.error ?? ''}`, does not
  compile — Swift's `Error?` cannot be coalesced with a String. So both the
  natural form and its obvious repair were broken.

  Two residuals, stated rather than left to be discovered: `{auth.error ?? ''}`
  still fails (loudly — the coalesce path does not consult the field table), and
  `{auth.user?.name}` still renders `Optional(…)` because a nested optional CHAIN
  is not a direct service-field read. `{auth.user?.name ?? ''}` works. Neither is
  silent-and-wrong in the way `{auth.error}` was.

## 0.2.0

### Minor Changes

- [#1544](https://github.com/pyreon/pyreon/pull/1544) [`7c47672`](https://github.com/pyreon/pyreon/commit/7c47672dd27274ba39fcca2d8d54740db6376f66) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Real `<Suspense>` and `<ErrorBoundary>` semantics on iOS + Android (was an inert pass-through). Both now compile to an INLINE conditional read in the component body — Swift `Group { if <pending/errored> { fallback } else { children } }`, Kotlin `if (<pending/errored>) { ... } else { ... }` — where the condition ORs every `useFetch` container's `isPending` (Suspense) / `error` (ErrorBoundary) in that component: Suspense holds its fallback until the fetched data settles; ErrorBoundary swaps to its fallback when a container rejects (the realistic native error surface — SwiftUI/Compose have no try/catch around view construction). The inline read is load-bearing — it must live in the component's own `body` so SwiftUI Observation / Compose recomposition tracks it (the earlier child-wrapper-struct approach passed the flag as an arg and didn't track). Device-found: a fetch-bearing component's Swift body is now wrapped in a concrete `ZStack` so the mount-time `.task` attaches to a stable-identity host — on a transparent `Group`, SwiftUI redistributes `.task` onto the if/else branch and cancels+restarts it on every flip, so the fetch never settles. Device-proven via the tasks Lifecycle screen (good-fetch content + failed-fetch fallback both render on a real Simulator).

## 0.1.0

### Minor Changes

- [#1526](https://github.com/pyreon/pyreon/pull/1526) [`099f574`](https://github.com/pyreon/pyreon/commit/099f5746a8069326e9dccf5c46c405afa2220e46) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multiplatform `useFetch` lands end-to-end. `@pyreon/hooks` gains the web half — a thin reactive JSON fetch (`{ data, error, isPending, refetch }` signals) matching the contract PMTC compiles to native `PyreonFetch` containers; abort-safe on refetch/unmount (stale responses can never clobber fresh ones). Native compiler: `??` nullish coalescing lowers to Swift `??` / Kotlin Elvis `?:`; fetch-field call reads (`quotes.data()`) rewrite to property/`.value` reads; computeds over fetch data infer the decoded type (was `Any`); synthesized Kotlin data classes carry `@Serializable` (inline object types in fetch generics previously failed real kotlinx-serialization builds); `<Text>`/`<Heading>` thread `data-testid` to `.accessibilityIdentifier` / `Modifier.testTag` on BOTH targets (third instance of the device-found tag-drop class — the Android tasks Espresso failure's root cause).
