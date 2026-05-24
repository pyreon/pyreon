# native-todomvc-android — PMTC TodoMVC Android reference

> **PRIVATE / EXPERIMENTAL.** The Android-target sibling of [`native-todomvc-ios`](../native-todomvc-ios/). Compiles the **SAME** `TodoApp.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multi-target contract at real-app shape.
>
> **Status:** structural scaffold landed. The compiler emits Kotlin (✓), but the emit currently has known typecheck errors against real Compose (~22 emit bugs + ~30 missing-stub gaps). Mirror of iOS pre-Phase-2 state. Gap-closure roadmap below.

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

## Current state (honest)

The compiler-emit pipeline works end-to-end — `./scripts/build.sh` produces `app/src/main/kotlin/com/pyreon/generated/TodoApp.kt` from the shared source. The emit content has known gaps when measured against real Jetpack Compose; running `kotlinc` against the emit (with the minimal Compose stubs in `@pyreon/native-compiler`) produces **52 errors** today. Two distinct categories:

**A — Real Kotlin emit bugs** (~22 errors, tracked as follow-up PRs):

| # | Bug shape | iOS equivalent | Status |
|---|-----------|---------------|--------|
| K1 | `if (filter == "active")` — Filter enum compared to String literal | iOS fixed via `_signalEnumTypes` (#861) | open |
| K2 | `return xs` inside `derivedStateOf { … }` — non-local return is prohibited in Kotlin lambdas | iOS uses single-expression block, no analog needed | open |
| K3 | `VStack { … }` / `HStack { … }` — literal JSX names emitted; Compose calls them `Column` / `Row` | iOS SwiftUI accepts `VStack` / `HStack` natively | open |
| K4 | `Todo(id = nextId + 1, …)` — uses `nextId + 1` (pure expression) instead of post-increment `nextId++` (assign + return) | iOS uses same shape (also bug, masked by Swift's stricter mutation rules) | shared with iOS |

**B — Missing Compose stubs in validation harness** (~30 errors, infrastructure not bugs):

The `kotlin-stubs.ts` file ships minimal stubs for `Composable`, `Text`, `Button`, `LazyColumn`, `Column`, `mutableStateOf`, `derivedStateOf`, `remember`, `items` — enough for the 7 starter fixtures. TodoMVC needs additional stubs: `rememberSaveable`, `Saver`, `TextField` (Compose Material variant with `placeholder`), `KeyboardOptions`, `KeyboardActions`, `ImeAction`, `Checkbox`, `@Serializable` (kotlinx-serialization), `Json.encodeToString` / `decodeFromString`. Tracked as a single stub-extension PR — adds the stubs + wires `validate-kotlin.test.ts` to also validate the TodoMVC emit (paralleling iOS's `validate-swift.test.ts`).

## Gap-closure roadmap (mirror of iOS Phase 2)

The iOS side hit the same gap pattern and closed via 5 named-gap PRs (G1-G5) + 7 Phase-2 hardening PRs. Android follows the same arc but starts later, so each fix is its own follow-up:

| PR | Closes | Estimated size |
|----|--------|----------------|
| K1 | enum-vs-string equality (the cleanest bug) | ~80 LOC `_signalEnumTypes` port to emit-kotlin.ts |
| K2 | `derivedStateOf` non-local-return (single-expression body OR explicit lambda label) | ~30 LOC |
| K3 | `VStack`/`HStack` → `Column`/`Row` mapping at JSX emit | ~20 LOC |
| K4 | Stub extension + TodoMVC validation gate | ~150 LOC (mostly stub mocks) |

After all 4 land, Android emit reaches typecheck-clean parity with iOS — closing the Phase 2 PMTC arc on **both** platforms.

## Verifiable locally vs requires Android SDK

Same pattern as iOS (where Xcode build requires Xcode + Simulator + signing). What this example proves WITHOUT Android SDK:

- ✓ `./scripts/build.sh` produces structurally valid Kotlin (parses, syntax-correct)
- ✓ Emit shape matches the locked snapshot in `todomvc-baseline.test.ts` (`Kotlin emit — current partial output`)
- ✓ The `--kotlin-package=com.pyreon.generated` flag emits the right package declaration so MainActivity's FQN import resolves
- ✓ `MainActivity.kt` parses (standalone Kotlin, doesn't need Compose runtime to syntax-check)
- ✓ Gradle config files match Google's canonical Compose single-module app shape

What requires Android SDK + emulator/device:

- ⨯ `gradle build` produces the APK (requires `compileSdk=35` install + AndroidX deps download)
- ⨯ App runs (emulator or physical device)
- ⨯ Real Jetpack Compose typecheck (vs minimal stubs) — needs `gradle compileDebugKotlin`

The honest framing: the **structural** multiplatform contract is proven (one source, two emit targets, scaffold for both). The **runtime** multiplatform contract awaits the K1-K4 follow-ups + real-device CI (Apple-hardware-class blocker on the iOS side too).

## Why a separate example dir (vs sharing iOS's)

Three reasons matching the iOS rationale:

1. **Per-platform host code differs.** iOS has `App.swift` + `ContentView.swift` + `Info.plist` + `project.yml`. Android has `MainActivity.kt` + `AndroidManifest.xml` + Gradle files. Co-locating in one dir would tangle the build configs.
2. **The Phase 1 deliverable is a working TodoMVC on each platform.** Per `native-platforms-phase1-roadmap.md`, that's the end-of-Phase-1 milestone. Having both examples in `examples/` (one per platform) lets each be opened in its native IDE — Xcode for iOS, Android Studio for Android — without conflicting project files.
3. **The shared source is the proof.** `examples/native-todomvc-android/scripts/build.sh` reading from `../native-todomvc-ios/src/` is the structural assertion: the multiplatform claim survives ONE source. Two dirs sharing one source > one dir with two emit targets.

## Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.
