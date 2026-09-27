# native-tasks-android — Tasks showcase on Android / Jetpack Compose

> **PRIVATE / EXPERIMENTAL.** Android host shell for the Gap 5 tasks showcase. Compiles the SHARED `TasksApp.tsx` source via PMTC; SAME source the web and iOS hosts use.

## Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source
                          │
                          ├─→ Web (native-tasks-web)  Vite + runtime-dom
                          ├─→ iOS (native-tasks-ios)  XcodeGen + SwiftUI
                          └─→ Android (THIS dir)      Gradle + Compose
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

## Status

`scripts/build.sh` points at `../native-tasks/src/TasksApp.tsx`, which has
landed, and the Kotlin synth-data-class emit gap (`data class
TasksListPageTask` for `tasks: { id, title, done }[]` prop shapes) has
closed — kotlinc compiles the emit cleanly. CI wiring has landed too:
`.github/workflows/native-device.yml`'s `android-build` job runs this
directory's emit + `gradle assembleDebug` + `gradle connectedCheck`
(Espresso on an emulator), same 3-step pattern as `native-counter-android`.

## Audit status

Closes the FINAL Gap 5 host-shells follow-up: 3 native-tasks target hosts
(web + iOS + Android), all Kotlin scaffold limitations fixed, Android
Espresso parity for counter + router-demo + tasks, iOS XCUITest beyond
TodoMVC.
