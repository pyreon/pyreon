# native-router-demo: Router demo

> **Experimental.** The native targets (PMTC → SwiftUI and Jetpack Compose) are demo-quality. See `docs/src/content/docs/multiplatform.md`.

One source, [`src/RouterApp.tsx`](src/RouterApp.tsx): router, tabs, a websocket and audio. This directory holds the source and every host, the layout `bun create multiplatform` scaffolds:

| Path | What it is |
| --- | --- |
| `src/` | the shared app source |
| `index.html`, `vite.config.ts`, `src/entry-client.tsx` | the web host (`bun run dev` / `bun run build`); e2e: `bun run test:e2e:native-router-demo (web host)` |
| `ios/` | the iOS host: `project.yml` (xcodegen), `Sources/`, `UITests/`; PMTC writes `ios/generated/` (gitignored) |
| `android/` | the Android host: the Gradle project; PMTC writes `android/app/src/main/kotlin/com/pyreon/generated/` |
| `scripts/build-ios.sh`, `scripts/build-android.sh` | compile the source for each host; the Xcode pre-build script and the Gradle `preBuild` task run them |

Both native hosts are built and device-tested in CI (`native-device.yml`, lane key `router-demo`).

```bash
cd examples/native-router-demo
bun run check            # PMTC for both targets, in memory
bun run build:ios        # src → ios/generated/*.swift
bun run build:android    # src → android/app/src/main/kotlin/com/pyreon/generated/*.kt
```

## iOS host (`ios/`)

> **PRIVATE / EXPERIMENTAL.** Canonical source for the Pyreon multiplatform **router** story. Sibling of [`../native-router-demo (web host)/`](../native-router-demo (web host)/) which imports from this path directly.

### What this proves

ONE `.tsx` source compiles to a **navigation-functional** app on all three targets via PMTC's Phase R1 stack:

- **R1.1** — Swift `<RouterView />` inside a routes-bearing `<RouterProvider>` emits the home component as NavigationStack body (closes the iOS blank-startup bug)
- **R1.2** — Kotlin route emit uses `when`-dispatch on `router.currentPath` (closes the NavHost state-disconnect + no-match-throw bugs)
- **C5.1-C5.4** — routes parsed from `createRouter({routes: [...]})`, emitted to platform-native navigation, with else-fallback for unmatched paths
- **PR #973** — `createRouter` / `useNavigate` / `useParams` recognised at decl level

### Source

[`src/RouterApp.tsx`](src/RouterApp.tsx) — 3 routes (`/`, `/about`, `/users/:id`), 3 page components, `<Link>` + `useNavigate()` based navigation. The web sibling's `entry-client.tsx` imports `RouterApp` from this path. The Android example (when scaffolded) reads from the same path via build script.

### Run

#### Web (real-Chromium e2e via Playwright)

```bash
cd ../native-router-demo (web host)
bun run dev
## → http://localhost:5203
```

#### iOS (Xcode + Simulator)

