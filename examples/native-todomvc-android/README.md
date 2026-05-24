# native-todomvc-android — PMTC TodoMVC Android reference

> **PRIVATE / EXPERIMENTAL.** The Android-target sibling of [`native-todomvc-ios`](../native-todomvc-ios/). Compiles the **SAME** `TodoApp.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multi-target contract at real-app shape.
>
> **Status:** PMTC Phase 2 Kotlin arc CLOSED. The emit is now **typecheck-clean** against `kotlinc + K4 stubs` (0 errors via `validate-kotlin.test.ts`). K1+K2+K3+K4 all merged, K-FINAL gate locks the contract in CI. Parity with iOS Phase 2 closure reached. Layered limitations (real Compose runtime, Android SDK) noted below.

## The multiplatform contract

Both example apps consume **the same source file**:

```
examples/native-todomvc-ios/src/TodoApp.tsx     ← canonical source
            │
            ├──→ examples/native-todomvc-ios/   ./scripts/build.sh  →  generated/TodoApp.swift
            │                                                          (iOS / SwiftUI — typecheck-clean ✓)
            │
            └──→ examples/native-todomvc-android/ ./scripts/build.sh →  app/.../generated/TodoApp.kt
                                                                       (Android / Compose — emit exists, gaps below)
```

If the source ever needed to fork per-platform, PMTC's design would have failed. The Android example deliberately reads from `../native-todomvc-ios/src/` rather than carrying its own copy — drift would invalidate the proof.

## Open in Android Studio

Requires Android SDK + Gradle 8.x + JDK 17. The local devloop:

```bash
./scripts/build.sh       # compiles ../native-todomvc-ios/src/*.tsx → app/.../generated/
gradle build             # runs preBuildScript that re-runs ./scripts/build.sh, then Compose build
# or: open the project root in Android Studio (Iguana 2023.2+) and hit ▶
```

The app module's `app/build.gradle.kts` wires `preBuild.dependsOn("pyreonCompile")` so source edits to `../native-todomvc-ios/src/TodoApp.tsx` are picked up on every Gradle build — mirroring iOS's xcodegen preBuildScript.

## Current state (Phase 2 Kotlin arc CLOSED)

The compiler-emit pipeline works end-to-end — `./scripts/build.sh` produces `app/src/main/kotlin/com/pyreon/generated/TodoApp.kt` from the shared source. **The emit typechecks-clean against `kotlinc + K4 stubs` (0 errors).** The `validate-kotlin.test.ts` "K-FINAL — real TodoMVC emit typechecks via kotlinc + K4 stubs" gate locks the contract in CI.

### The Phase 2 Kotlin arc — all CLOSED

| PR | Closes | Status |
|----|--------|--------|
| [K1 #879](https://github.com/pyreon/pyreon/pull/879) | enum-vs-string equality (`filter == "active"` → `filter == Filter.active`) | ✅ merged |
| [K3 #880](https://github.com/pyreon/pyreon/pull/880) | `VStack`/`HStack` → `Column`/`Row` mapping at JSX emit | ✅ merged |
| [K2 #881](https://github.com/pyreon/pyreon/pull/881) | `derivedStateOf` non-local return (`return@derivedStateOf`) | ✅ merged |
| [K4 #882](https://github.com/pyreon/pyreon/pull/882) | Extended Compose stubs (rememberSaveable / Saver / Material widgets / kotlinx-serialization) | ✅ merged |
| K-FINAL (this PR) | End-to-end TodoMVC `transform()` → kotlinc validation gate | this PR |

### Remaining gap (shared with iOS, runtime-only)

The `nextId + 1` shared-with-iOS bug remains: the emit uses `nextId + 1` (pure expression) instead of post-increment `nextId++` (assign + return), so every new Todo gets `id=2` forever. Documented runtime bug — does NOT affect typecheck on either platform. Tracked as a future shared follow-up.

## Verifiable locally vs requires Android SDK

Same pattern as iOS (where Xcode build requires Xcode + Simulator + signing). What this example proves WITHOUT Android SDK:

- ✓ `./scripts/build.sh` produces structurally valid Kotlin (parses, syntax-correct)
- ✓ `kotlinc + K4 stubs` accepts the full TodoMVC emit (0 errors via K-FINAL gate)
- ✓ Emit shape matches the locked snapshot in `todomvc-baseline.test.ts`
- ✓ The `--kotlin-package=com.pyreon.generated` flag emits the right package declaration so MainActivity's FQN import resolves
- ✓ `MainActivity.kt` parses (standalone Kotlin, doesn't need Compose runtime to syntax-check)
- ✓ Gradle config files match Google's canonical Compose single-module app shape

What requires Android SDK + emulator/device:

- ⨯ `gradle build` produces the APK (requires `compileSdk=35` install + AndroidX deps download)
- ⨯ App runs (emulator or physical device)
- ⨯ Real Jetpack Compose typecheck against the actual `androidx.compose.*` libraries (the K4 stubs cover the same API surface but aren't byte-equivalent to the real ones — `gradle compileDebugKotlin` is the only end-to-end verifier)

The honest framing: the **structural** multiplatform contract is proven AND CI-gated (one source, two emit targets, both typecheck-clean against their respective compiler-stub harnesses). The **runtime** multiplatform contract awaits real-device CI (Apple-hardware-class blocker on the iOS side too).

## Why a separate example dir (vs sharing iOS's)

Three reasons matching the iOS rationale:

1. **Per-platform host code differs.** iOS has `App.swift` + `ContentView.swift` + `Info.plist` + `project.yml`. Android has `MainActivity.kt` + `AndroidManifest.xml` + Gradle files. Co-locating in one dir would tangle the build configs.
2. **The Phase 1 deliverable is a working TodoMVC on each platform.** Per `native-platforms-phase1-roadmap.md`, that's the end-of-Phase-1 milestone. Having both examples in `examples/` (one per platform) lets each be opened in its native IDE — Xcode for iOS, Android Studio for Android — without conflicting project files.
3. **The shared source is the proof.** `examples/native-todomvc-android/scripts/build.sh` reading from `../native-todomvc-ios/src/` is the structural assertion: the multiplatform claim survives ONE source. Two dirs sharing one source > one dir with two emit targets.

## Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.
