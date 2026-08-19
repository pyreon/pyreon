# @pyreon/primitives

## 0.52.0

### Minor Changes

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

- Add `connectWebHost()` — the reusable guest-side glue for the `<WebView>` bridge, the other half of the WebView-host pattern that lets web-only-rich packages (charts / flow / rich-text / code / document) run 1:1 on iOS/Android by hosting the same web bundle inside a native WebView. A bundle calls `connectWebHost()` to read host-pushed props (`data()` / `onData`, fired on every `pyreondata` push) and send events back (`emit` → the host `onMessage`) — identical code on web, iOS, and Android, so it replaces the hand-rolled `window.__pyreonData` / `window.pyreonPostMessage` wiring with one tested implementation. (b9c82f6)
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

### Patch Changes

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- Updated dependencies:
  - @pyreon/core@0.52.0
  - @pyreon/reactivity@0.52.0

## 0.51.0

### Minor Changes

- Add `useNativeModule` / `defineNativeModule` — the FFI escape hatch for user-defined native modules. (7417fdb)

  Platform services were previously recognised by hard-coded hook name inside the PMTC compiler, so adding any capability the framework did not ship (Bluetooth, ARKit, a payments or analytics SDK) required a framework PR. `<NativeIOS>` / `<NativeAndroid>` did not help: they compile their children through the normal canonical-primitive path, so they BRANCH between platforms rather than hosting raw platform code.

  `useNativeModule<T>('Name')` lowers to an instance of a class the app provides — `Name()` on iOS, `Name(context)` on Android — and passes member calls through verbatim, so the platform compiler type-checks the surface. `await mod.method()` composes with the existing async lowering with no extra machinery. On web the same call resolves the implementation registered by `defineNativeModule`, so one source still runs on all three targets; `hasNativeModule` feature-gates without throwing.

  The module name must be a string literal at the call site and a valid identifier (it is emitted verbatim as a native type name); anything else is a named compiler warning and the declaration is skipped rather than mis-emitted.

  Device-proven on iOS (XCUITest asserts a value produced by an app-provided `DeviceInfo` Swift class) with the Android half asserted in the Compose instrumented test.

- `<Press>` gains the swipe vocabulary: `onSwipeLeft` / `onSwipeRight` fire on a horizontally-dominant ≥40px pointer delta. On web a pointer-delta polyfill (a swipe suppresses the same gesture's click, so one gesture is never both a swipe and a press); via PMTC, iOS lowers to a simultaneous `DragGesture` (taps still fire `onPress`) and Android to `pointerInput { detectHorizontalDragGestures }` (direction-locked — taps and vertical scrolls pass through). (9154c8a)
- `<Video src autoPlay? loop? muted? controls? onStatusChange?>` — the canonical video-playback primitive. Web `<video>` (playsinline, media events → `onStatusChange`); iOS `PyreonVideoPlayer` (AVKit `VideoPlayer` over `AVPlayer`, KVO `timeControlStatus` → the same `waiting`/`playing`/`paused` vocabulary); Android `PyreonVideoPlayer` (Media3 ExoPlayer in an `AndroidView`, `Player.Listener`). The create-multiplatform Android template gains the media3 artifacts — and the okhttp artifact the runtime srcDir has required since the networking arc (absent from the template, masked because scaffolds install the runtime from npm, which lagged the workspace; the next release would have shipped scaffolded Android apps uncompilable). (5ca9b4c)

### Patch Changes

- Tests for the two modules that landed under-covered today and turned `Coverage (Full)` red on every main run. (3c79989)

  `<Video>` (the canonical media primitive) shipped at 8.33% statements, dragging `@pyreon/primitives` to 96.78% against its 99% gate. It now has happy-dom coverage for the whole contract: src dispatch (bare name → bundled asset, absolute URL and path-style pass through untouched), the autoplay/loop/muted defaults, unconditional `playsinline`, dimension resolution, and the three-media-event → `onStatusChange` mapping where `pause` → `'paused'` is the rename most likely to be got wrong. 96.78% → 99.73%.

  `hydration-plan.ts` (row-plan replay hydration) shipped at 72.57% statements / 59.34% branches. The new tests target its BAIL contract, which is where a fast path's correctness actually lives — every row shape outside the supported grammar must be refused rather than half-understood — plus `tplAdoptVerify`. 72.57% → 78%.

- `@pyreon/loom`: the phantom detector now recognizes the DefinitelyTyped (19ee507)
  pattern (a declared `@types/x` twin satisfies a type-only import of `x`,
  scoped names included), the lexical scanner requires the import KEYWORD to
  sit in code (a `from '…'` inside a string — rule messages, fix catalogs,
  generated examples — never scans as an import), subtrees with their own
  package.json are separate units, and a root `loom.ignore` (reason
  REQUIRED) downgrades findings to info with the reason attached — never a
  silent drop.

  The other packages: devDependency range alignment only (same-major sync
  surfaced by `loom scan`); no runtime change.

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

- Updated dependencies:
  - @pyreon/reactivity@0.51.0
  - @pyreon/core@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7)]:
  - @pyreon/core@0.50.0
  - @pyreon/reactivity@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/reactivity@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/core@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715)]:
  - @pyreon/core@0.47.0
  - @pyreon/reactivity@0.47.0

