# native-tasks-ios — Tasks showcase on iOS / SwiftUI

> **PRIVATE / EXPERIMENTAL.** iOS host shell for the Gap 5 tasks showcase. Compiles the SHARED `TasksApp.tsx` source (from #1449's `examples/native-tasks/src/`) to SwiftUI via PMTC; SAME source the web (#1456) and Android (follow-up) hosts use.

Closes the iOS half of Gap 5's host-shells follow-up from the [2026-06-05 native-readiness audit](../../.claude/audits/native-readiness-2026-06-05.md). Android Gradle host remains the last follow-up.

## Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source (from #1449)
                          │
                          ├─→ Web (#1456)            Vite + runtime-dom
                          ├─→ iOS (THIS dir)         XcodeGen + SwiftUI
                          └─→ Android (follow-up)    Gradle + Compose
```

## What this delivers

| File | Purpose |
|---|---|
| `project.yml` | XcodeGen spec — PyreonTasks app target + PyreonTasksUITests target + scheme; SPM PyreonRouter dep |
| `ios/App.swift` | `@main App` entrypoint → WindowGroup { ContentView() } |
| `ios/ContentView.swift` | 1-line shell: `body: some View { TasksApp() }` |
| `ios/Info.plist` | Standard SwiftUI iOS 17+ Info.plist |
| `scripts/build.sh` | PMTC compile loop — emits `generated/TasksApp.swift` |
| `iosUITests/PyreonTasksUITests.swift` | XCUITest auth-gate + navigation smoke (2 specs) |

Mirror of `native-router-demo-ios` — same project structure, same SPM PyreonRouter dependency, same scheme wiring.

## XCUITest coverage

`PyreonTasksUITests.swift` exercises the Gap 2 (#1440) per-route auth-gate end-to-end:

1. **`test_appLaunchesOnLoginPage`** — root `/` catches to LoginPage; verify it renders within 30s.
2. **`test_authGateLoginAndNavigateThroughScreens`** — type username → tap Continue → assert tasks page renders (auth-gate passed) → tap New Task → assert new-task page → tap Cancel → back to tasks → tap Logout → assert login page renders (auth signal cleared + navigate committed).

The 5-phase test proves the SAME `beforeEnter` source compiles to working auth-gate behaviour on iOS that the web router runs.

## Build + test

```bash
cd examples/native-tasks-ios
bun install
xcodegen generate            # → PyreonTasks.xcodeproj
open PyreonTasks.xcodeproj   # Xcode for interactive dev
# OR command-line:
bash scripts/build.sh        # PMTC → generated/TasksApp.swift
xcodebuild build -project PyreonTasks.xcodeproj -scheme PyreonTasks -sdk iphonesimulator
xcodebuild test  -project PyreonTasks.xcodeproj -scheme PyreonTasks -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest'
```

## Dependency on #1449

`scripts/build.sh` points at `../native-tasks/src/TasksApp.tsx` — that directory lands in [#1449](https://github.com/pyreon/pyreon/pull/1449). **This PR sequences AFTER #1449 merges.** Before #1449 lands, `scripts/build.sh` fails with `[build.sh] cd: ../native-tasks/src: No such file or directory`.

When #1449 merges, this PR rebases cleanly (no source conflicts — different directories) and the source path resolves.

## CI wiring (follow-up)

This PR ships project files only. CI integration (extending `.github/workflows/native-device.yml` with 4 new steps for emit + xcodegen + build + test, same pattern as the counter-android wiring in #1454 + the iOS counter/router-demo wiring in #1452) lands in a follow-up after #1449 merges.

## What's NOT in this PR

- **CI integration** — sequenced post-#1449
- **Android Gradle host shell for `native-tasks-android`** — final Gap 5 host follow-up
- **Validation that the build actually runs on Xcode** — deferred to first real-Mac CI run

## Audit status

Closes the iOS half of Gap 5's host-shells follow-up. Android host shell is the last remaining Gap 5 sub-item.
