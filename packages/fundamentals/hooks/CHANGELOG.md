# @pyreon/hooks

## 0.52.0

### Minor Changes

- [#2766](https://github.com/pyreon/pyreon/pull/2766) [`c4c2d52`](https://github.com/pyreon/pyreon/commit/c4c2d5232856e31b733dbc992ea8cbb37201f53f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useCrashReporter()` — cross-platform crash capture, persistence, and rehydration. Captures uncaught errors (web `window.onerror`/`unhandledrejection`, iOS `NSSetUncaughtExceptionHandler`, Android `Thread.setDefaultUncaughtExceptionHandler` chaining to the previous handler), persists the report (localStorage / Application Support / app files dir), and rehydrates the previous session's report on the next launch — the credential-free half of crash reporting. The vendor transport (Sentry, a custom endpoint) is app-wired via `setCrashTransport` / `PyreonCrashTransportRegistry`, so the framework never fakes an upload. `useCrashReporter()` lowers to both native targets (SwiftUI + Compose); the Android factory self-installs a file-backed backend so the report survives the crash it reports. Signal crashes (iOS) and NDK crashes (Android) are disclosed out of v1 scope.

- [#3652](https://github.com/pyreon/pyreon/pull/3652) [`a156c40`](https://github.com/pyreon/pyreon/commit/a156c4069ad6882d9e402efa552566dd5714b94d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hardening pass across five fundamentals packages. Behaviour changes are marked **(behaviour)**.

  **@pyreon/hooks**

  - **(behaviour)** Hook teardown is now owned by the component. Every hook registered its cleanup with `onCleanup` from `@pyreon/reactivity`, which only registers inside an effect run: a root-mounted component never cleaned up (the GPS watch, socket, window listeners and speech kept running after unmount), and a component inside a `<For>` / `<Show>` / routed page had its cleanup tied to that boundary's effect — adding one `<For>` row tore down the resources of every row that stayed. Teardown now runs exactly when the component unmounts.
  - `useGeolocation`: a TIMEOUT / POSITION_UNAVAILABLE error no longer drops the watch id (which left GPS on after unmount and let a retry open a second watch). Only a permission denial ends the watch, and it is cleared explicitly.
  - **(behaviour)** `useEventListener`: a `target` that is `null` at setup (a ref) is resolved at mount instead of silently falling back to `window`; if it is still `null`, nothing is bound and a dev warning fires. `target` may also be an `EventTarget` directly.
  - `useTimeAgo`: a reactive date getter is tracked, so a change re-renders immediately and restarts the timer. **(behaviour)** The "just now" bucket goes through a custom `formatter` as `(0, 'second', isPast)`.
  - `useSpeech`: only the hook's own current utterance drives `speaking()` (a replaced utterance's late `onend` no longer flips it off mid-speech), and **(behaviour)** `stop()` / unmount only cancel speech this hook started.
  - `useNotifications`: when the `Notification` constructor throws (Android Chrome), falls back to the service-worker registration's `showNotification`; `notify()` on a platform without the API warns in dev.
  - **(behaviour)** `useClickOutside`: listens for a single `pointerdown` instead of `mousedown` + `touchstart`, which fired the handler twice per touch tap.
  - `useInfiniteScroll`: keeps loading while the sentinel stays visible after a page lands (a first page that does not fill the container no longer stalls), and does not start a second load while one is in flight.
  - **(behaviour)** `useLinking().openUrl` refuses `javascript:` / `data:` and any scheme other than http(s), mailto and tel (relative URLs allowed), with a dev warning.
  - `useIntersection` / `useElementSize`: the element getter is tracked from mount, so an element that appears after mount is observed.
  - `useMediaQuery` accepts a query getter and re-subscribes when it changes. `useKeyboard` gains `ignoreInputs`. `useWebSocket` gains `maxMessages`. `useScrollLock` compensates for the removed scrollbar and also locks `<html>` (iOS Safari).
  - **(behaviour)** `useFetch`: `isPending` starts `true` on the server as well, matching the client's first render (was a hydration mismatch).

  **@pyreon/a11y**

  - **(behaviour)** `announce()`: both regions are created on the first call and messages are written ~100ms later, so the first announcement lands in a region the screen reader has already seen; messages announced together are joined instead of overwriting each other.
  - `<LiveRegion>`, `<VisuallyHidden>` and `<SkipLink>` no longer freeze reactive props at setup. `<LiveRegion>` accepts accessors for `politeness` / `atomic` / `role` / `visible`, and toggling `visible` restyles the region instead of remounting it.
  - **(behaviour)** `<SkipLink>` handles the jump itself (focus + scrollIntoView) and cancels the default hash navigation, which a hash-mode router read as a route.
  - `<RouteAnnouncer>` warns in dev when `<RouterView>`'s built-in announcer is also active. `createA11yId`'s docs no longer claim server/client ids always match.

  **@pyreon/toast**

  - **(behaviour)** A duration a timer cannot hold (`Infinity`, above 2^31-1 ms, `NaN`, negative) is treated as persistent — it used to overflow and dismiss the toast after ~1ms.
  - **(behaviour)** `toast()` is a no-op on the server (dev warning): the store is process-wide, so a server-side toast leaked into other requests.
  - **(behaviour)** An action's `onClick` receives `{ id, dismiss }`.
  - A second mounted `<Toaster>` warns in dev; a Toaster's `duration` default is restored on unmount; the Toaster now removes its portal host and visibility listener on unmount. Animations respect `prefers-reduced-motion`.

  **@pyreon/hotkeys**

  - A keydown without a `key` (Chrome autofill) no longer throws out of the shared listener; IME composition keystrokes never fire shortcuts; input detection uses `composedPath()[0]` so inputs inside a shadow root are recognised; `alt+<letter/digit>` matches on macOS via `event.code`.
  - `useHotkey`'s `target` may be a ref / getter, resolved at mount and tracked afterwards.

  **@pyreon/virtual**

  - **(behaviour)** Options are read once per pass and REPLACE the previous options, so a key you stop returning falls back to TanStack's default instead of lingering. `useVirtualizer` warns in dev when `getScrollElement()` is still `null` after mount.

- [#2845](https://github.com/pyreon/pyreon/pull/2845) [`1275e17`](https://github.com/pyreon/pyreon/commit/1275e1726fed67b467377db956fda44827161589) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useDeviceInfo` — describe the device from one call on web, iOS and Android.

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

- [#2827](https://github.com/pyreon/pyreon/pull/2827) [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useBluetooth` — BLE discovery on web, iOS and Android from one source

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

- [#2795](https://github.com/pyreon/pyreon/pull/2795) [`84e7444`](https://github.com/pyreon/pyreon/commit/84e7444cbde8b3f0259a1bdc91674d893d19d26c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Co-locate the @pyreon/hooks native runtimes (Batch 3).

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

- [#3755](https://github.com/pyreon/pyreon/pull/3755) [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Finish the Kotlin `Int` to `Long` move for the runtime APIs emitted code reaches. `PyreonToast.maxToasts`, `PyreonSortable.moveIndex`, `PyreonRateLimit` delays and scheduler, `PyreonSizedMap` (`maxEntries`, `size`), `PyreonScreenOrientation.angle`, `PyreonStream` (`maxEvents`, reconnect `attempts`) and the chart web-view selection indices now use `Long`, and the emit adds the `L` suffix to the literals it passes them. `PyreonChartPoints` takes `Long` counts, which fixes a real `gradle assembleDebug` failure in every chart-bearing Android example. `syncedSignal` and `PyreonCrdtMap.set` now accept `Long` (a `Long` signal previously threw `unsupported value type`).

- [#2836](https://github.com/pyreon/pyreon/pull/2836) [`290a386`](https://github.com/pyreon/pyreon/commit/290a38675f6363ac6f8f8d24cab47a70ca081af9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lower `useDebouncedCallback` and `useThrottledCallback`

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

- [#2851](https://github.com/pyreon/pyreon/pull/2851) [`1612ed1`](https://github.com/pyreon/pyreon/commit/1612ed15b80c220d049212b0f62dabccb45aa9e9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `<Audio>` — sound playback on web, iOS and Android.

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

- [#2847](https://github.com/pyreon/pyreon/pull/2847) [`1025315`](https://github.com/pyreon/pyreon/commit/1025315701d7eb0a2bea2958252c3a0efda34b29) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useSafeArea` and `useScreenOrientation` — the display-environment pair,
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

- [#3119](https://github.com/pyreon/pyreon/pull/3119) [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Audio>` now builds. It emitted `AVFoundationAudioEngine()` on iOS and
  `Media3AudioEngine(…)` on Android, and both types — along with Android's
  `PyreonAudioPlayer` composable — existed ONLY in the validation stubs. The
  primitive had never compiled on either platform while both stub gates were
  green.

  Both engines now ship for real (AVPlayer and ExoPlayer, so remote `src` works
  and the audio and video halves share one dependency).

  A new gate asserts that every Pyreon-owned type a stub declares AND an emitter
  emits is also declared in that language's real runtime — the class that hid all
  three.

- [#3119](https://github.com/pyreon/pyreon/pull/3119) [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Audio>` now has a Compose implementation. It emitted `PyreonAudioPlayer(…)`
  on Android, and the only definition of that name anywhere was the kotlinc
  validation stub — so the emit passed the gate and referenced nothing in the real
  runtime. Swift has had one all along, so `<Audio>` built on iOS and could not
  have built on Android. No example uses it, which is why no device gate said so.

  `<Transition>` and `<Audio>` now also carry `data-testid` and the accessibility
  props, like every other primitive; both returned before the generic modifier
  tail.

  The completeness matrix that covers this now derives its list from the type
  files rather than hardcoding it — it listed 15 primitives where the types
  declare 18, which is how these two were missed.

- [#3119](https://github.com/pyreon/pyreon/pull/3119) [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Video controls={false}>` now hides the transport controls on iOS and Android.
  The prop was typed and documented on all three targets and honoured on none:
  neither native runtime took the parameter, and the Kotlin one hardcoded
  `useController = true`.

  Compose needed a parameter passed through to `PlayerView.useController`. AVKit's
  `VideoPlayer` always draws controls with no way to turn them off, so the Swift
  runtime gained an `AVPlayerLayer`-backed representable for the chrome-less case
  — same player, same lifecycle, no chrome.

- [#2840](https://github.com/pyreon/pyreon/pull/2840) [`e506bcf`](https://github.com/pyreon/pyreon/commit/e506bcf796a930094e5f5665b72e7efa4967a62c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useWakeLock` — keep the screen awake on web, iOS and Android from one call.

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

- [#3063](https://github.com/pyreon/pyreon/pull/3063) [`0cc9209`](https://github.com/pyreon/pyreon/commit/0cc9209a35e4ab9e73e849dd092ed654c2a56ed4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useFetch` accepts a promise source, so the documented multiplatform shape works on the web

  `@pyreon/native-compiler` documents `useFetch<T>(getUser({ params: { id: '1' } }))`
  as the crossing surface for `@pyreon/http` — it lowers to a native fetch of the
  templated URL, and the coverage registry lists it by name.

  An `@pyreon/http` endpoint CALL fires the request and returns a promise, while
  this hook took `url: string`. So on the web the documented shape did
  `fetch(String(promise))` — a request for the literal `[object Promise]`, which
  Chromium rejects with `InvalidStateError: Unknown request object` — and the
  endpoint's own rejection went unhandled, surfacing as an uncaught page error on
  every failed request.

  `useFetch` now adopts a promise source: the value lands in `data()`, a rejection
  lands in `error()`, and both settle in one batch like the URL path.
  `refetch()` warns rather than silently doing nothing, because a settled promise
  cannot be re-issued and the hook never held the URL that produced it.

### Patch Changes

- [#3759](https://github.com/pyreon/pyreon/pull/3759) [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useScreenOrientation()` / `useSafeArea()` compiled to `AndroidOrientationProbe(ctx)` / `AndroidSafeAreaProbe(ctx)` (Kotlin) and `UIKitOrientationProbe()` / `UIKitSafeAreaProbe()` (Swift), but no runtime file defined any of the four — they existed only in the validation stubs, so any app using either hook failed to build against the real SDK while every stub gate stayed green. The real probes now ship in `@pyreon/hooks` native (`PyreonSafeAreaAndroid.kt`, `PyreonSafeAreaUIKit.swift`): read-through, dp/points, orientation angle matching `screen.orientation.angle`, and on Android reactive via a `RememberObserver` (config callback + layout listener) so no emit change was needed. The Kotlin stubs now mirror the real constructor type. `emitted-runtime-types-exist` now also checks `Android*`/`UIKit*` probe names; nine other phantom probes it surfaced are pinned in a ratchet list that can only shrink.

- [#3192](https://github.com/pyreon/pyreon/pull/3192) [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Three defects found auditing the changes since 0.51.0.

  **`safeRedirectLocation` failed open to an open redirect and to `javascript:`
  XSS.** The guard classified the RAW target while a browser classifies a
  PREPROCESSED one, and the gap is one character wide. The WHATWG URL parser
  strips leading/trailing C0 controls and space, and removes ALL ASCII tab and
  newline from anywhere in the input; `String.prototype.trim()` covers the first
  only partially and the second not at all, because that character sits in the
  middle. So `"/<TAB>/evil.example"` was classified `internal` and resolves to
  `https://evil.example/`, and `"java<TAB>script:alert(1)"` was classified
  `internal` and resolves to a live `javascript:` URL — both verified against the
  platform's own URL parser, which is the oracle the regression test uses. The
  `internal` branch also returned the ORIGINAL string rather than the one it had
  inspected, so even a correct verdict handed back bytes that produce a different
  one. The target is now normalised the way the parser does, before classifying,
  and the normalised value is what ships.

  **`@pyreon/lathe`'s YAML reader replaced an object's prototype instead of
  setting a key.** Both mapping paths assigned `map[key] = value`, and for
  `__proto__` that runs the inherited accessor: the key vanishes from the parsed
  document while its value's properties leak into every later member read on that
  object. A spec reaches this parser over the network — `lathe pull <url>` fetches
  one and writes it to disk — and the IR it produces is what the emitters turn
  into source, so a silently-dropped field is a missing field in a generated
  client and a silently-added one is a generator input nobody wrote. The `.json`
  half of the same reader was always correct, because `JSON.parse` defines the
  property rather than assigning it; the two formats disagreed about the same
  document. Fixed by doing what `JSON.parse` does.

  **The three file pickers leaked their `<input>` when neither `change` nor
  `cancel` fired.** `useCamera` / `useFilePicker` / `useImagePicker` each appended
  a hidden input to `document.body` and removed it inside `settle`, under a
  comment promising that "a browser that fires neither event must not leak the
  node". The `settled` flag cannot provide that: with no event `settle` never
  runs, so neither does `input.remove()`, and the document then holds the node,
  its listeners and the `resolve` closure for the life of the page — once per
  pick, unbounded. `cancel` is the event that would have fired, and the same
  comments describe it as "not universal across older browsers". The three
  implementations were byte-identical and are now one helper, whose `onCleanup`
  settles any pick still open when the component unmounts.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The framework-wide colour mode now reaches the rest of the framework.

  - **`@pyreon/core`:** `useProvidedColorMode()` returns the mode an app explicitly set (`<PyreonUI mode>` / `<ColorModeProvider mode>`), or `undefined` when none did. It is for components whose own default is not "follow the system", so adopting the shared mode never flips them on a page that never asked.
  - **`@pyreon/flow`:** with no `colorMode`, a flow takes the app's colour mode, and is still light when the app set none. An explicit `colorMode` still wins.
  - **`@pyreon/code`:** an editor created without a `theme` follows the app's colour mode once mounted in `<CodeEditor>`, live. An explicit `theme` still wins, and with no app mode the default is still light.
  - **`@pyreon/zero`:** the theme now also declares the CSS `color-scheme` on `<html>`, beside `data-theme`, in `setTheme`, on setup and in the pre-paint script. Native form controls and scrollbars follow it, and so does the shared colour mode, so a zero theme toggle reaches flow and the code editor with no wiring. **`themeScriptCspHash` changed with the script:** an app that pinned the old hash in its own `Content-Security-Policy` header must take the new value.
  - **`@pyreon/native-compiler`:** `useColorMode()` lowers to the platform scheme read, exactly as `useColorScheme()` does.
  - **`@pyreon/hooks`:** `useColorScheme()`'s docs point to `useColorMode()` for theming; it reads the OS only.

- [#2799](https://github.com/pyreon/pyreon/pull/2799) [`215768a`](https://github.com/pyreon/pyreon/commit/215768ae52a01c22d4c6a428b5e62c8a6e83a6eb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - restore `@pyreon/hooks` to its coverage thresholds (source changes are comments only)

  `Coverage (Full)` had been red on every push to main. `@pyreon/hooks` measured
  98.95% statements / 96.29% branches against configured 99 / 98 — thresholds set
  in [#1611](https://github.com/pyreon/pyreon/issues/1611) and never lowered, so the coverage had drifted down as the
  native-colocation hooks landed without matching tests.

  The real gap was that `useFetch` had **no test file at all**, including for the
  contract its own JSDoc documents: "each `refetch()` aborts the previous in-flight
  request, so a slow stale response can never clobber a fresh one" — leak class F,
  untested. Now covered, along with a server-initiated `useWebSocket` close (the
  fake's `close()` never fired `onclose`, so a dropped connection was untested
  while the fake looked faithful) and a `useDatabase` cold read in a
  blocked-storage context.

  One `v8 ignore` was factually wrong and is corrected: it claimed
  "happy-dom has no checkVisibility" and sat on `useFocusTrap`'s
  `checkVisibility` branch. happy-dom reports
  `typeof el.checkVisibility === 'function'` (measured), so the ignore was
  excluding covered code while the genuinely-unreachable fallback counted against
  coverage. The ignore now sits on the fallback.

  Remaining ignores are the `isServer` / `isClient` module-load env guards, whose
  false side cannot be reached without mocking `@pyreon/reactivity` — the same
  justification the package already used for `useDatabase`'s server arm.

  No runtime behaviour changes: every source edit in this changeset is a comment.

- [#3501](https://github.com/pyreon/pyreon/pull/3501) [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native `PyreonWebView` (Swift + Kotlin) speaks the `<WebView>` host-group protocol: reserved join/leave/relay messages are consumed before `onMessage`, and a relay is evaluated into every sibling WebView of the same group. Members are held weakly and removed by identity on leave, dismantle/release and deinit.

- [#3382](https://github.com/pyreon/pyreon/pull/3382) [`9b1b20a`](https://github.com/pyreon/pyreon/commit/9b1b20ad8b5deb842079927bba39068749757cc6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useWakeLock`, `useAudioRecorder` and `useDeviceMotion` now release what they acquired when the acquisition settles AFTER the owning scope disposed (or after `release()`/`stop()` ran). Previously an unmount during the permission prompt left the screen lock held, the microphone stream live (OS recording indicator on) or the motion listener attached, with nothing able to release it.

- [#3674](https://github.com/pyreon/pyreon/pull/3674) [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation-only: filled in manifest `api[]` gaps against each package's real `src/index.ts` exports. No runtime behavior changes.

  Notable additions: `@pyreon/hooks`'s 10 web-half hooks that had no manifest entry (`useGeolocation`, `useMap`, `useWebSocket`, `useAuth`, `usePush`, `usePayments`, `useDatabase`, `useCrashReporter`, `useAppState`, `setCrashTransport`); `@pyreon/http`'s typed error hierarchy, URL/transport utilities, and `defineEndpoint`; `@pyreon/router`'s active-router, link-classification, redirect-safety, and loader-serialization utilities; `@pyreon/reactivity`'s `registerSingleton`/context-owner APIs and `defineCrossModuleState`; `@pyreon/core`'s `Defer`, `registerErrorHandler`/`reportError`, `isClient`/`isServer`; `@pyreon/zero`'s theme system, locale runtime, `Meta`, typed-routes codegen, and `generateRssFeed`; `@pyreon/zero-content`'s remaining docs components (`Details`, `Tabs`, `PropTable`, `APICard`, `CompatMatrix`, `PackageBadge`, `Mermaid`, `Math`, `Sidebar`, `Breadcrumbs`, `PrevNext`, `Toc`, `Playground`, `Search`/`useSearch`, `getEntry`/`getEntries`); `@pyreon/form`'s `<Form>`/`<Submit>` components; smaller additions to `@pyreon/store`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/a11y`, `@pyreon/i18n`, `@pyreon/code`, `@pyreon/feature`, `@pyreon/charts`, `@pyreon/hotkeys`, `@pyreon/virtual`, `@pyreon/sync`, and `@pyreon/server`.

  Also corrected an inaccurate claim in `@pyreon/zero`'s `i18nRouting` manifest entry: it said components read the detected locale via `createLocaleContext`, but nothing in the framework reads `req.__localeContext` back out today — the working app-facing API is `useLocale()`/`setLocale()`. Verified `@pyreon/reactivity`'s `onCleanup` documentation is accurate (not outdated as initially suspected) via `effect.test.ts`'s explicit "onCleanup outside an effect is a silent no-op" test.

  `packages/tools/mcp/src/api-reference.ts` is the generated output of `bun run gen-docs` reflecting the above.

- [#2830](https://github.com/pyreon/pyreon/pull/2830) [`39db4ce`](https://github.com/pyreon/pyreon/commit/39db4ce30422821ac781e72d7cc27f43ac523e17) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useClipboard`'s reads were 1:1-inverted, and `text` was missing natively

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

- [#3759](https://github.com/pyreon/pyreon/pull/3759) [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useWakeLock`, `useDeviceInfo`, `useDeviceMotion`, `useSpeech`, `useAudioRecorder`, `useBluetooth` and `useCamera` compiled to engines named by the emit (Kotlin `AndroidScreenKeeper`, `AndroidDeviceProbe`, `AndroidMotionSource`, `AndroidSpeechSynth`, `AndroidRecordingEngine`, `AndroidBluetoothScanner`; Swift `UIKitIdleTimer`, `UIKitDeviceProbe`, `UIKitCameraPresenter`, `CoreMotionSource`, `AVSpeechSynth`, `AVFoundationRecordingEngine`, `CoreBluetoothScanner`) that existed only in the validation stubs — an app using any of the hooks could not build against the real SDK while every stub gate stayed green. The real engines now ship in `@pyreon/hooks` native (`PyreonDeviceProbesAndroid.kt`, `PyreonDeviceProbesUIKit.swift`) with the web arm's semantics: motion is m/s² including gravity with the W3C sign and rotation in deg/s, a recording returns a `file://` URI, a wake lock is the window / idle-timer flag, BLE discovery is first-seen and permission denial lands in `error`. Microphone / BLE-scan permission is requested at call time and the call reports the ordinary "denied" outcome; the next call succeeds. On Android the hook state classes are now `RememberObserver`s, so a recording, scan, sensor or wake lock is released when its screen leaves composition (the iOS twin does this in `deinit`). The Android display probes no longer depend on `RememberObserver` — the emit remembers the wrapper, not the probe, so Compose never notified it — and instead attach their layout watch lazily on first read. The `emitted-runtime-types-exist` ratchet list is now empty and its owned-name pattern covers the Apple-flavoured engine names.

- [#3168](https://github.com/pyreon/pyreon/pull/3168) [`ddd9586`](https://github.com/pyreon/pyreon/commit/ddd95868e9a865face6c204559df037c2eadcf41) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Five defects in the native runtimes — a guard bypass, two crashes, and two threading faults

  The Swift/Kotlin sources that ship to devices had never been audited. Four of these five are the same shape: **the correct idiom already exists in this repo and one sibling did not adopt it.**

  **A COLD deep link bypassed every navigation guard.** `PyreonRouter.init` assigned the inbound path straight to `path`, and `allowNavigation` runs only from `push`/`replace` — so an app launched BY a URL arrived at that route with no guard run, while a warm link to the same route was gated. A visited web page doing `location.href = "myapp://admin/billing"` opened the app at `/admin/billing` with the auth guard never executed; this repo's own reference host is `exported` + `BROWSABLE`. The asymmetry is what hid it: an app tested by driving links into an already-running app looks correctly gated. A route's `beforeEnter` now runs on the initial path, falling back to root when refused.

  **The Swift crash reporter replaced the app's existing handler instead of chaining to it.** `NSSetUncaughtExceptionHandler` replaces, so an app that configures Crashlytics or Sentry first stopped receiving NSException reports the moment a view called `useCrashReporter()` — the dashboard goes quiet and nothing says why, and which handler won was a coin flip on initialisation order. The Kotlin twin has always chained, and its header states the rule: "a crash reporter that swallows the crash changes app behavior".

  **`openUrl` terminated the process on Android** for any URL nothing could handle. `startActivity` throws `ActivityNotFoundException`; the call was unguarded, so a `zoommtg://` link on a device without Zoom killed the app. The Swift half degraded gracefully, so one shared source crashed on exactly one target. It returns whether the URL opened, rather than swallowing — a caller that wants to fall back needs to know.

  **The debounce/throttle scheduler ran the user's callback off the main thread, on both targets.** `TimerTask.run` executes on the Timer's thread and an unstructured Swift `Task` does not inherit MainActor, so a debounced body — which writes signals — was an off-main Compose state write: `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`, the exact crash two neighbouring files each document and each already fix by hopping to the main looper. This one is reachable through the default emit with no unusual host code. Both targets hop now, both guard the task map they were racing, and Kotlin shares one daemon timer instead of starting a thread per debounced callback and never cancelling it.

  **The deep-link listener released by position, not identity** (leak class A, both targets). A router that registered earlier and deallocated later cleared the slot belonging to the router that had replaced it — warm deep links then died silently for the session, and the next link was stashed for a router that might never be constructed.

  One thing was tried and reverted: re-validating the standing path when a global guard is registered. It closes the cold-link hole for global guards, but it makes adding a guard NAVIGATE — so `beforeEach { false }`, the ordinary "block navigation while saving" pattern, would eject the user from the page they are on. The package's own `testBeforeEachBlocksReplace` caught it. A guard is about transitions; applying it retroactively to the current location is a different and worse semantic. So a guard that must cover a cold deep link belongs on the route's `beforeEnter`, which is now said in the public doc rather than left to be discovered.

- [#3579](https://github.com/pyreon/pyreon/pull/3579) [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce) Thanks [@vitbokisch](https://github.com/vitbokisch)! - An unsized native `<WebView>` now defaults to 150 points tall on iOS and Android, matching the CSS default the web `<iframe>` falls back to. Before, it measured to its content. For a hosted chart or flow page whose body is `height: 100%`, that came out around 18dp inside a scrolling page, so the page had no room to lay out and taps landed on nothing. An explicit height still takes precedence.

- [#2752](https://github.com/pyreon/pyreon/pull/2752) [`e0e0dc0`](https://github.com/pyreon/pyreon/commit/e0e0dc066470e92066652ccbd739ae0d6e518c58) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Eight README examples are now typechecked in CI.

  `check-doc-examples` only ever looked at `docs/src/content/docs/**`; package READMEs carry ~550 `ts`/`tsx` blocks and nothing verified any of them. The gate now walks package READMEs too, and each of these packages has one verified-clean example opted in with the `// @check` marker.

  Each was compiled before being marked, not marked and then debugged. No content changed — the marker is a comment inside the fence.

- [#3515](https://github.com/pyreon/pyreon/pull/3515) [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation-only: closes five README/manifest gaps against shipped 0.52-cycle APIs, found by auditing every package README against its real exports.

  - **`@pyreon/core`** — `<Async>`, `use()` (already in the manifest but undocumented in the README) and `elementRef()` (missing from BOTH the README and the manifest) are now documented. `elementRef` gets a new manifest `api[]` entry with a real `mistakes` catalog, and the package `longExample` now demonstrates all three primitives so they surface in `llms-full.txt` / the MCP `api-reference` (the manifest's `longExample`, not `api[].example`, is what drives that section).
  - **`@pyreon/sync`** — the multiplatform pure-TS CRDT engine (`pyreonAdapter`, `PyreonCrdtAdapter`, `PyreonCrdtDoc`, `createActorId`, `connectPyreonSync`, `webSocketChannel`, `createNativeSyncHost`) shipped via [#2824](https://github.com/pyreon/pyreon/issues/2824)/[#3207](https://github.com/pyreon/pyreon/issues/3207) and was undocumented everywhere — the README's own roadmap table still implied only the Yjs engine had landed. Adds a "Multiplatform engine" README section, 7 new manifest `api[]` entries, and a roadmap row.
  - **`@pyreon/table`** — `createTableState` (the dependency-free, PMTC-lowerable table-state core) was documented in the manifest but absent from the README, which reads as TanStack-only. Adds a full section + a comparison table + a gotcha distinguishing it from `useTable`.
  - **`@pyreon/router`** — `safeRedirectLocation` / `classifyRedirectTarget` (public open-redirect-guard exports) get a short "Redirect-target security" subsection under `notFound() / redirect()`.
  - **`@pyreon/hooks`** — the README's "full surface" table-count line said "55 hooks across 7 categories" against a real 65 (the prose line three lines above it was correct and already guarded by `check-doc-claims`; this second, unguarded restatement of the same number silently drifted on its own). The table itself listed three hooks that do not exist (`useRootSize`, `useSpacing`, `useThemeValue`) and was missing 19 real ones across Interaction/Data (`useBluetooth`, `useSafeArea`, `useScreenOrientation`, `useDeviceMotion`, `useSpeech`, `useDeviceInfo`, `useCamera`, `useAudioRecorder`, `useWakeLock`, `useAppState`, `useCrashReporter`, `useAuth`, `useDatabase`, `useGeolocation`, `useMap`, `useWebSocket`, `useSecureStorage`, `usePush`, `usePayments`). The table is now a verified 1:1 match against `src/index.ts`'s real exports (programmatically diffed).
  - **`@pyreon/cli`** — `check-doc-claims` gains a guarded claim site for the hooks README's table-count line, closing the exact gap that let it drift silently: `packages/tools/cli/src/doctor/gates/doc-claims.ts`'s `hook export count` check previously only watched the prose line in that file, not this second restatement a few lines below it. Bisect-verified: reverting the new claim spec makes the new regression test fail with `expected +0 to be 1` (drift undetected); restored, it passes.
  - **`@pyreon/mcp`** — `api-reference.ts` regenerated (`bun run gen-docs`) from the `@pyreon/core` / `@pyreon/sync` manifest edits above; no hand edits.

  No runtime behavior changes in any package.

- [#2931](https://github.com/pyreon/pyreon/pull/2931) [`f904416`](https://github.com/pyreon/pyreon/commit/f9044167f2716c658cc8b68fa2c1bde763ce328e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Wire the secure-context diagnostic into every gated hook, and correct which hooks are gated.

  `https()` shipped with the diagnostic wired into three hooks — `useGeolocation`, `useShare`, `useWakeLock` — while the docs and changeset said "hooks that need a secure context now explain why they are unavailable", which reads as all of them. Five were silent: `useDeviceMotion`, `useAudioRecorder`, `useBluetooth`, `useClipboard`, `useNotifications`. All eight now report the cause.

  The list itself was also wrong in the other direction. Three hooks were described as secure-context-gated and are not: `useCamera` uses an `<input type="file" capture>` picker, which works over plain HTTP; `useSpeech` uses `speechSynthesis`, which is not gated (only SpeechRecognition is); and `usePush` is host-driven, with the app owning the PushManager flow. Warning for those would send someone to configure TLS for a problem TLS cannot fix, so they are deliberately excluded.

  A new static test (`secure-context-coverage.test.ts`) asserts the coverage in both directions: every hook that accesses a gated API must call `warnIfInsecureContext` with its own name, and the check is keyed on the API ACCESS rather than a hook-name list, so a mention in a comment does not count. It has to be static — the diagnostic fires only when `isSecureContext === false`, and a happy-dom suite is always a secure context, so no behavioural test can distinguish a wired hook from an unwired one.

- [#2940](https://github.com/pyreon/pyreon/pull/2940) [`b047088`](https://github.com/pyreon/pyreon/commit/b047088bb852d53f740802a3dd388890b03cc7f9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The secure-context diagnostic now also fires from a hook's capability accessor, not only when you try to use the API.

  It was wired at the bail paths — `acquire()`, `start()`, `copy()`. But the idiomatic shape branches on the capability instead:

  ```tsx
  <Show when={() => lock.supported()} fallback={<Unsupported />}>
  ```

  An app written that way is correct, degrades gracefully, and never reaches a bail path — so it never learned that the only thing wrong was the origin. That is the same silent dead end the diagnostic exists to remove. The four gated hooks exposing a capability accessor (`useDeviceMotion`, `useAudioRecorder`, `useBluetooth`, `useWakeLock`) now report from there too.

  Safe from an accessor because the warning is memoized per hook: a `supported()` read inside a render loop still produces exactly one line.

- [#3192](https://github.com/pyreon/pyreon/pull/3192) [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **`useSecureStorage` and `useDatabase` shared their store across requests on the
  server.** Both back their web arm with a module-level `Map`, under comments that
  reason correctly about a browser — "the secret store is app-wide, like the
  Keychain it mirrors"; "module-scoped so reads and writes within one page agree".
  In a browser one process serves one user, so app-wide and page-wide are the same
  scope. On a server one process serves everyone, and both hooks reached that map
  under SSR: `useDatabase` mirrored into it _before_ its `isServer` early return
  and read from it, while `useSecureStorage` had no server branch at all.

  Verified by running the modules with no `document` — the real SSR arm, not a
  mock: a record inserted by one render came back to the next, and a session token
  written by one render was returned to the next verbatim.

  Both now have an inert server arm — reads empty, `write` returns `false`,
  nothing stored. That is chosen over a per-call map, which removes the leak but
  makes two components in one render disagree; inert is consistent for every
  caller and carries nothing across a request. It is also the honest answer: a
  localStorage/Keychain mirror has nothing to mirror on a server, and secrets
  needed there belong in the request context or the environment.

  Also repairs a security docblock in `@pyreon/server`: the server-island fragment
  renderer's SECURITY CONTRACT paragraph had been spliced into the middle of the
  preceding sentence, leaving both halves reading as fragments.

- [#3745](https://github.com/pyreon/pyreon/pull/3745) [`b735e04`](https://github.com/pyreon/pyreon/commit/b735e040674de13d31aa30913ff5a3896c2f8b90) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Android `PyreonWebView`: a new opt-in `PyreonWebViewRendering.softwareLayer`
  flag. When set, it draws hosted WebViews on a software layer. The default is
  unchanged (hardware). It exists for GPU-less emulators. On the SwiftShader
  emulator, hardware WebViews intermittently leave the whole window unpainted,
  and instrumented tests set the flag in `@Before`.

- [#3051](https://github.com/pyreon/pyreon/pull/3051) [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon-native wire` never followed a re-export chain

  `resolveNativeSources` has a `transitiveScope: 'first-party'` option, documented
  as the thing that makes a re-export chain aggregate. **No caller ever passed
  it**, so the transitive walk never ran — a declared, dead option.

  The consequence is a consumer-facing build failure. `useSecureStorage` is
  exported by `@pyreon/hooks`, but its Kotlin runtime `PyreonSecureStorage` lives
  in `@pyreon/storage`. An app that declares hooks (and not storage) wired only
  hooks and failed a real `gradle assembleDebug` with
  `Unresolved reference 'PyreonSecureStorage'`.

  `wireApp` now passes it, which fixes the class rather than that one pair. It
  immediately resolved two more genuinely-missing wirings in the repo's own
  examples.

  `@pyreon/hooks` also now declares `@pyreon/storage`, which is the honest
  dependency: it re-exports a hook whose native runtime lives there.

- [#2863](https://github.com/pyreon/pyreon/pull/2863) [`2cf6f2a`](https://github.com/pyreon/pyreon/commit/2cf6f2a15fe3d07ba78669b79f3a5385a60b6088) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New `https()` plugin — HTTPS for the dev server, so secure-context browser APIs can be tested on a real device.

  ```ts
  import { https } from '@pyreon/zero/server'
  plugins: [zero(), https({ lan: true })]
  ```

  **Not for localhost.** `http://localhost` is already a secure context. It exists because a phone reaches your dev server at `http://192.168.1.24:3000`, which is not — so `useCamera`, `useGeolocation`, `useDeviceMotion`, `useAudioRecorder`, `useSpeech`, `useBluetooth`, `useClipboard`, `useNotifications`, `usePush`, `useShare`, `useWakeLock`, service workers and `crypto.subtle` are all unavailable exactly where they most need testing. A laptop has no accelerometer.

  `lan: true` certifies this machine's network address **and** binds the server to it; certifying an address the server never binds to would produce a certificate nothing can reach.

  Certificates come from three tiers: `{ cert, key }` if supplied; a local `mkcert` CA if one is already installed and trusted (no browser warning); otherwise a self-signed certificate generated with zero dependencies, which works immediately behind a one-time interstitial. **Pyreon never installs a certificate authority** — a local CA key can mint a valid certificate for any domain, so trusting one is a deliberate user action (`mkcert -install`), not a side effect of adding a plugin. Custom hosts are supported; `*.localhost` resolves natively, and anything else has its `/etc/hosts` lines printed rather than written.

  Dev and preview only, HTTP/1.1 (Vite's dev server has not offered HTTP/2 since v3). The certificate is cached under `node_modules/.pyreon-https` and reissued when the host list changes or expiry approaches.

  `@pyreon/hooks` gains the matching diagnostic: hooks that need a secure context now explain why they are unavailable instead of silently reporting "unsupported". It fires only when `isSecureContext` is actually `false`, so it never blames TLS for an API the browser genuinely does not implement.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`24178cc`](https://github.com/pyreon/pyreon/commit/24178cce182d38a6c58d4165222627a008d63976), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`8aeffe0`](https://github.com/pyreon/pyreon/commit/8aeffe09bf62ea08af1278c45ecdaf26d1a04cb6), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`dfdb7f4`](https://github.com/pyreon/pyreon/commit/dfdb7f4952d6f61dfe22fadab1e7bc31175d619f), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`6b1ff6b`](https://github.com/pyreon/pyreon/commit/6b1ff6bc64f0c8e285f61fd7e0a8790c18694818), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5a52b2b`](https://github.com/pyreon/pyreon/commit/5a52b2be1759fbb4fc5f2fb368217adf5ac6070a), [`073a94f`](https://github.com/pyreon/pyreon/commit/073a94f64f84da0d391a47d4fb3b769368455c0b), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67)]:
  - @pyreon/core@0.52.0
  - @pyreon/storage@0.52.0
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Minor Changes

- `usePush` and `usePayments` had no web halves — the fifth and sixth hooks (6c05ef0)
  with the resolvability gap `useGeolocation` / `useDatabase` / `useWebSocket`
  / `useAuth` had. With these two, **every hook in the compiler's
  `NATIVE_LOWERED_HOOKS` registry now has a web implementation** — the "one
  source, three targets" import contract holds for the full lowered surface.

  Both mirror their native containers (`PyreonPushNotifications` /
  `PyreonPayments`, Swift + Kotlin verified line-for-line): pure reactive state
  machines with an injected platform edge, which on these two services is not a
  convenience but the only correct shape — a push token arrives through the
  app's AppDelegate / FCM service natively and a service-worker subscription
  flow on web; a purchase resolves through StoreKit / Play Billing natively and
  Stripe / Payment Request on web. `start(register)` / `connect(register)` hand
  the app handler thunks that drive the pure transitions, exactly as native.

  The subtle native semantics are matched exactly and each has a test:
  `push.fail` keeps the prior token + notifications (stale-while-error) and
  only `tokenReceived` clears `error`; `push.start` never invokes `register`
  twice; `pay.purchase(id)` is a TOTAL no-op when not connected (it does not
  even enter the purchasing state — native guards before `purchaseStarted`);
  `pay.purchaseSucceeded` deliberately does NOT clear `error`. Members are live
  getters over signals with batched transitions; `error` narrows to
  `string | null` per the compiler's SERVICE_OPTIONAL_FIELDS contract.

  Bisect-verified: mutating the stale-while-error and unconnected-purchase
  guards fails exactly the specs that document them. Hook count 53 → 55 across
  every gated claim site.

- `useAuth` had no web half — the fourth hook in this arc with that gap, after (3b2893e)
  `useGeolocation`, `useDatabase`, and `useWebSocket`.

  PMTC lowers `useAuth<User>()` to `PyreonAuth<User>` on both native targets
  (device-proven including session rehydration), so the hook was fully real on
  iOS and Android and did not exist on web: no implementation, no export, no
  type anywhere outside `packages/native/`. Because PMTC matches hook NAMES and
  never resolves imports, the flagship finance real app's
  `import { useAuth } from '@pyreon/hooks'` compiled natively while being an
  unresolvable import in any web build — and the compiler's own
  `lowered-hooks-typecheck` fixture writes exactly that import.

  The web half mirrors `PyreonAuth` exactly, because one component body reads
  the same members on three targets: `status` renders the cross-target
  spellings (`'signedOut' | 'signingIn' | 'signedIn' | 'error'` — Swift's
  camelCase enum rendering and Kotlin's `toString()` override), `error` is a
  `string | null` (the shared-source type the compiler's
  SERVICE_OPTIONAL_FIELDS declares), and the transition edge cases match
  line-for-line: `beginSignIn` and `signInFailed` both KEEP the existing `user`
  (a token refresh must not blank the UI; a failed refresh keeps the prior
  session visible). Members are live getters over signals — a component body
  runs once, and plain values would freeze at the mount state — and every
  transition batches its multi-signal write so subscribers never observe a torn
  intermediate state the native `@Observable` container could not produce.

  Pure state machine, no platform edge, so it is SSR-safe with no environment
  guard. Session persistence composes with `useSecureStorage` exactly as the
  native finance gate device-proves.

  Also revives a DEAD doc-claims check found while wiring the hook counts
  (`@pyreon/cli` doctor gate): the "published package count" patterns expected
  "across 5 categories" but the repo has had 6 since `packages/native/` — the
  pattern could never match, so the claim was warned-and-skipped on every run.
  The patterns now match reality and the count is verified again (23 claim
  sites checked, 0 misses).

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

- `useDatabase` had no web half — and the kitchen-sink example imported it from a package that never exported it. (2334088)

  PMTC lowers `useDatabase()` to `PyreonDatabase` on both native targets and it is
  device-proven (file-backed, survives relaunch). There was no web
  implementation, no export, and no type anywhere in `packages/`.

  That is not hypothetical. `examples/native-counter-ios/src/Counter.tsx` — 19
  passing XCUITests — imported `useDatabase` from `@pyreon/primitives`, which does
  not export it. PMTC matches hook NAMES and never resolves imports, and that
  example is one of four with **no typechecked web sibling**, so nothing caught
  it. The flagship device-proven example was source no TypeScript build would
  accept. The import now points at `@pyreon/hooks`, where the implementation
  lives; the emit is byte-identical before and after on both targets, so the 19
  device tests provably cannot regress from the change.

  The API is SYNCHRONOUS because the native one is (`get` returns
  `PyreonRecord?`, not a promise). That rules out IndexedDB: its async API would
  force `await` into source compiling for three targets — the same shared-code
  break that made `@pyreon/form` non-shared. `localStorage` is the faithful
  analogue: synchronous, persistent across reloads, same read-modify-write
  semantics.

  A real bug surfaced during testing and is worth recording, because it is a
  storage failure a user would experience as data resurrection: the in-memory
  mirror (which exists so records still round-trip when persistence is blocked)
  was also consulted on a `localStorage` MISS. So after a user cleared site data,
  deleted records came back for the rest of the session. A miss is authoritative;
  the mirror is now used only when storage is genuinely unavailable.

  HONEST LIMITS, stated because a storage layer that quietly stops persisting is
  worse than one that never claimed to: ~5 MB per origin; values are strings on
  every target (the native `fields` is `[String: String]`), so callers serialise
  numbers and dates themselves; `find` is a linear scan, as it is natively.

- `useGeolocation` had no web half — the import did not resolve at all. (e610e59)

  PMTC has lowered `useGeolocation()` to `PyreonGeolocation` on both native
  targets since Phase 5, and the compiler's lowered-hook allowlist lists it. But
  there was no web implementation, no export, and no type anywhere in
  `packages/`, so `import { useGeolocation } from '@pyreon/hooks'` did not
  resolve and an app using it could not build for web.

  That made it native-only in practice while sitting alongside hooks that are
  genuinely shared — `useHaptics`, `useShare`, `useClipboard` and `useAppState`
  all ship web implementations. `useMap`, `usePush` and `usePayments` remain in
  that state; this closes the one with a straightforward browser equivalent
  (`navigator.geolocation.watchPosition`).

  The returned SHAPE is the contract, and it is not arbitrary: PMTC reads
  `geo.latitude` / `geo.start()` as MEMBERS on the native container, so the web
  object exposes exactly those names as getters over signals. Returning bare
  signals would force `geo.latitude()` on web and diverge from the native member
  read — the exact mismatch that made `@pyreon/form` non-shared. Verified by
  emitting this source through the native compiler and confirming the Swift and
  Kotlin output reads the right fields.

  HONEST SCOPE — the reactive reads (`latitude`/`longitude`/`accuracy`/`error`/
  `isTracking`) are shared on all three targets, but **`start()` is web + iOS
  only**. Kotlin's `PyreonGeolocation.start` takes a host closure because it has
  no default location transport, while Swift's is 0-arg — the same
  OkHttp-for-WebSocket asymmetry already tracked for `usePush`/`usePayments`. The
  API documents that on the member itself rather than burying it in a note.

  A position fix is delivered as ONE batched update: four bare `.set()` calls
  would fire up to four reactive passes per fix, and a consumer reading lat+lng
  could observe a TORN pair — a new latitude against the previous longitude, a
  coordinate that was never real. The `no-unbatched-updates` ratchet caught this.

  The watch is stopped on unmount; a leaked watch keeps GPS active and holds its
  callback closure alive, which the user cannot see.

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

- `useWebSocket` had no web half — the third hook in this arc with that gap. (834523b)

  PMTC lowers `useWebSocket(url)` to `PyreonWebSocket` on BOTH native targets, and
  the emitters synthesize an implicit auto-connect on mount, so the hook was fully
  real on iOS and Android. On web it did not exist: no implementation, no export,
  no type anywhere outside `packages/native/`.

  That is the same failure `useGeolocation` and `useDatabase` had, for the same
  reason — PMTC matches hook NAMES and never resolves imports, so
  `import { useWebSocket } from '@pyreon/hooks'` compiles for two targets and is
  unresolvable on the third. The compiler's own `lowered-hooks-typecheck` fixture
  already writes exactly that import.

  Found by a systematic sweep rather than by stumbling into it: every hook in
  `NATIVE_LOWERED_HOOKS` was checked for a non-native implementation. `useAuth`,
  `useMap`, `useSecureStorage`, `usePayments` and `usePush` remain without one and
  are NOT fixed here.

  The surface mirrors `PyreonWebSocket` member for member — `lastMessage`,
  `messages`, `isConnected`, `error`, `connect`/`send`/`close` — because the point
  is that one component body reads the same fields on three targets. Verified, not
  assumed: the natural component compiles clean on both native targets with zero
  warnings, and `{ws.lastMessage}` emits
  `(ws.lastMessage).map { "\($0)" } ?? ""` rather than rendering
  `Optional("hi")` — the trap that bit `useGeolocation`'s `Double?`.

  `error` is a STRING, not an `Error`, to match what the native side can render
  and what the compiler's `SERVICE_OPTIONAL_FIELDS` types it as. Keeping the web
  type narrower than JS allows is what keeps one source valid everywhere.

  Fields are GETTERS over signals. A component body runs once, so returning
  resolved values would freeze every field at its mount value — the native
  `@Observable` / `mutableStateOf` fields do not behave that way.

  Three real bugs were written and then caught while building it, each locked by a
  test: a synchronous `new WebSocket(bad)` throw left the lifecycle flag stuck
  true so no later `connect()` could ever open (invalid URLs throw from the
  constructor rather than firing `onerror`); a frame arriving between `close()`
  and teardown could write into a disposed component's signals, so handlers are
  dropped BEFORE closing; and `send` guards on `readyState`, since a frame sent
  before `onopen` throws `InvalidStateError`.

  HONEST LIMITS, matching the native half rather than exceeding it: TEXT frames
  only (a binary frame is ignored, not stringified into data the native side
  could never produce); no automatic reconnect or backoff; and `messages` grows
  unbounded, exactly as `[String]` does natively.

  The hooks manifest enumeration was also stale — it had been bumped to 48 for
  `useGeolocation` without ever naming it, so the list no longer summed to its own
  count. Both data hooks are now named.

### Patch Changes

- `@pyreon/hooks`: add the missing SSR-guard coverage annotations to the native (3017511)
  hooks (`useAppState`, `useBiometrics`, `useDatabase`, `useFilePicker`,
  `useGeolocation`, `useImagePicker`). Comment-only — no runtime change. The arms
  they mark are unreachable from a node+happy-dom run, so they were counted
  against a threshold they could never satisfy in that environment; marking them
  is what lets the package hold a real 99% bar instead of quietly sitting under
  it. Ships alongside genuine new tests for the same hooks: the `useAppState`
  listener cleanup (leak class D), `useDatabase`'s persistence-degradation
  contracts, `useBiometrics`, and `useMap.setCamera`.

  `@pyreon/meta`: run its tests on vitest instead of `bun test`. All 149 tests
  already passed under vitest and the package already had a `vitest.config.ts` —
  only the `test` script was never switched, which meant it emitted Bun's coverage
  format and the coverage gate could not read it at all.

- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

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

- Updated dependencies:
  - @pyreon/reactivity@0.51.0
  - @pyreon/core@0.51.0

## 0.50.0

### Minor Changes

- [#2458](https://github.com/pyreon/pyreon/pull/2458) [`24df62e`](https://github.com/pyreon/pyreon/commit/24df62ee3e27d1cc624f627c1277fbed4866e91e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Focus-management hardening (audited a11y gaps):

  - **`useFocusTrap` upgraded to focus-scope quality.** Concurrent traps now form a scope STACK — one shared pair of document listeners, only the most recently activated trap whose container exists handles events, and deactivating/unmounting it reactivates the trap beneath (stacked modals no longer fight over the same Tab event). NEW focusin containment: a programmatic `.focus()` or mouse click that lands focus outside the container is recaptured back in (Tab-only trapping missed those escapes); the recapture is microtask-deferred and re-checked so a close flow that restores focus + unmounts in the same flush is never fought. `initialFocus: true` now prefers a `[data-autofocus]` descendant over the first tabbable. Existing call shapes (`useFocusTrap(getEl)`, positional `active`, options object) are unchanged.
  - **New `useInertOthers(getEl, options?)` hook** — applies the native `inert` attribute to every sibling subtree outside the given element (walking up to `document.body`), making `aria-modal="true"` actually true for sighted keyboard users AND assistive tech. Exact-restore on cleanup (elements that were already `inert` stay inert), per-element refcount so stacked overlays never un-inert what an outer overlay still needs, live regions (`[aria-live]`) skipped so announcements keep working, reactive application via a signal-backed getter.
  - `@pyreon/ui-primitives` `ModalBase` (private) now wires `useInertOthers` behind its open lifecycle and arms its focus trap in OPEN order.
  - `@pyreon/a11y` README: documents the shipped `<LiveRegion>` + `<SkipLink>` (previously absent) and the `<RouteAnnouncer>` ↔ `RouterView announceRouteChanges` double-announcement overlap.

- [#2413](https://github.com/pyreon/pyreon/pull/2413) [`c41e4f3`](https://github.com/pyreon/pyreon/commit/c41e4f3cc4084a2b7abbf2af92e9df1ef05791b6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - refactor(hooks,ui-core): make @pyreon/hooks independent of the ui-system layer

  `@pyreon/hooks` is a **fundamentals** package but depended on the **ui-system**
  layer (`@pyreon/styler` + `@pyreon/ui-core`), which inverted the layer order and
  dragged the whole styling layer into every hooks consumer. It is now fully
  independent — its only `@pyreon/*` deps are the `core` + `reactivity` peers.

  **Breaking** — three theme-reader hooks moved from `@pyreon/hooks` to
  `@pyreon/ui-core` (their natural home: they read the styler theme, and the
  ui-system now owns its theme hooks):

  - `useThemeValue` — import from `@pyreon/ui-core` instead of `@pyreon/hooks`
  - `useRootSize` — import from `@pyreon/ui-core`
  - `useSpacing` — import from `@pyreon/ui-core`

  `useThrottledCallback` stays in `@pyreon/hooks` (its `throttle` util is now
  inlined — identical leading+trailing behavior, no ui-core import). All other
  hooks are unchanged.

  This severs the last `fundamentals → ui-system` runtime dependency edge, a step
  toward making the ui-system and fundamentals layers mutually independent.

- [#2419](https://github.com/pyreon/pyreon/pull/2419) [`5bf6bfc`](https://github.com/pyreon/pyreon/commit/5bf6bfcc2ce0cc2749bc8fd5f8927d122aee6264) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useFilePicker()` — pick a document/file from the device.

  `pick()` returns a `Promise<string | null>` you `await`: a URI string for the
  picked file, or `null` when the user cancels (it never rejects). This is the
  document sibling of `useImagePicker` (any file — a PDF, a `.csv`, a `.zip` — not
  just photos) and the third async-result hook.

  ```tsx
  const files = useFilePicker()
  const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

  <button onClick={async () => {
    const uri = await files.pick()
    status.set(uri === null ? 'cancelled' : 'picked')
  }}>Pick a file</button>
  ```

  Compare the result to `null` explicitly rather than testing it for truthiness —
  that is also the shape the multi-target compiler lowers to a native optional
  test.

  Web uses a hidden `<input type="file">` (no `accept` filter, so any file type)
  and resolves an object URL; the input is always detached once the pick settles.
  Under PMTC it lowers to `UIDocumentPickerViewController` (iOS) and the Storage
  Access Framework `OpenDocument` (Android).

  No storage permission is required on either native platform: both system pickers
  run out of process and hand back only the document the user chose, so there is no
  iOS entitlement and no Android runtime permission to request.

  The returned URI is an opaque, ephemeral, platform-shaped handle (`file://` temp
  copy on iOS, `content://` on Android, `blob:` on the web) — read it or upload it
  promptly rather than persisting it.

  Saving/exporting a file is a separate native flow on every platform and is
  intentionally out of scope here (a tracked follow-up).

### Patch Changes

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- [#2401](https://github.com/pyreon/pyreon/pull/2401) [`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Move `useControllableState` to `@pyreon/core`, where it belongs.

  It is a PROPS primitive, not a hook: it reads a props accessor, owns no
  lifecycle, and is used in the same breath as core's `splitProps` — every
  consumer already wrote both imports side by side. It imports nothing but
  `signal`.

  Its previous home in `@pyreon/hooks` meant any package wanting the
  controlled/uncontrolled pattern had to depend on hooks — and hooks depends on
  `@pyreon/styler` + `@pyreon/ui-core`. That dragged the entire UI-system styling
  layer plus 40+ unrelated hooks (`useFetch`/`useHaptics`/`useShare`/…) into the
  consumer for ~20 lines. `@pyreon/elements` needs the pattern and sits BELOW
  those packages, so the edge would also have inverted the layering.

  `@pyreon/hooks` re-exports it, so its public API is unchanged — the same
  cross-layer idiom `@pyreon/core` already uses for reactivity's
  `isClient`/`isServer`. No consumer needs to change an import.

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/styler@0.49.0
  - @pyreon/ui-core@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Minor Changes

- [#2381](https://github.com/pyreon/pyreon/pull/2381) [`134e241`](https://github.com/pyreon/pyreon/commit/134e24118665ef44a7e4b7f030e02fbcde4f59fc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useImagePicker()` — pick an image from the device's photo library.

  `pick()` returns a `Promise<string | null>` you `await`: a URI string for the
  picked image, or `null` when the user cancels (it never rejects). This is the
  second async-result hook after `useBiometrics`.

  ```tsx
  const picker = useImagePicker()
  const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

  <button onClick={async () => {
    const uri = await picker.pick()
    status.set(uri === null ? 'cancelled' : 'picked')
  }}>Pick a photo</button>
  ```

  Compare the result to `null` explicitly rather than testing it for truthiness —
  that is also the shape the multi-target compiler lowers to a native optional
  test.

  Web uses a hidden `<input type="file" accept="image/*">` and resolves an object
  URL; the input is always detached once the pick settles. Under PMTC it lowers to
  `PHPickerViewController` (iOS) and the Android Photo Picker (`PickVisualMedia`).

  No photo-library permission is required on either native platform: both system
  pickers run out of process and hand back only the asset the user chose, so there
  is no `Info.plist` usage description and no Android runtime permission to
  request.

  The returned URI is an opaque, ephemeral, platform-shaped handle (`file://` temp
  copy on iOS, `content://` on Android, `blob:` on the web) — hand it to an image
  view or an upload rather than persisting it.

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0
  - @pyreon/styler@0.48.0
  - @pyreon/ui-core@0.48.0

## 0.47.0

### Minor Changes

- [#2344](https://github.com/pyreon/pyreon/pull/2344) [`ea704c5`](https://github.com/pyreon/pyreon/commit/ea704c55e23818dc187b703f072ffa1d60e000d8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useBiometrics()` — a biometric authentication gate (Face ID / Touch ID on iOS `LAContext`, BiometricPrompt on Android, feature-detected on the web). The FIRST hook with an ASYNC RESULT: `authenticate(reason)` returns a `Promise<boolean>` you `await`. Under PMTC it lowers to the native biometric APIs and the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. On the web v1 a real assertion is a WebAuthn ceremony (needs a server-issued challenge + a registered credential), so `authenticate` resolves `false` and `isAvailable()` feature-detects `window.PublicKeyCredential` — native is the primary target.

- [#2325](https://github.com/pyreon/pyreon/pull/2325) [`8820d2f`](https://github.com/pyreon/pyreon/commit/8820d2ffe144a60e4df3db9e15e6228ea714ac1e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useAppState()` — a reactive app-lifecycle phase hook (`'active'` | `'inactive'` | `'background'`).

  On the web it tracks `document` visibility + focus; it also compiles to native via the Pyreon Multi-Target Compiler — `const state = useAppState()` lowers to a `PyreonAppState` container (SwiftUI `@Observable` on iOS via `UIApplication` lifecycle notifications, Compose `MutableState` on Android via an app-injected `ProcessLifecycleOwner` source), read as `state()` from one shared source. Use it to pause a live poll while backgrounded or dim UI while inactive.

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/styler@0.47.0
  - @pyreon/ui-core@0.47.0

## 0.46.0

### Minor Changes

- [#2257](https://github.com/pyreon/pyreon/pull/2257) [`182bcd2`](https://github.com/pyreon/pyreon/commit/182bcd29a6fcbebbd8a7b171da0d7e03a74d01a2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(hooks): `useFocusTrap` gains an optional second argument — `active` (arm/disarm the trap reactively without unmounting, via a getter or the positional shorthand `useFocusTrap(getEl, () => isOpen())`) and `initialFocus` (move focus into the container on activation: `true` for the first tabbable, or a selector / element / getter; default off, backward-compatible). The focusable query is now spec-grade: it includes `contenteditable`, `audio`/`video[controls]`, and `details > summary`; filters `display:none` / `visibility:hidden` / `[hidden]` / `inert` / disabled / zero-size nodes (via `Element.checkVisibility` in real browsers); and orders positive-`tabindex` first. The trap now only acts while focus is inside its container, so nested traps no longer fight. Fully backward-compatible — the existing single-argument call is unchanged. Adds a real-Chromium browser test for the focus / Tab-cycling / visibility semantics happy-dom can't verify.

### Patch Changes

- [#2305](https://github.com/pyreon/pyreon/pull/2305) [`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs: fix 4 audit-found manifest inaccuracies that shipped wrong claims to AI assistants via MCP

  - **runtime-dom (safety-inverted):** `dangerouslySetInnerHTML` is intentionally RAW (React parity — developer owns sanitization); the manifest claimed it was sanitized. Also corrected: the Sanitizer API (`el.setHTML`) lives only in the `innerHTML` PROP sink (where it bypasses a custom `setSanitizer` policy), `sanitizeHtml()` itself is always the custom-or-DOMParser allowlist; `_bindText` is emitted for non-computed member chains too (with a `caller` 3rd arg preserving `this`), not "only a bare signal identifier"; KeepAlive's non-thunk `active={cond}` THROWS `TypeError` at mount (no `<Show when>`-style value normalization), it is not "captured once".
  - **validate:** `parseReactiveAsync` DOES supersede stale results (internal version counter — an awaited stale frame resolves to the latest run's verdict); the mistakes entry claimed the opposite. The true residual caveat is no AbortSignal (in-flight validators run to completion). Also updated the stale union prod-crash string (`member._runInto is not a function`, not `member["~standard"] is undefined`).
  - **router:** `onBeforeRouteLeave` called outside setup DOES register (unconditional `router.beforeEach`) — the real failure mode is a LEAKED guard (the `onUnmount` auto-removal never attaches), not "never registers". RouterView also accepts an optional `router` prop.
  - **hooks:** `useScrollLock`'s per-instance `isLocked` guard makes an extra `unlock()` a no-op — it can NOT release another component's lock; corrected to teach the real limitation (one instance holds at most one refcount unit and does not nest).
  - **validation:** schema libraries are detected by duck-typing `~standard` with zero dependency records — they are no longer declared as optional peer dependencies.
  - **compiler:** `_bind` is imported from `@pyreon/reactivity` (not runtime-dom/core).

- [#2268](https://github.com/pyreon/pyreon/pull/2268) [`4a41603`](https://github.com/pyreon/pyreon/commit/4a41603158b79fb1303711aab4b2220e52d532b0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(hooks): document the 25 hooks missing from the manifest api[] (20 → 45 — every
  public export is now documented). Each entry has a source-verified signature +
  summary + real foot-guns, read from the hook bodies: the reactive accessors
  (useMediaQuery / useColorScheme / useSizeClass / useReducedMotion / useOnline /
  useIntersection / usePrevious / useWindowResize / useToggle / useHover / useFocus)
  that must be CALLED and seed a pre-mount default (SSR first-render caveat); the
  theme-derived hooks (useRootSize / useSpacing / useThemeValue) that capture a
  NON-reactive snapshot; the callback hooks (useDebouncedCallback /
  useThrottledCallback / useInterval / useTimeout) that capture the callback ONCE
  despite "always latest" JSDoc; useScrollLock's module-level refcount; useToggle's
  object (not tuple) shape; and the imperative native hooks (useHaptics / useShare /
  useLinking / useNotifications) that no-op off-target. Does NOT change the hook COUNT
  (these exports already existed) — check-doc-claims 36 unaffected. Regenerates the
  MCP api-reference hooks region + snapshot (count 20 → 45). Docs/manifest only.
- Updated dependencies [[`3471a7f`](https://github.com/pyreon/pyreon/commit/3471a7fd609fc47c318aa06d206a6ed122f3c7fc), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/styler@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0
  - @pyreon/ui-core@0.46.0

## 0.45.0

### Minor Changes

- [#2191](https://github.com/pyreon/pyreon/pull/2191) [`8bd4301`](https://github.com/pyreon/pyreon/commit/8bd4301f104e4cf9e02f64fdef75194dfc9b35ce) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useLinking()` — open an external URL in the platform browser (`openUrl`). On the web it uses `window.open`; the PMTC native compiler lowers it to `PyreonLinking` on iOS (`UIApplication.shared.open`) and Android (`Intent.ACTION_VIEW`).

  The third imperative platform-API hook in the multiplatform (M3) track, reusing the recognition → emit → runtime pipeline from `useShare` (same Context + `startActivity` shape on Android). Behavioral R4: the counter example's iOS XCUITest asserts the app leaves the foreground when the Open button hands a URL to the OS.

- [#2196](https://github.com/pyreon/pyreon/pull/2196) [`428587b`](https://github.com/pyreon/pyreon/commit/428587b0379b286542e0f043c36a3b4901c391d3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useNotifications()` — post a LOCAL notification (`notify` / `requestPermission`). On the web it uses the Notification API; the PMTC native compiler lowers it to `PyreonNotifications` on iOS (`UNUserNotificationCenter`) and Android (`NotificationManager` + a channel; requires the `POST_NOTIFICATIONS` runtime permission on API 33+, which `NotificationManagerCompat` degrades gracefully without).

  The fourth imperative platform-API hook in the multiplatform (M3) track (distinct from `usePush`, which RECEIVES remote push). Reuses the recognition → emit → runtime pipeline from `useShare`. R4 is non-behavioral (the counter's iOS XCUITest asserts the Notify tap fires the call without crashing — a notification's permission prompt + auto-dismissing banner make a reliable behavioral springboard assert infeasible).

- [#2206](https://github.com/pyreon/pyreon/pull/2206) [`5f71146`](https://github.com/pyreon/pyreon/commit/5f711460bef5b6da84d19e0728e4297641a7b8e1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useSizeClass()` — the horizontal size-class read as `'compact' | 'regular'`, the cross-platform analog of SwiftUI's `horizontalSizeClass` and Android's width-based `WindowSizeClass`. `'regular'` is an expanded (tablet / landscape / split-view) width; `'compact'` is a phone-width column.

  On the web it tracks a `(min-width: 600px)` media query and updates reactively on resize / rotation. The PMTC native compiler lowers it to a pure environment read with **no runtime port** (same shape as `useColorScheme`): iOS `@Environment(\.horizontalSizeClass)`, Android `LocalConfiguration.current.screenWidthDp >= 600`.

  This is the M2.2 adaptive/tablet-layout foundation — the size-class READ; the size-class-driven layout primitive (Stack↔Inline) is a follow-up. R4 is behavioral and differentiating: the counter's iOS XCUITest asserts `Size: compact` on an iPhone Simulator, and the same suite asserts `Size: regular` on an iPad Simulator, proving the read reflects the real device environment.

### Patch Changes

- [#2185](https://github.com/pyreon/pyreon/pull/2185) [`d9b8af4`](https://github.com/pyreon/pyreon/commit/d9b8af4450615f0f6ed0ac58abcd4dca2f36ab97) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Correct 3 drifted `@pyreon/hooks` manifest `@example` blocks so they typecheck against the shipped export types, and gate-enforce them.

  - **`useFocusReturn`**: the sibling `useFocusTrap` call in the example passed 2 args but `useFocusTrap` takes one `(getEl)` — dropped the extra arg.
  - **`useBreakpoint`**: the signature + example claimed a flags object (`Signal<{ xs, sm, md, lg, xl }>` / `bp().md`), but the shipped hook returns `() => string` (the active breakpoint NAME accessor). Rewrote both (and the longExample comment) to compare `bp()` against a name.
  - **`useUpdateEffect`**: the signature + example used React's `(effect, deps)` shape, but the shipped hook is watch-style `(source, callback)`. Rewrote the api example and the longExample line to the real shape.

  `@pyreon/hooks` is removed from the `check-manifest-examples` gate's `NON_ENFORCED` list, so every hooks manifest example is now typecheck-enforced against the live exports (regenerated `@pyreon/mcp`'s api-reference accordingly). No runtime change.

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/styler@0.45.0
  - @pyreon/ui-core@0.45.0

## 0.44.0

### Minor Changes

- [#2176](https://github.com/pyreon/pyreon/pull/2176) [`0288b44`](https://github.com/pyreon/pyreon/commit/0288b44f9a46e9d99c8fdece0e79ab9192976ec1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/hooks` excellence pass — 4 new hooks (36 → 40) + doc/impl drift eliminated.

  **New hooks** (each SSR-safe, self-cleaning, tested — happy-dom + true-node SSR arms):

  - **`useCounter(initial?, { min?, max? })`** — reactive numeric counter (`inc`/`dec`/`set`/`reset`), min/max clamping. The numeric companion to `useToggle`. Zero wrapper overhead over a raw signal, and the fastest counter primitive measured (1.36–1.62× vs Solid `createSignal` / Preact signals — see the new `bench:hooks`).
  - **`useWindowScroll()`** — reactive `{ x, y }` scroll offset (passive listener) + SSR-safe `scrollTo`.
  - **`useDocumentVisibility()`** — reactive Page Visibility (`'visible' | 'hidden'`) to pause work when the tab is hidden.
  - **`useIdle(timeoutMs?, opts?)`** — reactive user-idle detection; flips back on the next activity event.

  **Drift eliminated** — the shipped implementations were correct and consumer-validated, but the README + manifest + generated MCP `api-reference` had drifted to an aspirational, runtime-broken API. Docs now match the code:

  - `useControllableState` — `defaultValue` is a PLAIN value (was documented as a getter, which wouldn't typecheck).
  - `useEventListener` — signature is `(event, handler, options?, target?)` (was documented target-first); `target` is resolved once at setup (the "re-binds reactively" claim was false).
  - `useFocusTrap` — signature is `(getEl)`; it is ref-gated (inert while `getEl()` is null), with no `active` flag and no focus-return (that is the separate `useFocusReturn`).
  - `useInfiniteScroll` — returns `{ ref, triggered }` with `{ threshold, loading, hasMore, direction }` options (was documented as `{ sentinelRef, isLoading }` / `{ rootMargin, enabled }`).
  - `useClipboard` / `useDialog` — corrected return shapes (`copy` resolves `boolean`; `useDialog.open` is the state signal, openers are `show`/`showModal`).
  - Stale "(planned)" lint-rule caveat replaced with the shipped `pyreon/no-raw-addeventlistener` / `pyreon/no-raw-setinterval` rules.

  `useIsomorphicLayoutEffect` simplified (removed a no-op `isClient ? onMount : onMount` ternary — `onMount` is already isomorphic).

- [#2177](https://github.com/pyreon/pyreon/pull/2177) [`063e809`](https://github.com/pyreon/pyreon/commit/063e80999e7ec067fcd8b417d18e4c7c032da752) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useHaptics()` — a fire-and-forget haptic-feedback hook (`impact` / `notification` / `selection`). On the web it maps to `navigator.vibrate`; the PMTC native compiler lowers it to `PyreonHaptics` on iOS (UIImpactFeedbackGenerator / UINotificationFeedbackGenerator / UISelectionFeedbackGenerator) and Android (Compose `LocalHapticFeedback`). Web and Android are coarser than iOS — a documented platform difference.

  This is the first imperative platform-API hook in the multiplatform (M3) track, establishing the recognition → emit → runtime pipeline the remaining platform hooks reuse. Device-proven on an iOS Simulator (the counter's increment tap fires `impact("light")` without crashing) and the Android device gate.

- [#2183](https://github.com/pyreon/pyreon/pull/2183) [`922d3c2`](https://github.com/pyreon/pyreon/commit/922d3c28200c547239b13139cc1ad00c752896d0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useShare()` — invoke the platform share sheet (`text` / `url` / `textUrl` / `canShare`). On the web it uses the Web Share API (`navigator.share`); the PMTC native compiler lowers it to `PyreonShare` on iOS (`UIActivityViewController` presented from the key window) and Android (`Intent.createChooser(ACTION_SEND)`). Android shares URLs as text (its basic share intent is text-based) — a documented platform difference from iOS's typed URL items.

  The second imperative platform-API hook in the multiplatform (M3) track, reusing the recognition → emit → runtime pipeline from `useHaptics`. Unlike haptics, sharing is OBSERVABLE — the counter example's iOS XCUITest asserts the system share sheet appears when the Share button is tapped (a behavioral R4).

### Patch Changes

- Updated dependencies [[`8527892`](https://github.com/pyreon/pyreon/commit/85278924ecba5059e3aadcca10fc63752dfa3f90), [`da1f628`](https://github.com/pyreon/pyreon/commit/da1f6282c42e42018aa15c92337df1badc185143), [`d0bd1d8`](https://github.com/pyreon/pyreon/commit/d0bd1d8a771fd8442e242f4e089440e606f88d6f), [`721618e`](https://github.com/pyreon/pyreon/commit/721618e97dacf995d8356dabea601ef4e98a4a12), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/styler@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/ui-core@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.43.1
  - @pyreon/ui-core@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/styler@0.43.0
  - @pyreon/ui-core@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0
  - @pyreon/styler@0.42.0
  - @pyreon/ui-core@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies [[`3ebf924`](https://github.com/pyreon/pyreon/commit/3ebf924cff00ed5bfeb0a099f66f578409fe4c18)]:
  - @pyreon/styler@0.41.2
  - @pyreon/ui-core@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies [[`12ce8e7`](https://github.com/pyreon/pyreon/commit/12ce8e72ffeff8b692db698301431674f7f87c40)]:
  - @pyreon/styler@0.41.1
  - @pyreon/ui-core@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/styler@0.41.0
  - @pyreon/ui-core@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0
  - @pyreon/styler@0.40.0
  - @pyreon/ui-core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0
  - @pyreon/styler@0.39.0
  - @pyreon/ui-core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668), [`448b689`](https://github.com/pyreon/pyreon/commit/448b689cfd0a9346c13aa1f836a2467bb12d4fcb)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/styler@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/ui-core@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.37.1
  - @pyreon/ui-core@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/styler@0.37.0
  - @pyreon/ui-core@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/styler@0.36.0
  - @pyreon/ui-core@0.36.0

## 0.35.0

### Minor Changes

- [#1801](https://github.com/pyreon/pyreon/pull/1801) [`bb024a2`](https://github.com/pyreon/pyreon/commit/bb024a277b488b915cb982d99b76e7853e62c7b0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useFocusReturn(isOpen, options?)` — the companion to `useFocusTrap`. It captures the focused element (the trigger) when `isOpen()` flips true and restores focus to it when `isOpen()` flips false, so keyboard and screen-reader users return to where they were when an overlay closes instead of the top of the page. Pass `options.returnTo` to override the restore target (useful when the trigger may have unmounted). SSR-safe (no-op on the server) and self-cleaning.

### Patch Changes

- Updated dependencies [[`97fa631`](https://github.com/pyreon/pyreon/commit/97fa6312304951e8cfd24fb8f0f405f94dc609db), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`3d47b98`](https://github.com/pyreon/pyreon/commit/3d47b987d244be4ad6b5453cd07ed39be85427bf)]:
  - @pyreon/styler@0.35.0
  - @pyreon/ui-core@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/styler@0.34.0
  - @pyreon/ui-core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.32.0

### Minor Changes

- [#1526](https://github.com/pyreon/pyreon/pull/1526) [`099f574`](https://github.com/pyreon/pyreon/commit/099f5746a8069326e9dccf5c46c405afa2220e46) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multiplatform `useFetch` lands end-to-end. `@pyreon/hooks` gains the web half — a thin reactive JSON fetch (`{ data, error, isPending, refetch }` signals) matching the contract PMTC compiles to native `PyreonFetch` containers; abort-safe on refetch/unmount (stale responses can never clobber fresh ones). Native compiler: `??` nullish coalescing lowers to Swift `??` / Kotlin Elvis `?:`; fetch-field call reads (`quotes.data()`) rewrite to property/`.value` reads; computeds over fetch data infer the decoded type (was `Any`); synthesized Kotlin data classes carry `@Serializable` (inline object types in fetch generics previously failed real kotlinx-serialization builds); `<Text>`/`<Heading>` thread `data-testid` to `.accessibilityIdentifier` / `Modifier.testTag` on BOTH targets (third instance of the device-found tag-drop class — the Android tasks Espresso failure's root cause).

### Patch Changes

- [#1503](https://github.com/pyreon/pyreon/pull/1503) [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add canonical runtime environment flags `isServer` / `isClient` to `@pyreon/reactivity` (re-exported from `@pyreon/core`).

  `isServer` is `typeof document === 'undefined'` — the most reliable "is there a DOM" discriminator (more correct than `typeof window`, which misreports Deno and polyfilled Node). Plain runtime constants, evaluated once at module load: correct in every runtime with zero bundler configuration. Use them for small environment guards (module-level singletons, lazy globals, render output that differs server vs client); for heavy server-only code prefer a `/server` subpath export, and for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

  Internally, this replaces seven hand-rolled `typeof window` / `typeof document` env consts across `router`, `hooks`, `url-state`, `elements`, `ui-core`, and `styler` with the single primitive — removing the drift (the copies disagreed on `window` vs `document`) and the inconsistency. Behavior is unchanged in browsers and Node; the `window` → `document` switch is a strict improvement for Deno / Web Workers.

  `@pyreon/lint`'s `no-window-in-ssr` rule now recognises an imported `isClient` / `isServer` (or `isBrowser` / `isSSR`) as an SSR guard — but only when imported from `@pyreon/reactivity` or `@pyreon/core`, so `if (isClient) window.x` / `if (isServer) return` / `if (!isClient) return` are clean while a same-named local `const isBrowser = true` or a foreign-source import stays flagged.

- [#1534](https://github.com/pyreon/pyreon/pull/1534) [`3f551b5`](https://github.com/pyreon/pyreon/commit/3f551b5187511a3325d426fcad7696d2cc530e09) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal refactor: replace hand-rolled `typeof window/document` environment checks with the canonical `isServer` / `isClient` primitives from `@pyreon/reactivity`.

  - **@pyreon/hooks** (7 sites): `useWindowResize`, `useBreakpoint`, `useScrollLock`, `useIsomorphicLayoutEffect`, `useInfiniteScroll`.
  - **@pyreon/dnd** (5 sites): the SSR-guard early-returns in `useDraggable`, `useDroppable`, `useSortable`, `useFileDrop`, `useDragMonitor`.

  Behavior is identical — `isServer`/`isClient` are defined as `typeof document {===,!==} 'undefined'` — but the framework now uses its own primitive instead of dogfooding the pattern its own lint rule (`pyreon/prefer-isserver`) flags. No public API change.

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/styler@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.29.0

### Patch Changes

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`f4ea1a1`](https://github.com/pyreon/pyreon/commit/f4ea1a1e5af38b37b4eb2feb14f4594e3c3c3482), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.28.1

### Patch Changes

- [#1214](https://github.com/pyreon/pyreon/pull/1214) [`b6ad934`](https://github.com/pyreon/pyreon/commit/b6ad934a63fc481b7662ba67925e1bbb0d9aed79) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(hooks): cover onUnmount cleanup paths across 7 hooks — 94.9 → 96.39

  Adds `cleanup-paths-coverage.test.ts` that captures `onUnmount` callbacks
  via a vitest mock, runs each hook, manually invokes the captured cleanup,
  and asserts the cleanup side-effect (event listener removed, timer
  cleared, throttle/debounce cancelled, effect stopped) actually happened.

  Covers previously-uncovered cleanup bodies in `useEventListener`,
  `useThrottledCallback`, `useDebouncedCallback`, `useTimeout`,
  `useUpdateEffect`, plus the `useThemeValue` no-theme guard and
  `useDebouncedValue` timer-clear path.

  Hooks 94.9% → 96.39%; threshold bumped 94 → 95.

- [#1265](https://github.com/pyreon/pyreon/pull/1265) [`599e184`](https://github.com/pyreon/pyreon/commit/599e184941d6251affa85946a54bd1d5fce65bb3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branches coverage 83.25% → 85.16%. Add 5 SSR-fallback tests (useThemeValue no-context, useOnline SSR, useEventListener SSR no-op, useClipboard SSR + clipboard-rejection). Bump `branches` threshold 75 → 85, `lines` 94 → 95. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.

- [#1291](https://github.com/pyreon/pyreon/pull/1291) [`aa74128`](https://github.com/pyreon/pyreon/commit/aa741283b2d6e971aff9be8361bb9e632188855e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 85.16% → 96.49%. Annotated structurally-unreachable defensive paths with `/* v8 ignore */`: SSR/`typeof window/document` guards across `useBreakpoint` / `useScrollLock` / `useWindowResize` / `useIsomorphicLayoutEffect`; `Intl` fallback in `useTimeAgo.defaultFormatter`; defensive timer/cleanup state checks in `useClipboard` / `useDialog` / `useDebouncedValue`; theme-falsy guard in `useThemeValue`. Bumped vitest `branches: 85 → 95`.

- Updated dependencies [[`ad5bd29`](https://github.com/pyreon/pyreon/commit/ad5bd29dbed3ee0517bddf63ff839c427bfd7edf), [`e975f3a`](https://github.com/pyreon/pyreon/commit/e975f3aa9a5ca0fa7983c8f4fa47c412cea7d735), [`4058727`](https://github.com/pyreon/pyreon/commit/40587271deeb30f968dcf297ee7781e2993ca1e8), [`cb4e2e6`](https://github.com/pyreon/pyreon/commit/cb4e2e6e96de147089fd80ba782152865ec6695a)]:
  - @pyreon/ui-core@0.28.1
  - @pyreon/styler@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.27.1
  - @pyreon/ui-core@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.26.3
  - @pyreon/ui-core@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.26.2
  - @pyreon/ui-core@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [[`487f1aa`](https://github.com/pyreon/pyreon/commit/487f1aa56e3b10746366f17deff2f4ba4cae827b), [`5af2864`](https://github.com/pyreon/pyreon/commit/5af28641ab1ad31a0c3feaf1c6a95163e83935d3)]:
  - @pyreon/styler@0.26.1
  - @pyreon/ui-core@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`448073c`](https://github.com/pyreon/pyreon/commit/448073c3066bda0e54c71d85cf6bcfebc148a6f0), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/styler@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/styler@0.25.1
  - @pyreon/ui-core@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/ui-core@0.25.0
  - @pyreon/styler@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/styler@0.24.6
  - @pyreon/ui-core@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/styler@0.24.5
  - @pyreon/ui-core@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/styler@0.24.4
  - @pyreon/ui-core@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies [[`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb)]:
  - @pyreon/ui-core@0.24.3
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/styler@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/styler@0.24.2
  - @pyreon/ui-core@0.24.2

## 0.24.1

### Patch Changes

- [#793](https://github.com/pyreon/pyreon/pull/793) [`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): port vitus-labs perf cleanups — measured net wins only

  Mirror the structural cleanups from vitus-labs/ui-system PRs [#244](https://github.com/pyreon/pyreon/issues/244) → [#254](https://github.com/pyreon/pyreon/issues/254)
  across Pyreon's ui-system. Each port carries an inline comment naming the
  source commit + the upstream-measured delta.

  **Policy: only ports that show measurably better under Pyreon's runtime
  were kept.** Two upstream changes were measured neutral/worse here and
  deliberately reverted:

  - `styler.hashUpdate` 4-char unroll — measured +1.6% short / +2.1% long
    under Bun (both inside the ±2% JIT noise band). Reverted to the simple
    single-char loop.
  - `elements.Iterator` filterValidItems + detectKind fusion — measured
    -16.3% on a 20-item all-valid complex list (V8's `.filter()` is
    hyper-optimized for arrays with primitive predicates; manual fusion
    loses for small all-valid inputs). Reverted to the two-pass shape.

  **Measured wins** (paired before/after micro-bench via
  `bun scripts/perf/port-vitus-labs-bench.ts`, Bun 1.3.13, 3 warmup + 7
  timed runs, report median):

  - `styler.CSSResult._staticResolved` cache (8 repeats): **+85.3%**
  - `attrs.removeUndefinedProps` (10-prop input): **+77.4%**
  - `unistyle.shouldNormalize` (5-key static): **+66.0%**
  - `rocketstyle.pickStyledAttrs` (10-prop input): **+64.4%**
  - `hooks.useBreakpoint buildSortedBpTuples` (5-bp): **+46.5%**
  - `unistyle.createMediaQueries` (5-bp theme): **+31.7%**
  - `unistyle.alignContent isReverted` (mixed): **+30.0%**
  - `unistyle.shallowEqual` (5-key equal): **+27.4%**
  - `elements.Overlay click-close check`: **+20.5%**
  - `styler.HTML_PROPS Set→null-proto-obj` (5-key mix): **+8.3%**
  - `styler.splitRules charCodeAt vs str[i]`: **+8.0%**

  Plus 6 structural cleanups (no perf claim, allocation reductions only):

  - `styler.globalStyle` length-check vs `.trim()`
  - `unistyle.normalizeTheme` / `transformTheme` for-in (drops
    Object.entries tuple-array allocations)
  - `rocketstyle` `PSEUDO_AND_META_KEYS` module-scope hoist (per-definition
    allocation removed)
  - `rocketstyle.getThemeByMode` recursive for-in
  - `coolgrid.useGridContext` direct prop access (drops `pickThemeProps`
    wrapper — 2 `get()` calls saved per render)
  - `elements.Text` ternary tag assignment (drops `renderContent` closure)

  **Behavioural lock-in tests** (ported from vitus-labs `60fc25c1`, 8 new
  specs in `@pyreon/styler`):

  - `CSSResult._isDynamic` memoization: populate-on-first / cache-on-
    subsequent (values-mutation sentinel) / nested-propagation.
  - `CSSResult._staticResolved` cache: populate-on-first / cache-hit-via-
    sentinel / no-cache-for-dynamic / fallthrough-when-unclassified.
  - LRU-2 cacheRef test was React-specific and not ported (Pyreon uses
    signals, not React refs).

  **Bisect-verified-with-restore**:

  - Disabled `_isDynamic` cache → `× returns cached result on subsequent
calls without rescanning values` fires; restored → 425/425 pass.
  - Disabled `_staticResolved` cache → 2 lock-in specs fire; restored →
    425/425 pass.

  **Honest framing**: micro-benches isolate ONE hot path under tight loops;
  real-app aggregate deltas are smaller because each path is 1-10% of
  per-component mount-time, not 100%. Real-app benchmark
  (`examples/benchmark/`) NOT re-run for this PR — the proof here is
  per-function structural wins, not a real-app headline number.

  **Verification**:

  - 1832 tests pass: styler 425 (+8 lock-ins) + unistyle 240 + rocketstyle
    290 + attrs 89 + coolgrid 106 + elements 463 + hooks 219.
  - Browser smokes: elements 16, styler 12, rocketstyle 12, unistyle 6,
    coolgrid 7 — all pass.
  - lint, typecheck, gen-docs --check, check-doc-claims, check-manifest-
    depth, check-distribution, check-bundle-budgets: all green.

- Updated dependencies [[`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9)]:
  - @pyreon/styler@0.24.1
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/ui-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/styler@0.24.0
  - @pyreon/ui-core@0.24.0

## 0.23.0

### Patch Changes

- [#730](https://github.com/pyreon/pyreon/pull/730) [`053c0a8`](https://github.com/pyreon/pyreon/commit/053c0a86d36b538489f1a0dd29561317eaa78c2b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(fundamentals): three correctness/leak bugs surfaced by the post-[#725](https://github.com/pyreon/pyreon/issues/725)/[#729](https://github.com/pyreon/pyreon/issues/729) leak-class sweep

  Audit pass across all 22 `@pyreon/*` fundamentals packages for the same patterns that drove [#725](https://github.com/pyreon/pyreon/issues/725) (position-based pop on a shared module-level stack) and [#729](https://github.com/pyreon/pyreon/issues/729) (sibling-unmount LIFO violation). Found 3 verified bugs in 2 packages (`@pyreon/hooks`, `@pyreon/storage`) plus one Class-F adjacent in `@pyreon/charts`. Each is bisect-verified or code-verified at source; each ships with an honest test or a clear in-source rationale.

  ### 1. `@pyreon/hooks` — `useDialog` crashes on unmount

  The ref callback typed its parameter as `(el: HTMLDialogElement) => void`. Pyreon's `RefCallback<T>` contract: refs fire with the element on mount AND with `null` on unmount. The pre-fix body unconditionally called `el.addEventListener('close', handler)` after assigning `dialogEl = el`, so when the ref fired with `null` on unmount, `null.addEventListener` threw `TypeError: Cannot read properties of null (reading 'addEventListener')`. Every consumer of `useDialog` crashed on unmount.

  Fix: ref param typed `HTMLDialogElement | null`; null path cleans up the previous binding and early-returns before the addEventListener call. Regression test in `useDialog.test.ts` bisect-verified: revert → `expected [Function] to not throw an error but 'TypeError: Cannot read properties of null'` was thrown; restored → pass.

  ### 2. `@pyreon/storage` — cross-tab listener detached when one consumer of N calls `.remove()`

  The `useStorage` cross-tab listener was retained ONCE per unique-key signal creation, NOT per consumer. Same-key cached returns skipped the retain. `.remove()` always released — driving the refcount below the actual consumer count.

  Real-app symptom: N components each call `useStorage('theme', 'light')`. They all share the same cached signal (correct). One component calls `.remove()` (clear storage, reset to default). The cross-tab listener is detached AND the registry entry is deleted. Now cross-tab `storage` events for 'theme' don't reach the surviving N-1 consumers — they're silently orphaned from the cross-tab pipeline.

  Fix:

  - Same-key cached returns ALSO retain the cross-tab listener (refcount now matches consumer count).
  - `.remove()` no longer deletes the registry entry — keeps it so the listener's dispatch table remains intact for surviving consumers. The registry entry is small (one Map entry per key); the residual cost is negligible vs silently breaking cross-tab sync.

  Regression test in new `cross-tab-refcount.test.ts` — bisect-verified: revert → `Expected: "dark", Received: "light"` (surviving consumer never received the cross-tab event); restored → pass.

  NOT fixed in this PR (deliberate scope): `.remove()` idempotency from the same consumer. Currently `t.remove(); t.remove()` double-releases the refcount. The fix requires per-consumer disposal state (separate wrapper per `useStorage` call), which is a larger refactor.

  ### 3. `@pyreon/charts` + `@pyreon/storage` — rejected dynamic-import / IndexedDB-open cached forever (Class F)

  Both `@pyreon/charts/src/loader.ts:loadAndRegister` and `@pyreon/storage/src/indexed-db.ts:openDB` cached `loader().then(...)` (resp. `new Promise(...)`) in a module-level `Map<string, Promise<...>>` keyed by module name / db key. Without a `.catch` clearing the entry on rejection, a single transient failure (CDN blip during initial chart render, IndexedDB quota exceeded) cached the rejected promise FOREVER — every subsequent retry of the same key returned the same cached rejection until page reload.

  Memory cost: bounded by ~50 module keys (charts) or unique `(dbName, storeName)` pairs (storage). Functional cost: the affected feature is permanently broken until reload.

  Fix: `.catch(err => { inflight.delete(key); throw err })` (same shape in both files). The `.catch` re-throws so this attempt's caller still sees the original error; subsequent retries get a fresh import / open attempt.

  Code-verified at source; no dedicated regression test in this PR (requires either mocked dynamic-import infra for charts, or a fake-indexeddb harness for storage — separable follow-ups).

  ### Audit byproducts (NOT fixed in this PR)
  - `@pyreon/code` `<CodeEditor>` component does not call `instance.dispose()` on unmount. Could be a design choice (user owns lifecycle since `instance` is an external prop) OR a documentation gap. Worth deciding deliberately, not bundled here.
  - `@pyreon/state-tree` `_hookRegistry` accepts dynamic IDs without bound — would leak if app generates IDs at runtime (uncommon — typical usage is static IDs).
  - `@pyreon/url-state` per-instance popstate listeners (no shared registry like storage has) — inefficient at scale but not a leak.
  - `@pyreon/rx` `distinct` / `scan` effects do not expose `dispose` while `debounce` / `throttle` do — minor API inconsistency only matters in out-of-component usage.

  All separately filed-worthy; deliberately scoped out of this PR.

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/styler@0.23.0
  - @pyreon/ui-core@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/styler@0.22.0
  - @pyreon/ui-core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/styler@0.21.0
  - @pyreon/ui-core@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/styler@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/ui-core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/styler@0.19.0
  - @pyreon/ui-core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/styler@0.18.0
  - @pyreon/ui-core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/styler@0.17.0
  - @pyreon/ui-core@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`53b230c`](https://github.com/pyreon/pyreon/commit/53b230cc9715129af0088da516f572e6572a2117), [`3b61ea9`](https://github.com/pyreon/pyreon/commit/3b61ea986e45fa5c4560d766532123276033abb8)]:
  - @pyreon/core@0.16.0
  - @pyreon/styler@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/ui-core@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/styler@0.14.0
  - @pyreon/ui-core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/styler@0.13.0
  - @pyreon/ui-core@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/styler@0.12.15
  - @pyreon/ui-core@0.12.15

## 0.12.14

### Patch Changes

- [#234](https://github.com/pyreon/pyreon/pull/234) [`a8ab19d`](https://github.com/pyreon/pyreon/commit/a8ab19d2db8b764f3643f2fa50f721727b8ba0d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hooks anti-pattern cleanup + lint rule precision improvements

  `@pyreon/hooks`:

  - `useClipboard`: batch `text.set()` + `copied.set()` in the success branch so
    subscribers reading both see one update, not two. Added
    `typeof navigator === 'undefined'` early-return in `copy()` for SSR safety.
  - `useBreakpoint`, `useFocusTrap`, `useWindowResize`: listeners moved INSIDE
    `onMount` (co-located with their `window`/`document` registration) and
    cleanup returned from `onMount` instead of using a separate `onUnmount`
    call. Matches the Pyreon convention that `onMount` accepts a cleanup
    return value.
  - `useInfiniteScroll.setup()` and `useScrollLock.lock()/unlock()`: added
    `typeof document === 'undefined'` early-returns to make the SSR-safety
    contract explicit at the callsite (previously relied on ref-callbacks never
    firing on the server — brittle).

  `@pyreon/lint` — `no-window-in-ssr` rule precision (fewer false positives,
  fewer silent false negatives):

  - Track `typeof X` expressions via `UnaryExpression` enter/exit depth instead
    of the inert `parent.operator === 'typeof'` check (oxc's visitor does NOT
    pass `parent`).
  - Skip member-expression property names (`x.addEventListener`),
    object-property keys (`{ document: 1 }`), and import-specifier names via
    WeakSet pre-marking, for the same reason.
  - Skip TypeScript type-position nodes (`let x: Window`, `type T = Document`,
    etc.) via `TSTypeAnnotation`/`TSTypeReference`/`TSTypeAliasDeclaration`/
    `TSInterfaceDeclaration`/`TSTypeParameter` depth counter — type refs are
    erased at compile time, not runtime accesses.
  - Recognise `const isBrowser = typeof window !== 'undefined'` idiom: `if
(isBrowser) { … }` is now treated the same as `if (typeof window !==
'undefined') { … }`.
  - Recognise early-return-on-typeof guards: `if (typeof X === 'undefined')
return …` makes the rest of the function body implicitly typeof-guarded.
    Supports OR-chained form (`typeof X === 'undefined' || typeof Y ===
'undefined'`) for features needing multiple browser APIs.
  - Treat `onUnmount`, `onCleanup`, `effect`, `renderEffect` as safe contexts
    (same as `onMount`) — these only run after mount in the browser.
  - Ternary `typeof X !== 'undefined' ? safe : fallback` now tracked via
    `ConditionalExpression` enter/exit.

  `@pyreon/lint` — other rules fixed for the same oxc-no-parent root cause:

  - `no-props-destructure`: pre-mark `CallExpression` arguments via WeakSet so
    HOC factory args (`createLink(({ href }) => <a />)`) are correctly skipped
    — previously the `parent?.type === 'CallExpression'` check was inert.
  - `no-unbatched-updates`: added `schema: { exemptPaths: 'string[]' }` option
    so test files can be exempted from the rule (tests often need deliberate
    sequential `.set()` calls to observe intermediate debounce/throttle state).

  `@pyreon/lint` — type hygiene:

  - `VisitorCallback` signature narrowed to `(node: any) => void`. The earlier
    `parent?: any` second parameter was a false promise — oxc's walker never
    passes `parent`, and rules silently depended on an `undefined` value.

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/styler@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/styler@0.12.13
  - @pyreon/ui-core@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/styler@0.12.12
  - @pyreon/ui-core@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/styler@0.12.11
  - @pyreon/ui-core@0.12.11

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2
  - @pyreon/styler@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1
  - @pyreon/styler@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3
  - @pyreon/styler@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
  - @pyreon/styler@0.0.2