## 0.46.0

### Patch Changes

- [#2280](https://github.com/pyreon/pyreon/pull/2280) [`ac1e2f4`](https://github.com/pyreon/pyreon/commit/ac1e2f445468139132b32f1e27f0f21f2d0d3a08) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(primitives): document `init`/`resetPrimitivesConfig` and name the full escape-hatch trio in the manifest. Adds the router-agnostic runtime-config entry (`init({ navigate })` upgrades `<Link>` from a full-reload `<a href>` to SPA navigation; `resetPrimitivesConfig` clears it for tests) — a real footgun that was undocumented. Also renames the escape-hatch entry `Web` → `Web / NativeIOS / NativeAndroid` so all three components are discoverable by name, with a source-verified summary (`<NativeIOS>`/`<NativeAndroid>` return null on web; PMTC emits their children only on the native target). Regenerates the MCP api-reference + docs-site reference page.

- Updated dependencies [[`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435)]:
  - @pyreon/reactivity@0.46.0
  - @pyreon/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/reactivity@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/core@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Minor Changes

- [#1809](https://github.com/pyreon/pyreon/pull/1809) [`4ae20c2`](https://github.com/pyreon/pyreon/commit/4ae20c27a7da9d39395b54f05c8f4fce983cf3b6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `accessibilityRole` to the cross-platform `AccessibilityProps` vocabulary — a constrained, cleanly-mapping semantic-role enum (`'button' | 'image' | 'header'`) that lowers to the native a11y model on every target: web `role` (`button`/`img`/`heading`), iOS accessibility traits (`.isButton`/`.isImage`/`.isHeader`), and Android Compose `Role.Button`/`Role.Image` / `heading()`. Write the role once; each platform emits its idiom. (The PMTC Swift/Kotlin emit + stubs are in the private `@pyreon/native-compiler`.)

- [#1758](https://github.com/pyreon/pyreon/pull/1758) [`901dd41`](https://github.com/pyreon/pyreon/commit/901dd41924b1ba768fadc794dab63514da84ce24) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add a cross-platform accessibility vocabulary (`AccessibilityProps`) to every
  canonical primitive: `accessibilityLabel` and `accessibilityHidden`. These are
  platform-NEUTRAL a11y props — write them once and each target lowers them to
  its native a11y model (`accessibilityLabel` → web `aria-label` / iOS
  `.accessibilityLabel` / Android `semantics { contentDescription }`;
  `accessibilityHidden` → web `aria-hidden="true"` / iOS `.accessibilityHidden` /
  Android `semantics { invisibleToUser }`).

  **Web lowering ships now** (via `collectPassthroughAttrs`): a raw
  `aria-label`/`aria-hidden` still wins as the explicit web override, and
  `accessibilityHidden` emits the string `"true"` (never presence-only `""`,
  which assistive tech ignores). The iOS/Android PMTC emit is a tracked
  follow-up — until it lands, native targets render without the a11y attribute
  (graceful, no crash). Prefer these over raw `aria-*` (web-only) so the same
  component is accessible on every target.

- [#1824](https://github.com/pyreon/pyreon/pull/1824) [`e58e897`](https://github.com/pyreon/pyreon/commit/e58e89735a5700796048b918628e546b347d99a7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The web `<Toggle>` now renders `<input type="checkbox" role="switch">` instead of a bare checkbox. It keeps the checkbox's universal keyboard + form behavior (Space toggles, `checked` drives `aria-checked`) but assistive tech now announces it as an on/off **switch** — matching the iOS `Toggle` / Android `Switch` it lowers to on native targets, so the same `<Toggle>` is announced consistently on every platform. The W3C Switch pattern explicitly endorses `input[type=checkbox][role=switch]`. No interaction or API change; web-only (the native PMTC emit is unaffected).

### Patch Changes

- [#1664](https://github.com/pyreon/pyreon/pull/1664) [`c7c27e8`](https://github.com/pyreon/pyreon/commit/c7c27e8b14aae2852ffcb3ab513b560b06a2ce3a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the missing MIT `LICENSE` file. `@pyreon/primitives` is published with `LICENSE` in its `files` array but the file itself was absent from the package, so the published tarball shipped without a license. Adds the standard MIT license (identical to its sibling `@pyreon/core` packages) — no code change.

- [#1634](https://github.com/pyreon/pyreon/pull/1634) [`243ed9a`](https://github.com/pyreon/pyreon/commit/243ed9a1876867dbf67d61c0879a6738c81808a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/primitives` now has a manifest, so the 15 canonical multiplatform primitives (Stack/Inline/Layer/Scroll/Spacer/Text/Heading/Image/Icon/Button/Press/Link/Field/Toggle/Modal) plus `<WebView>` and the `<Web>`/`<NativeIOS>`/`<NativeAndroid>` escape hatches are queryable via the MCP `get_api` tool (and appear in `llms.txt` / `llms-full.txt`). Each entry documents the real props, the per-target mapping (DOM / SwiftUI / Compose), and the native gotchas (e.g. `<Inline>` is a non-wrapping `Row` on Android, `onPress`/`onChangeText` canonical handlers). This is the AI-facing primitive reference for building multiplatform apps one-shot; pair it with `get_pattern({ name: "multiplatform" })`.

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165)]:
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Minor Changes

- [#1583](https://github.com/pyreon/pyreon/pull/1583) [`e81506f`](https://github.com/pyreon/pyreon/commit/e81506ff3ad55054a3b7ad3e2c1c379a1c5143cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the escape-hatch primitives `<Web>` / `<NativeIOS>` / `<NativeAndroid>` — Layer-4 per-platform branch selection for multiplatform apps. Exactly one branch renders per target: on web, `<Web>` renders its children and `<NativeIOS>`/`<NativeAndroid>` render nothing; the PMTC compiler mirrors this on native (iOS emits the `<NativeIOS>` branch, Android the `<NativeAndroid>` branch, each dropping the others). This lets one source carry a platform-specific subtree — e.g. a web-only-rich chart behind `<Web>` and a native equivalent behind `<NativeIOS>`/`<NativeAndroid>` — and is the foundation for the heavy-viz multiplatform story (the planned `<WebView>` embed builds on it). Verified end-to-end: a scaffolded app using all three builds on both an Android emulator and an iOS Simulator, and the web runtime renders the matching branch only.

- [#1603](https://github.com/pyreon/pyreon/pull/1603) [`1c2bf3b`](https://github.com/pyreon/pyreon/commit/1c2bf3b8cf8ab68f6fb4af1a6ceca6c34ce902ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(native): `<WebView data={signal}>` live-data bridge

  `<WebView>` gains a `data` prop — reactive data pushed into the hosted page as `window.__pyreonData` (a `pyreondata` event fires on change), so a chart/flow hosted in a WebView follows signals **without reloading**. On web the iframe's `contentWindow.__pyreonData` is set directly (same-origin / srcdoc); on native (via PMTC) the value is JSON-encoded and pushed via `evaluateJavaScript` / `evaluateJavascript`.

- [#1584](https://github.com/pyreon/pyreon/pull/1584) [`6176e46`](https://github.com/pyreon/pyreon/commit/6176e46996a4e946f8324535d661b2c9f5598b2b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the `<WebView>` primitive — the native host that embeds web content inside a native shell, the unlock for using web-only-rich viz (`@pyreon/charts` / `@pyreon/flow` / heavy tables) in a multiplatform analytical app. `<WebView html="…" />` (inline HTML) or `<WebView src="…" />` (a local bundled asset — policy-safe — or a remote URL) compiles to a `WKWebView` on iOS (`PyreonWebView` in `@pyreon/native-runtime-swift`), an Android `WebView` via `AndroidView` (`PyreonWebView` in `@pyreon/native-runtime-kotlin`), and an `<iframe>` on web. Proven end-to-end: a `.tsx` using `<WebView html="…SVG chart…">` builds, installs, launches, and runs on both an iOS Simulator and an Android emulator. v1 requires a static `html`/`src` string (a dynamic value warns + emits an empty host); the reactive signal bridge is the planned follow-up. Pairs with the `<Web>`/`<NativeIOS>`/`<NativeAndroid>` escape hatches to render charts inline on web and via a hosted webview on native, from one source.

- [#1610](https://github.com/pyreon/pyreon/pull/1610) [`3e79430`](https://github.com/pyreon/pyreon/commit/3e7943046b11777123e45ea777ba134daee8a0a6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(primitives): `<WebView onMessage>` reverse bridge — the hosted page sends strings back to the host via the unified `window.pyreonPostMessage("…")` API, delivered to the `onMessage` callback. On web the parent defines `window.pyreonPostMessage` on the iframe (same-origin / `srcdoc`); on iOS it's a `WKScriptMessageHandler` and on Android a main-thread-marshalled `@JavascriptInterface` (PMTC-emitted). Enables webview-hosted viz (charts / flow) to drive native signals — e.g. a tapped chart bar updating a native selection.

### Patch Changes

- [#1601](https://github.com/pyreon/pyreon/pull/1601) [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal: remove provably-unreachable defensive branches + harden test coverage
  (no behavior change).

  `SizedMap.set`'s eviction and `Cell.listen`'s promote-to-Set both guarded a
  value that the surrounding invariant guarantees is always defined
  (`maxEntries >= 1` ⇒ non-empty map on evict; the promote branch only runs when
  a single listener exists). Replaced the dead `!== undefined` / truthy guards
  with a documented type assertion (the codebase's sanctioned pattern for
  provably-safe paths), eliminating uncoverable branches. SizedMap → 100% branch
  coverage; reactivity branch coverage improved. Added selector tests for the
  3rd-subscriber and selection-leaves-a-multi-subscriber-key paths.

  `@pyreon/head`'s `createNewTag` SSR guard is documented + `v8 ignore`d as the
  unreachable defensive guard it is (the only caller, `syncDom`, already returns
  on `document === undefined`); added a node-environment test that exercises the
  true SSR function-input path of `useHead`. head → 100% statements/functions/
  lines, 98.3% branches.

  `@pyreon/primitives`' web `<Button>` drops an uncoverable `?? {}` fallback in
  favor of a documented assertion (the `primary` key is statically defined).
  Added targeted tests for the residual web-primitive branches — plain-value
  (non-signal) `value`/`checked`, the asset-name `src` dispatch, and the defensive
  guard false-paths in Field/Text/Press/WebView. primitives → 100% across all four
  metrics.

  `@pyreon/runtime-server` gains SSR edge-case + dev-mode/prod-mode coverage
  (documenting that `__DEV__` is a module-load constant, so both gate sides need
  separate NODE_ENV runs) and three documented `v8 ignore`s for genuinely-
  unreachable defensive arms (the outside-ALS context-stack fallback, the
  For-symbol function-each the For component pre-resolves, the stream context-store
  nullish fallback). statements/functions/lines → 98%+, branches 88.4% → 95.2%
  (a pre-existing RED branch gate, now green). No behavior change.

  `@pyreon/create-zero`'s `listFiles` walk uses a plain `else` for the
  non-directory case (a template tree is files-or-dirs only — no symlinks), and
  gained `substitute` tests covering the unknown-`{{key}}`-kept-verbatim branch.
  create-zero → 100% statements/functions/lines, 98.7% branches (one defensive
  unreachable branch remains in the dep-version resolver).

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Minor Changes

- [#1530](https://github.com/pyreon/pyreon/pull/1530) [`6ea99ae`](https://github.com/pyreon/pyreon/commit/6ea99ae5ec9724b457459a180798abb7183b941f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Image asset pipeline (multiplatform production Phase 1): the web `<Image>` primitive now resolves BARE src names (`logo.png` — no scheme, no slash) to `/assets/<name>` so the same shared source that bundles via Assets.xcassets (iOS) / res/drawable density buckets (Android) serves the materialized copy on web. The `create-multiplatform` scaffold's build scripts run the new `pyreon-native assets` step automatically when an `assets/` directory exists.

- [#1536](https://github.com/pyreon/pyreon/pull/1536) [`e9d5128`](https://github.com/pyreon/pyreon/commit/e9d51287ff8beb5951456023a60c50714670d0d7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Custom fonts in the multiplatform asset pipeline: `<Text font="Name">` / `<Heading font="Name">` render a bundled `.ttf`/`.otf` from the shared `assets/` dir. iOS bakes the font's PostScript name (read from the sfnt name table — `Font.custom` rejects the filename and silently falls back otherwise); Android resolves `res/font` at runtime; web sets `font-family`.

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

- [#1290](https://github.com/pyreon/pyreon/pull/1290) [`d716811`](https://github.com/pyreon/pyreon/commit/d716811ec3bb853b628c3d28d710b6a34b20beb3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift branch coverage 93.4% → 95.43%. Added fallback tests for `resolveSpace` / `resolveColor` / `resolveRadius` covering the out-of-range numeric index, unknown semantic name, unknown color token, and unknown radius defensive `?? '0'` / `?? text` paths in `web/tokens.ts`. Bumped vitest `branches: 85 → 95`.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.1.0

### Patch Changes

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
