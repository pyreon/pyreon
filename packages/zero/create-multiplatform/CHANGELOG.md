# @pyreon/create-multiplatform

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
