# @pyreon/native-runtime-swift

## 0.52.0

### Minor Changes

- Add `useCrashReporter()` — cross-platform crash capture, persistence, and rehydration. Captures uncaught errors (web `window.onerror`/`unhandledrejection`, iOS `NSSetUncaughtExceptionHandler`, Android `Thread.setDefaultUncaughtExceptionHandler` chaining to the previous handler), persists the report (localStorage / Application Support / app files dir), and rehydrates the previous session's report on the next launch — the credential-free half of crash reporting. The vendor transport (Sentry, a custom endpoint) is app-wired via `setCrashTransport` / `PyreonCrashTransportRegistry`, so the framework never fakes an upload. `useCrashReporter()` lowers to both native targets (SwiftUI + Compose); the Android factory self-installs a file-backed backend so the report survives the crash it reports. Signal crashes (iOS) and NDK crashes (Android) are disclosed out of v1 scope. (c4c2d52)
- Co-locate the @pyreon/hooks native runtimes (Batch 3). (84e7444)

  Moves 21 hook service runtimes (AppState, Auth, Biometrics, Clipboard,
  CrashReporter, Database, Fetch, FilePicker, Geolocation, Haptics, ImagePicker,
  Linking, MapState, NetworkStatus, Notifications, Payments, PushNotifications,
  Share, VideoPlayer, WebSocket, WebView + their Android/OkHttp variants — 28
  Kotlin, 21 Swift files) out of the monolith into @pyreon/hooks/native, using the
  per-service-group gate from the storage batch: 20 kotlinServices groups (each
  under its own --service stub bundle; the 6 hooks with base dependencies —
  Auth→PyreonHttp, CrashReporter→StorageBackends+Json, Database/Fetch/WebView→Json,
  Geolocation→StorageBackends — reference the retained monolith primitives via
  @base/ companions). WebView's Kotlin is device-only (android.webkit was never
  stub-covered in the monolith).

  The monolith now holds ONLY the framework-base runtimes (Reactivity, Tokens,
  ViewModifier, Json, Assets, Http/OkHttp, StorageBackends). All 10 native example
  apps gain the @pyreon/hooks/native source root.

  Follow-up: the monolith's Swift hook-logic tests are removed here (the Kotlin
  tests moved with their runtimes and run in the co-source gate; the Swift side is
  typecheck + device-verified) — relocating them as co-located @main programs is a
  tracked follow-up.

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

### Patch Changes

- `@pyreon/a11y`'s `announce(...)` works on iOS + Android, and its native runtime is **co-located in the package** (`@pyreon/a11y/native/{swift,kotlin}/`) — the per-package architecture, not the monolithic `@pyreon/native-runtime-*`. (02c2bd9)

  **Runtime (co-located) — `PyreonA11y`:**

  - Swift: `announce(_:assertive:)` posts a VoiceOver announcement (`UIAccessibility.post(.announcement)`), raising the iOS 17+ speech priority when `assertive`.
  - Kotlin: `announce(message, assertive)` routes to a registered announcer (`PyreonA11y.setAnnouncer { rootView.announceForAccessibility(it) }`), the "Android needs a host" seam — a safe no-op before wiring.

  Ships in `@pyreon/a11y/native/`, declared via the `pyreon.native` field, so `pyreon-native wire` aggregates it from the installed package. The co-source verify gate (`scripts/check-native-cosource.ts`, wired into native-validate CI) compiles + smoke-runs it against the stub harness — the Kotlin announcer seam is asserted, the Swift wrapper typechecks.

  **Lowering:** `announce("m")` → `PyreonA11y.announce("m", assertive: false)`; `announce("m", { politeness: 'assertive' })` → `assertive: true`. Message is any expression; a renamed import (`announce as say`) is handled. A new `announce-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/a11y` import) + both emits + the `expr-utils` walkers + `infer-type`.

  The **DOM-based helpers stay web-only** — `VisuallyHidden` / `LiveRegion` / `SkipLink` / `createA11yId` still warn (per-export, `announce` excepted).

  Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonA11y` stubs on swiftc + kotlinc); `native-a11y.test.ts` 7 cases + the co-source gate. Full native-compiler suite 2818 pass (fixing two tests that had encoded the old "announce warns" behavior). No device proof yet; `politeness` isn't distinguished on Android.

- Add the `repository` field npm provenance requires. All six packages were (2b5be05)
  rejected from the 0.51.0 release with a 422 (`"repository.url" is "",
