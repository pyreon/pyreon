# @pyreon/create-multiplatform

## 0.38.0

## 0.37.1

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

### Patch Changes

- [#1570](https://github.com/pyreon/pyreon/pull/1570) [`445a0f1`](https://github.com/pyreon/pyreon/commit/445a0f1d9c7958056d11422b4a12402a425c8d06) Thanks [@vitbokisch](https://github.com/vitbokisch)! - create-multiplatform: scaffolded native apps now build + launch end-to-end. A local proof (Android emulator + iOS Simulator) of a scaffolded app surfaced eight scaffold bugs that compile-only validation never caught — all fixed so a fresh `create-multiplatform` app builds and runs on both targets:

  - The web entry (`entry-web.tsx`, which `mount`s against the DOM) was compiled to native code, emitting `document.getElementById(...)` into Swift/Kotlin (can't compile). The native build now skips any `.tsx` importing a web-only runtime (`@pyreon/runtime-dom` / `@pyreon/runtime-server`).
  - Android: `build-android.sh` now passes `--kotlin-package` so the emit lands in the FQN `MainActivity` imports; the root Gradle file declares the `kotlin("plugin.serialization")` version; `MainActivity` extends `ComponentActivity` (Compose `setContent` receiver) instead of plain `Activity`.
  - iOS: `project.yml` SPM-package + source + Info paths are now relative to `ios/` (where the spec lives); the `@main` entry moved to `Main.swift` (the emitted component is `generated/App.swift` — two `App.swift` files collide); the entry conforms to `SwiftUI.App` (the emitted `struct App: View` shadows the bare `App` protocol).
  - The scaffold now wires the four `@pyreon/native-*` runtime packages as SPM (iOS) / Gradle `srcDir` (Android) dependencies so the emitted `import PyreonRuntime` / `com.pyreon.runtime.*` resolve.

- [#1581](https://github.com/pyreon/pyreon/pull/1581) [`90e70a8`](https://github.com/pyreon/pyreon/commit/90e70a8d7dc4f2706e6446aeb98864a29cebb6c0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - create-multiplatform: the scaffolded Android project now ships a production **release buildType** (R8 minify + shrink, the Play Store path) plus a `proguard-rules.pro` placeholder, instead of a debug-only project. A real `./gradlew assembleRelease` with minify enabled was verified to build clean against the Pyreon Kotlin runtime — its only reflection-sensitive dependency, kotlinx-serialization (useFetch / loader payloads), ships its own R8 keep rules that R8 applies automatically, so the framework needs no manual proguard rules. (iOS already builds under `-configuration Release` whole-module-optimization via the XcodeGen-generated Release config.) So a freshly scaffolded app produces production-optimized builds on both targets out of the box.

## 0.32.0

### Patch Changes

- [#1530](https://github.com/pyreon/pyreon/pull/1530) [`6ea99ae`](https://github.com/pyreon/pyreon/commit/6ea99ae5ec9724b457459a180798abb7183b941f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Image asset pipeline (multiplatform production Phase 1): the web `<Image>` primitive now resolves BARE src names (`logo.png` — no scheme, no slash) to `/assets/<name>` so the same shared source that bundles via Assets.xcassets (iOS) / res/drawable density buckets (Android) serves the materialized copy on web. The `create-multiplatform` scaffold's build scripts run the new `pyreon-native assets` step automatically when an `assets/` directory exists.

- [#1526](https://github.com/pyreon/pyreon/pull/1526) [`099f574`](https://github.com/pyreon/pyreon/commit/099f5746a8069326e9dccf5c46c405afa2220e46) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Android scaffold manifest ships `android.permission.INTERNET` by default — without it, the first `useFetch` call fails with the opaque `SocketException: socket failed: EPERM` (a real device-CI finding). Harmless for apps that never touch the network.

- [#1535](https://github.com/pyreon/pyreon/pull/1535) [`bd4526d`](https://github.com/pyreon/pyreon/commit/bd4526d7a8ac6b2474e97af980bb0ee4629396fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Android scaffold ships `material-icons-core` — `<Icon>` now references Material glyphs at compile time (`Icons.Filled.*` via the canonical `ICON_MAP`), replacing a phantom `pyreonIcon` runtime lookup that existed only as a typecheck stub and failed every real Gradle build that used an icon.

- [#1539](https://github.com/pyreon/pyreon/pull/1539) [`543307f`](https://github.com/pyreon/pyreon/commit/543307f22920807a3eeb8cdb3be7ed8e5debde20) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Android scaffold now wires Coil (`io.coil-kt:coil-compose`) and the native CLI emits the conditional imports for `<Scroll>` (`verticalScroll`/`rememberScrollState`), `<Modal>` (`Dialog`), and remote `<Image>` (`AsyncImage`) — these primitives were stub-masked (green in the kotlinc validate loop, red on a real `gradle assembleDebug`). Now the full primitive vocabulary compiles + renders on a real Android build.

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.1

### Patch Changes

- [#1256](https://github.com/pyreon/pyreon/pull/1256) [`08ba77f`](https://github.com/pyreon/pyreon/commit/08ba77fc6dfa65a05723a9e121bbfd002f97eb3e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `name` + target-directory validation to the scaffold CLI (D4 partial).

  `createMultiplatformProject({ name, target })` now validates that `name`
  is a non-empty, npm-compliant string (lowercase, hyphens allowed, no
  spaces / colons / scoped-package shorthand) and that `target` is a path
  that either doesn't exist OR is an empty directory. Throws a labeled
  `ValidationError` with actionable guidance instead of silently
  overwriting existing files. Closes the "scaffold clobbers existing
  projects" footgun from the 2026-06 native readiness audit.

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.3

## 0.26.2
