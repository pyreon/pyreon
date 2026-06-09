# native-router-demo-android — Pyreon Router Demo on Jetpack Compose

> **PRIVATE / EXPERIMENTAL.** Android-target sibling of [`native-router-demo-ios`](../native-router-demo-ios/). Compiles the **SAME** `RouterApp.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multiplatform routing contract on the Android-real-toolchain side.

Closes the Android router-demo half of Gap 5 (Espresso parity beyond TodoMVC + Counter) from the [2026-06-05 native-readiness audit](../../.claude/audits/native-readiness-2026-06-05.md). Counter Android half landed in #1454; iOS UITest (both counter + router-demo) landed in #1452.

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

## Limitations (this PR ships project files only)

The PMTC emit for the router demo references `data class UserPageParam` (synthesized from `params: { id: string }` prop annotation) — pre-#1453 the data class declaration was NOT emitted, so kotlinc fails `unresolved reference 'UserPageParam'`.

**This PR DOES NOT add the CI wiring yet.** The Espresso test target lives in source but is not exercised by `.github/workflows/native-device.yml`. CI integration lands in a FOLLOW-UP PR after **#1453 merges** (which closes the synthetic-data-class emit bug).

The scaffold ships now because:
- The project structure mirrors `native-counter-android` exactly — proven template
- The Espresso test code is structurally identical to the iOS XCUITest variant from #1452
- The source-set wiring for router-kotlin is a documented pattern
- All these pieces compose into a build-ready project as soon as #1453 unblocks the kotlinc step

## CI wiring (follow-up PR after #1453)

When #1453 merges, the follow-up PR adds 3 steps to `.github/workflows/native-device.yml`'s `android-build` job mirroring the counter-android pattern:

1. Emit Kotlin via `scripts/build.sh`
2. `gradle assembleDebug`
3. Boot emulator + `gradle connectedCheck` (same `reactivecircus/android-emulator-runner@v2.37.0` SHA-pin)

## Audit status

Closes the Android router-demo half of Gap 5 (project files). The CI gate activation is sequenced behind #1453.