expected to match "https://github.com/pyreon/pyreon"`) — `--provenance`
  publishing validates the field against the OIDC attestation, so its absence
  is a publish blocker, not cosmetic metadata.
- Native-source resolve-and-scan toolchain — the monorepo Gap-1 fix, and the keystone for per-package native co-location. (ff73c97)

  The scaffold hard-coded the native runtime location into the app build (iOS `project.yml` `packages:` and Android Gradle `srcDir` both pointed at a fixed `../node_modules/@pyreon/native-runtime-*` path). npm/yarn HOISTING and pnpm's symlinked store both break that: in a monorepo the runtime is usually installed at the workspace root, not the app's local `node_modules`, so the fixed path dangles and the build cannot find the runtime sources.

  `@pyreon/native-cli` gains a `wire` command and a resolver:

  - `resolveNativeSources(appDir)` walks the app's declared `@pyreon/*` deps and resolves each one's install location by walking `node_modules` upward — the same algorithm Node's resolver uses, so it is hoisting- and pnpm-symlink-safe.
  - Each package declares its native sources via a `pyreon.native` field in `package.json`, or the zero-config default dirs `native/swift/` and `native/kotlin/`. The four base runtime/router packages now declare the field pointing at their existing `Sources/PyreonRuntime` / `Sources/PyreonRouter` / `src/main/kotlin` layout, so they resolve through the SAME convention as a co-located feature package — no name-based special-casing. This is what makes per-package native co-location possible: a feature package can ship `native/{swift,kotlin}/` and it aggregates into the app build with zero config, and a third-party package opts in by declaring the field.
  - `pyreon-native wire [--app=<dir>] [--android-out=<file>] [--json]` emits the resolved build wiring: the Gradle srcDirs list (base runtime/router + every co-located feature `native/kotlin/`, deduped, absolute), the iOS SwiftPM package paths (resolved absolute), and the co-located Swift target sources grouped by module. A DECLARED-but-missing native dir is surfaced as a broken declaration (exit 2).

  Scaffolded Android apps now resolve their Kotlin source roots through this: `scripts/build-android.sh` runs `pyreon-native wire --android-out=android/app/pyreon-native.srcdirs` after the emit (before Gradle configures), and `build.gradle.kts` prefers that resolved list, falling back to the legacy fixed `node_modules` paths for a flat layout. Existing flat apps are unaffected; monorepo apps now build.

  iOS co-location target wiring (compiling co-located feature `native/swift/` into the runtime target) is a follow-up that pairs with relocating the first feature runtime; the base Swift packages already resolve through `wire` today.

- `@pyreon/toast` works on iOS + Android — and its native runtime is **co-located in the package** (`@pyreon/toast/native/{swift,kotlin}/`), the per-package architecture rather than the monolithic `@pyreon/native-runtime-*`. This is the first package to prove that model end-to-end. (5fc3b9f)

  **Runtime (co-located) — `PyreonToast`** (Swift `@Observable` singleton / Kotlin `object`): a process-global observable queue (add/dismiss/remove/clear), newest-last, distinct monotonic ids, a bounded stack (drops the oldest past `maxToasts`), and an auto-dismiss timer. It ships in `@pyreon/toast/native/`, declared via the package.json `pyreon.native` field, so `pyreon-native wire` aggregates it into a native app build straight from the installed package — no monolith, native tree-shakes to what you import, and a third-party package can follow the same convention.

  **Co-source verify gate** (`scripts/check-native-cosource.ts`, wired into the native-validate CI job): scans every package's `pyreon.native` sources and compiles + smoke-runs them against the stub harness (Kotlin via `verify-kotlin --source`, which gained a path override; Swift via `swiftc -parse-as-library` + run), so a co-located `.swift`/`.kt` can't rot silently now that it lives outside `@pyreon/native-runtime-*`'s own `src/`. Toast's queue behavior is unit-tested this way on both toolchains.

  **Lowering:**

  - `toast("msg")` → `PyreonToast.shared.add("msg", type: "info")` (Swift) / `PyreonToast.add("msg", "info")` (Kotlin). The message is any expression; a renamed import (`toast as notify`) is handled; a literal `{ duration }` (ms → the auto-dismiss; `0` = persistent) lowers.
  - Preset methods `toast.success/error/warning/info/loading("msg")` select the type.
  - `<Toaster />` → a native overlay iterating the reactive queue.

  A new `toast-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/toast` import) + both emits + the `expr-utils` walkers + `infer-type`. Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonToast` stubs on swiftc + kotlinc); `native-toast.test.ts` 7 cases + the co-source gate.

  **v1 scope (disclosed):** message + preset type + literal `duration` lower; the other options (`onDismiss`/`description`/`icon`/`action`) are dropped, and `toast.promise()` / `toast.update()` aren't lowered. `<Toaster />` is a minimal message stack (positioning/styling/animation are a follow-up). No device (Simulator/Emulator) proof yet — the runtime is unit-tested by the co-source gate and the emit is stub-typechecked.

- PyreonQuery — the native cached data-fetching runtime, the core of `useQuery` on iOS and Android. (9d40d85)

  The delta over `PyreonFetch` is exactly what a query library adds over a bare fetch: a **keyed cache with stale-while-revalidate**, so the same `queryKey` shared across screens serves instantly and refetches in the background.

  - `PyreonQueryCache` — a process-global cache shared across every `PyreonQuery` instance (two screens reading `["todos"]` hit the same entry). `invalidate(key)` + `clearAll()`. Swift: `@unchecked Sendable` + `NSLock`; Kotlin: `synchronized` `HashMap`.
  - `PyreonQuery<T>` (`@Observable` / Compose `MutableState`) with the web `useQuery` result contract: `data` (nil until first success), `error` (last failure, nil on success), `isPending` (true only when there is NO data yet AND a fetch runs — a background refresh does NOT flip it, so shown data never blanks), `isFetching` (any in-flight fetch), `refetch()`. `begin`/`resolve`/`reject` mirror `PyreonFetch`, so it drives from the compiler-emitted async harness; `resolve` writes through to the cache. Coroutine-free — the network call is injected — so it stays dependency-light and synchronously unit-testable with a stub fetcher.

  Both runtimes build + pass their unit tests (Swift `swift test`: 4 PyreonQuery cases; Kotlin `verify-kotlin --service=PyreonQuery`: typecheck + smoke) and join the per-service verify + service-coverage gates.

  Deferred (disclosed): mutations, infinite queries, prefetch, cross-instance invalidation, retries/backoff, persistence, and bounded cache eviction. The `useQuery` **compiler lowering** (emitting `PyreonQuery` from `useQuery(() => ({ queryKey, queryFn, staleTime }))`) is a tracked follow-up; until it lands, `useQuery` still warns as unsupported on native — this PR ships the runtime it targets.

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

### Patch Changes

- `useAppState()` now observes the real app lifecycle with zero wiring — the third member of the never-wired class. Swift: the emit calls `PyreonAppState.start()` from `.onAppear` on the stable host (the UIApplication notification observers existed from inception; nothing called them). Kotlin: `rememberPyreonAppState()` installs a `LifecycleEventObserver` on the hosting Activity for the composable's lifetime (ON_RESUME/ON_PAUSE/ON_STOP → active/inactive/background). Both containers gain a sticky `wasBackgrounded` flag — the device-assertable end-state a frozen container can never reach. (a8c9fab)
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
- `PyreonWebSocket.isConnected` now flips on the real handshake, not on `resume()`. (470af1d)

  `connect(to:)` called `opened()` immediately after `task.resume()`, which only means the connection was _requested_. A socket pointed at a dead or unreachable server therefore read as connected, and any UI gating on `isConnected` showed a live connection that never existed. Kotlin has always flipped on OkHttp's real `onOpen`; this brings Swift to the same contract rather than documenting the difference.

  The flag is now driven by a `URLSessionWebSocketDelegate` (`didOpenWithProtocol` / `didCloseWith`). The delegate is a separate object because `URLSession` retains its delegate — making the `@Observable` container itself the delegate would create a cycle it could not break — and it is released alongside the session in `close()`.

  A pre-existing lifecycle test asserted the old behaviour with the comment _"opened() fired optimistically on resume"_, so it could never have caught this. Its real invariant (the connect/close lifecycle and its idempotency) is unchanged; only that one assertion moves to the corrected truth.

- `<Video src autoPlay? loop? muted? controls? onStatusChange?>` — the canonical video-playback primitive. Web `<video>` (playsinline, media events → `onStatusChange`); iOS `PyreonVideoPlayer` (AVKit `VideoPlayer` over `AVPlayer`, KVO `timeControlStatus` → the same `waiting`/`playing`/`paused` vocabulary); Android `PyreonVideoPlayer` (Media3 ExoPlayer in an `AndroidView`, `Player.Listener`). The create-multiplatform Android template gains the media3 artifacts — and the okhttp artifact the runtime srcDir has required since the networking arc (absent from the template, masked because scaffolds install the runtime from npm, which lagged the workspace; the next release would have shipped scaffolded Android apps uncompilable). (5ca9b4c)
