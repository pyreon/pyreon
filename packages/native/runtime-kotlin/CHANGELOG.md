# @pyreon/native-runtime-kotlin

## 0.51.0

### Minor Changes

- [#2569](https://github.com/pyreon/pyreon/pull/2569) [`ed5eff8`](https://github.com/pyreon/pyreon/commit/ed5eff8fd3c22c0b89a03218ca9b8adfcb168d61) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `geo.start()` compiled on iOS and web and failed to build on Android.

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

- [#2608](https://github.com/pyreon/pyreon/pull/2608) [`9590027`](https://github.com/pyreon/pyreon/commit/9590027d8358321a0509b9cbb87d7f30858db442) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useFieldArray` lowers to native on both targets — dynamic form lists with
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

- [#2633](https://github.com/pyreon/pyreon/pull/2633) [`d62ce1a`](https://github.com/pyreon/pyreon/commit/d62ce1a1fe58e60a1f2305f021e0f6666f7b3e0b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Give `useOnline()` a real connectivity monitor on Android, and make the database presence check compile.

  - **`useOnline()` on Android reported `true` forever.** `PyreonNetworkStatus` shipped as a pure state container defaulting to online, with a `start(register)` seam for the app to wire its own `ConnectivityManager.NetworkCallback` — and nothing wired it, so the hook could not report the device's real state no matter what the radios did. A new `rememberPyreonNetworkStatus()` self-installs a real callback (seeded from the current state, torn down on leave, degrading to the optimistic default if `ACCESS_NETWORK_STATE` is missing rather than crashing). An app that wants different semantics still calls `start()` with its own registrar. Same shape as the geolocation registry fix: a default that requires a step nobody takes is not a default.
  - **`const found = db.get(c, id); if (found) { … }` compiled on neither target.** Reading a row and branching on whether it exists is the single most common database shape, and `db.get`'s optional record return had no inference model, so the condition emitted a bare optional — swiftc "optional type 'PyreonRecord?' cannot be used as a boolean", kotlinc "condition type mismatch". `database.get` now joins `SERVICE_METHOD_RETURNS`, which also gives Swift the `if let` binding so the body sees the unwrapped value.

  - **Compose state was written from background threads, crashing layout-heavy screens.** Android delivers `ConnectivityManager.NetworkCallback` on a binder thread and OkHttp delivers `WebSocketListener` callbacks on its reader thread. Both drive Compose `MutableState`, so both raced the UI thread's measure/layout and made Compose throw `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`. It is load-dependent, so it does not fail every run — it surfaced as a 10,000-row lazy-list test failing while nineteen siblings passed, in an app whose only change was adding `useOnline()`. Connectivity callbacks now register with a main-looper `Handler`, and the OkHttp transport hops every listener callback to the main thread. `PyreonGeolocationAndroid` already did this correctly; the two new call sites had simply diverged from it.

  The first two were found by writing the natural offline-first shape for the Offline/sync matrix row and bisect-verified on device. The threading bug was found BY the device gate; its WebSocket twin was found by auditing the same shape rather than by a failure of its own — no compile-level gate can see either, since the emitted Kotlin typechecks clean with the bug present.

- [#2608](https://github.com/pyreon/pyreon/pull/2608) [`9590027`](https://github.com/pyreon/pyreon/commit/9590027d8358321a0509b9cbb87d7f30858db442) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useSecureStorage` is real on all three targets — the encrypted secret store
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

### Patch Changes

- [#2700](https://github.com/pyreon/pyreon/pull/2700) [`a8c9fab`](https://github.com/pyreon/pyreon/commit/a8c9fab95521b62e60150a545d03a8bb645f3ec4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useAppState()` now observes the real app lifecycle with zero wiring — the third member of the never-wired class. Swift: the emit calls `PyreonAppState.start()` from `.onAppear` on the stable host (the UIApplication notification observers existed from inception; nothing called them). Kotlin: `rememberPyreonAppState()` installs a `LifecycleEventObserver` on the hosting Activity for the composable's lifetime (ON_RESUME/ON_PAUSE/ON_STOP → active/inactive/background). Both containers gain a sticky `wasBackgrounded` flag — the device-assertable end-state a frozen container can never reach.

- [#2706](https://github.com/pyreon/pyreon/pull/2706) [`8f3b127`](https://github.com/pyreon/pyreon/commit/8f3b12770c9d32829b93f7d71f822a8dee6c0d35) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A form `onSubmit` that references the form ITSELF — `onSubmit: () => form.setFieldValue('note', '')`, the "clear the field after submit" idiom — now compiles on Android. The Kotlin emit passed `onSubmit` as a constructor argument inside `remember { PyreonForm(…) }`, making the handler body a self-reference in the form's own initializer (`unresolved reference 'form'`), so the shape built on iOS and failed to compile on Android. The emit now assigns `form.onSubmit` after the declaration — mirroring what Swift already did from `.onAppear` — and `PyreonForm.onSubmit` becomes a settable `var`.

- [#2663](https://github.com/pyreon/pyreon/pull/2663) [`25b5f5a`](https://github.com/pyreon/pyreon/commit/25b5f5a2374c3a9cecabb478a8b1c2cf62d1d23c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useFetch(url, { method, headers, body })` now reaches the wire on iOS and
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

- [#2643](https://github.com/pyreon/pyreon/pull/2643) [`c8b0cca`](https://github.com/pyreon/pyreon/commit/c8b0ccac539c5037a7bf3bcaad1c990304caa24e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Move OkHttp WebSocket callbacks onto the main thread before they write Compose state.

  OkHttp delivers every `WebSocketListener` callback on its own reader thread, and those handlers drive `PyreonWebSocket`'s `MutableState` fields (`isConnected` / `messages` / `lastMessage` / `error`). Writing Compose state off the main thread races the UI thread's measure/layout, and Compose throws `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`.

  The race needs a callback to land while a frame is still laying out, so the same commit passes on one run and fails on the next — which is why it read as flake. It is not: `native-router-demo-android` calls `useWebSocket`, and its device gate fails on `tenThousandRowListIsLazyAndDeepRowReachable` (the frame most likely to still be laying out) with exactly that error.

  Every callback now hops to the main looper. `rememberPyreonGeolocation` already passed `Looper.getMainLooper()` to `requestLocationUpdates`; this call site had diverged from that pattern. No compile-level gate can catch the class — the emitted Kotlin typechecks clean with the bug present — so the device gate is the proof.

- [#2558](https://github.com/pyreon/pyreon/pull/2558) [`6378982`](https://github.com/pyreon/pyreon/commit/6378982b22c36ed50245bfde6b4698c57c923cf8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Make the native stack publishable — it was `private: true` while `pyreon new --native` shipped and advertised it.

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

- [#2686](https://github.com/pyreon/pyreon/pull/2686) [`5abe7c4`](https://github.com/pyreon/pyreon/commit/5abe7c4e70b43e0be30fb129ed0d77213a8c4678) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `usePush()` now receives notifications with zero app wiring — the receipt half was the never-wired class. Swift: the no-arg `PyreonPushNotifications.start()` (called by the emit from `.onAppear` on the stable host) installs a container-owned `UNUserNotificationCenter` delegate — foreground presentation and taps land in `notificationReceived`, `requestAuthorization` drives `authorize`; `simctl push` exercises exactly this pipeline, credential-free. Kotlin: `rememberPyreonPushNotifications()` registers a NOT_EXPORTED BroadcastReceiver delivery seam on `PYREON_PUSH_ACTION` for the composable's lifetime (an FCM service forwards into the same seam). The APNs token and FCM transport stay app-wired via `start(register)` — the first start of either kind wins.

- [#2697](https://github.com/pyreon/pyreon/pull/2697) [`5ca9b4c`](https://github.com/pyreon/pyreon/commit/5ca9b4c010049fb9a80efc3ccce68bcc61a8eb6c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Video src autoPlay? loop? muted? controls? onStatusChange?>` — the canonical video-playback primitive. Web `<video>` (playsinline, media events → `onStatusChange`); iOS `PyreonVideoPlayer` (AVKit `VideoPlayer` over `AVPlayer`, KVO `timeControlStatus` → the same `waiting`/`playing`/`paused` vocabulary); Android `PyreonVideoPlayer` (Media3 ExoPlayer in an `AndroidView`, `Player.Listener`). The create-multiplatform Android template gains the media3 artifacts — and the okhttp artifact the runtime srcDir has required since the networking arc (absent from the template, masked because scaffolds install the runtime from npm, which lagged the workspace; the next release would have shipped scaffolded Android apps uncompilable).
