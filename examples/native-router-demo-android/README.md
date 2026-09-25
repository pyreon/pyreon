# native-router-demo-android — Pyreon Router Demo on Jetpack Compose

> **PRIVATE / EXPERIMENTAL.** Android-target sibling of [`native-router-demo-ios`](../native-router-demo-ios/). Compiles the **SAME** `RouterApp.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multiplatform routing contract on the Android-real-toolchain side.

## Architecture

```text
examples/native-router-demo-ios/src/RouterApp.tsx     ← canonical source
                          │
                          ▼ PMTC compile
                          │
examples/native-router-demo-android/app/src/main/kotlin/com/pyreon/generated/RouterApp.kt
                          │
                          ▼ Compose composition
                          │
   MainActivity.setContent { RouterApp() }            ← 5-line host shell
```

## Router runtime via source-set inclusion

`@pyreon/native-router-kotlin` (`packages/native/router-kotlin/`) ships **source-only** — no Gradle module, no AAR. This Android example pulls its sources directly via an additional source-set:

```kotlin
android.sourceSets.getByName("main").kotlin.srcDir(
    "../../../packages/native/router-kotlin/src/main/kotlin"
)
```

Mirror of the iOS side's SPM package declaration:

```yaml
# native-router-demo-ios/project.yml
packages:
  PyreonRouter:
    path: ../../packages/native/router-swift
```

## What this proves

- **Multi-route navigation works on Compose** — 3 routes, `useNavigate()`, dynamic `:id` segment + `useParams()` populate
- **One source, two native targets** — `RouterApp.tsx` lives in `native-router-demo-ios/src/`; both `native-router-demo-ios` (iOS) and this dir (Android) compile from it
- **Espresso instrumented-test parity with iOS XCUITest** (#1452) — same shape, same assertions

## Build + test

```bash
cd examples/native-router-demo-android
bun install
./scripts/build.sh           # PMTC emit: RouterApp.tsx → RouterApp.kt
./gradlew assembleDebug      # builds the APK
./gradlew connectedCheck     # runs Espresso against a connected device/emulator
```

## Instrumented test

`RouterDemoInstrumentedTest.kt`:
- **Spec 1**: Home page renders post-launch (`testTag="home-page"`)
- **Spec 2**: Click "Go to About" → about page renders; click "Back to Home" → home renders (round-trip)
- **Spec 3**: Click "View user 42" → user page renders + `useParams()` populates `id="42"` (asserted via the rendered `Profile for user 42` text)

## Status

#1453 (the synthetic `data class UserPageParam` emit bug, synthesized from
`params: { id: string }` prop annotation) has merged, and CI wiring has since
landed too: `.github/workflows/native-device.yml`'s `android-build` job runs
this directory's `scripts/build.sh` → `gradle assembleDebug` →
`gradle connectedCheck` (Espresso on an emulator) whenever `ANDROID_APPS`
includes `router-demo`, mirroring the `native-counter-android` pattern (same
`reactivecircus/android-emulator-runner` action).

## Audit status

Closes the Android router-demo half of Gap 5 (project files + CI gate).
