# native-counter-android — Pyreon Counter on Jetpack Compose

> **PRIVATE / EXPERIMENTAL.** Android-target sibling of [`native-counter-ios`](../native-counter-ios/). Compiles the **SAME** `Counter.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multi-target contract for the canonical Counter sample at the Android-real-toolchain level.

Closes the Android half of Gap 5 (Espresso parity beyond TodoMVC) from the [2026-06-05 native-readiness audit](../../.claude/audits/native-readiness-2026-06-05.md). The iOS half landed in #1452.

## Architecture

```text
examples/native-counter-ios/src/Counter.tsx     ← canonical source (single file)
                          │
                          ▼ PMTC compile
                          │
examples/native-counter-android/app/src/main/kotlin/com/pyreon/generated/Counter.kt
                          │
                          ▼ Compose composition
                          │
   MainActivity.setContent { Counter() }        ← 5-line host shell
```

Mirror of [`native-todomvc-android`](../native-todomvc-android/) — same Gradle structure, same plugin versions, same dependency set MINUS:
- `kotlinx-serialization-json` (Counter has no `@Serializable` types)
- `compose.runtime:runtime-saveable` (no `rememberSaveable` — Counter state doesn't survive config changes by design)

## What this proves

- **One source, three targets** at counter-sample scope. The same `Counter.tsx` lives in `native-counter-ios/src/`; both `native-counter-ios` (iOS) and this directory (Android) compile from it. Web sibling `native-counter-web/` would do the same (deferred — not in this scaffold's scope).
- **Signal → @State → mutableStateOf round-trip** via the canonical PMTC Phase 0 success criterion #2. `signal<number>(0)` emits as `var count by remember { mutableStateOf(0) }` on Compose, `count.set(count() + 1)` rewrites as `count = count + 1`.
- **Espresso instrumented-test parity with iOS XCUITest** (#1452). Same shape, same assertion (initial render + signal-write → re-render).

## Build + test

```bash
cd examples/native-counter-android
bun install                              # workspace setup (one-time)
./scripts/build.sh                       # PMTC emit: Counter.tsx → Counter.kt
./gradlew assembleDebug                  # builds the APK (needs Android SDK)
./gradlew connectedCheck                 # runs the Espresso test against a connected device/emulator
```

The `app/build.gradle.kts` wires `preBuild.dependsOn("pyreonCompile")` so source edits to `../native-counter-ios/src/Counter.tsx` are picked up on every `gradlew build` — mirror of iOS's xcodegen `preBuildScript`.

## Instrumented test

`app/src/androidTest/kotlin/com/pyreon/CounterInstrumentedTest.kt`:
- Boots MainActivity via `createAndroidComposeRule<MainActivity>()`
- Asserts `Count: 0` text is displayed
- Performs click on `Increment` button
- Asserts `Count: 1` text is displayed

Counter source doesn't carry `data-testid` (predates the canonical-primitives migration), so the test queries by displayed text via `onNodeWithText("Count: N")`. Stable for the deterministic-initial-state smoke.

## CI wiring

`.github/workflows/native-device.yml`'s `android-build` job runs `gradle assembleDebug` + `gradle connectedCheck` against the labelled-PR / nightly schedule. Same advisory-only opt-in shape as the iOS `xcodebuild test` runs and the TodoMVC Android sibling.

## Limitations

- **No real-device validation in this PR**: this scaffold's Gradle build was not run against a real Android SDK in this session (no Android Studio / Gradle / Android SDK runner available). Real-device validation lands when the `native-device` workflow runs against this directory.
- **Counter source uses the OLD vocabulary** (`<VStack>` / `<Text>` / `<Button>` / `onClick`). The canonical-primitives migration (PMTC P3) would replace these with `<Stack>` / `<Button onPress>`. Deferred — separate migration PR.

## Audit status

Closes the Android Counter half of Gap 5 (Espresso parity beyond TodoMVC). The Android `native-router-demo-android` directory + a `native-counter-web` web sibling remain follow-up PRs.
