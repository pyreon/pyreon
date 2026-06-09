# native-tasks-android — Tasks showcase on Android / Jetpack Compose

> **PRIVATE / EXPERIMENTAL.** Android host shell for the Gap 5 tasks showcase. Compiles the SHARED `TasksApp.tsx` source (from #1449) via PMTC; SAME source the web (#1456) and iOS (#1457) hosts use.

**Closes the FINAL Gap 5 host-shells follow-up** from the [2026-06-05 native-readiness audit](../../.claude/audits/native-readiness-2026-06-05.md). With this PR, ALL three native-tasks target hosts (web + iOS + Android) ship.

## Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source (from #1449)
                          │
                          ├─→ Web (#1456)        Vite + runtime-dom
                          ├─→ iOS (#1457)        XcodeGen + SwiftUI
                          └─→ Android (THIS dir) Gradle + Compose
```

## What this delivers

| File | Purpose |
|---|---|
| `package.json` | Workspace member |
| `.gitignore` | Gradle + generated/ outputs |
| `build.gradle.kts` | Root Gradle plugin declarations |
| `settings.gradle.kts` | Single `:app` module |
| `gradle.properties` | JVM heap + AndroidX |
| `app/build.gradle.kts` | Compose deps + source-set wiring for router-kotlin + `preBuild → pyreonCompile` |
| `app/src/main/AndroidManifest.xml` | Single-activity manifest |
| `app/src/main/kotlin/com/pyreon/MainActivity.kt` | `setContent { TasksApp() }` |
| `app/src/androidTest/kotlin/com/pyreon/TasksAppInstrumentedTest.kt` | Espresso auth-gate + navigation smoke (2 specs, 5-phase flow) |
| `scripts/build.sh` | PMTC compile driver |

Mirror of `native-router-demo-android` (#1455) — same Gradle structure + same source-set wiring for `@pyreon/native-router-kotlin`.

## Espresso test

`TasksAppInstrumentedTest.kt` — 2 specs:

1. **`appLaunchesOnLoginPage`** — root catch-all → LoginPage renders (testTag = "login-page")
2. **`authGateLoginAndNavigateThroughScreens`** — 5-phase flow:
   - Type username + tap Continue
   - Assert tasks page rendered (auth-gate passed)
   - Tap "New Task" → assert new-task page
   - Tap Cancel → back to tasks
   - Tap Logout → back to login (auth signal cleared, navigate committed)

Mirror of iOS `PyreonTasksUITests.swift` (#1457) — same shape, same flow, same assertions.

## Build + test

```bash
cd examples/native-tasks-android
bun install
./scripts/build.sh           # PMTC emit: TasksApp.tsx → TasksApp.kt
./gradlew assembleDebug      # builds the APK (needs Android SDK)
./gradlew connectedCheck     # runs the Espresso test on a connected device/emulator
```

## Dependencies

### On #1449 (canonical TasksApp source)

`scripts/build.sh` points at `../native-tasks/src/TasksApp.tsx` — that directory lands in #1449. This PR sequences AFTER #1449 merges.

### On #1453 (Kotlin synth-data-class emit)

The TasksApp source uses prop-typed object shapes (`tasks: { id: number; title: string; done: boolean }[]`) which emit `data class TasksListPageTask` references. Pre-#1453 the data class declaration was NOT emitted; #1453 closes that gap. **This PR depends on #1453 merging** for kotlinc to compile cleanly.

## CI wiring (follow-up)

This PR ships project files only. CI integration extending `.github/workflows/native-device.yml` lands in a follow-up after #1449 + #1453 both merge — same 3-step pattern as the counter-android wiring in #1454.

## What's NOT in this PR

- **CI integration** — sequenced post-#1449 + post-#1453
- **Validation against real Gradle + Android Emulator** — deferred to first real-Linux CI run

## Audit status

Closes the FINAL Gap 5 host-shells follow-up. After this PR + #1449 + #1453 + #1454 + #1455 + #1456 + #1457 all merge, the full Gap 5 surface is closed: 3 native-tasks target hosts (web + iOS + Android), all 3 Kotlin scaffold limitations fixed, Android Espresso parity for counter + router-demo, iOS XCUITest beyond TodoMVC.