The full host shell is now wired (post-#1099-era follow-up). One-command setup:

```bash
brew install xcodegen   # one-time
cd examples/native-router-demo/ios
./scripts/xcode-setup.sh   # compile RouterApp.tsx → generated/*.swift + regenerate xcodeproj
open ios/PyreonRouterDemo.xcodeproj
## ⌘+R to run in the iOS Simulator
```

Inside Xcode, the project's `preBuildScript` re-runs `build.sh` on every build — so edits to `src/RouterApp.tsx` are picked up automatically.

The host wraps `RouterApp()` (from `generated/RouterApp.swift`, produced by `pyreon-native build --target=ios`) inside a minimal SwiftUI `@main` app. Depends on `@pyreon/native-router-swift` (the runtime `PyreonRouter` + `RouterProvider` + `NavigationLink` helpers) — wired as a local SPM package in `project.yml`.

#### Android

Not yet scaffolded. The shared `src/RouterApp.tsx` source compiles to typecheck-clean Kotlin/Compose today (verified by `@pyreon/native-compiler`'s `validate-kotlin` gate); only the host shell + Gradle wiring is missing. Same pattern as `examples/native-todomvc-android/` would apply.

## Android host (`android/`)

> **PRIVATE / EXPERIMENTAL.** Android-target sibling of [`native-router-demo/ios`](../native-router-demo/ios/). Compiles the **SAME** `RouterApp.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multiplatform routing contract on the Android-real-toolchain side.

### Architecture

```text
examples/native-router-demo/src/RouterApp.tsx     ← canonical source
                          │
                          ▼ PMTC compile
                          │
examples/native-router-demo/android/app/src/main/kotlin/com/pyreon/generated/RouterApp.kt
                          │
                          ▼ Compose composition
                          │
   MainActivity.setContent { RouterApp() }            ← 5-line host shell
```

### Router runtime via source-set inclusion

`@pyreon/native-router-kotlin` (`packages/native/router-kotlin/`) ships **source-only** — no Gradle module, no AAR. This Android example pulls its sources directly via an additional source-set:

```kotlin
android.sourceSets.getByName("main").kotlin.srcDir(
    "../../../packages/native/router-kotlin/src/main/kotlin"
)
```

Mirror of the iOS side's SPM package declaration:

```yaml
## native-router-demo/ios/project.yml
packages:
  PyreonRouter:
    path: ../../packages/native/router-swift
```

### What this proves

- **Multi-route navigation works on Compose** — 3 routes, `useNavigate()`, dynamic `:id` segment + `useParams()` populate
- **One source, two native targets** — `RouterApp.tsx` lives in `native-router-demo/src/`; both `native-router-demo/ios` (iOS) and this dir (Android) compile from it
- **Espresso instrumented-test parity with iOS XCUITest** (#1452) — same shape, same assertions

### Build + test

```bash
cd examples/native-router-demo/android
bun install
./scripts/build.sh           # PMTC emit: RouterApp.tsx → RouterApp.kt
./gradlew assembleDebug      # builds the APK
./gradlew connectedCheck     # runs Espresso against a connected device/emulator
```

### Instrumented test

`RouterDemoInstrumentedTest.kt`:
- **Spec 1**: Home page renders post-launch (`testTag="home-page"`)
- **Spec 2**: Click "Go to About" → about page renders; click "Back to Home" → home renders (round-trip)
- **Spec 3**: Click "View user 42" → user page renders + `useParams()` populates `id="42"` (asserted via the rendered `Profile for user 42` text)

### Status

#1453 (the synthetic `data class UserPageParam` emit bug, synthesized from
`params: { id: string }` prop annotation) has merged, and CI wiring has since
landed too: `.github/workflows/native-device.yml`'s `android-build` job runs
this directory's `scripts/build-ios.sh` → `gradle assembleDebug` →
`gradle connectedCheck` (Espresso on an emulator) whenever `ANDROID_APPS`
includes `router-demo`, mirroring the `native-counter/android` pattern (same
`reactivecircus/android-emulator-runner` action).

### Audit status

Closes the Android router-demo half of Gap 5 (project files + CI gate).

## Web host (root)

> **PRIVATE / EXPERIMENTAL.** Web sibling of [`../native-router-demo/ios/`](../native-router-demo/ios/). Imports `RouterApp` from the iOS path directly — **ONE source, THREE targets.**

### What this proves

Phase R1's multiplatform routing story end-to-end on web via:

- `@pyreon/router` for runtime routing (createRouter, RouterProvider, RouterView, useNavigate)
- `@pyreon/primitives` for canonical UI vocabulary (Stack, Inline, Text, Button)
- `@pyreon/runtime-dom` for the DOM render
- `@pyreon/vite-plugin`'s JSX-auto-import for `<Stack>` / `<Inline>` / etc. bare references

The same RouterApp.tsx compiles to SwiftUI via PMTC + Compose via PMTC. The native targets see exactly this file via the canonical-primitive table; web sees it via Vite + the auto-import plugin.

### Run

```bash
cd examples/native-router-demo (web host)
bun run dev       # vite on http://localhost:5173 (no explicit port override; plain vite default)
bun run build     # production bundle → dist/
bun run preview   # serve dist/ via vite preview
```

### Source structure

| File | Purpose |
|---|---|
| `index.html` | Bootstrap shell — mounts `#app` + loads `entry-client.tsx`. |
| `src/entry-client.tsx` | `@pyreon/runtime-dom` mount call; imports `RouterApp` from the iOS sibling. |

The actual `RouterApp.tsx` source lives at [`examples/native-router-demo/src/RouterApp.tsx`](examples/native-router-demo/src/RouterApp.tsx).

### Test plan

- **verify-modes** cell `native-router-demo (web host) × spa` (R1.5) — proves the production build emits expected content
- **Playwright e2e** (R1.4) — proves the runtime contract: initial render → click `<Link>` → URL updates → component renders → back-button works on all 3 targets
