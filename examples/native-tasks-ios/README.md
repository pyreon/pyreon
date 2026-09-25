# native-tasks-ios — Tasks showcase on iOS / SwiftUI

> **PRIVATE / EXPERIMENTAL.** iOS host shell for the Gap 5 tasks showcase. Compiles the SHARED `TasksApp.tsx` source (`examples/native-tasks/src/`) to SwiftUI via PMTC; SAME source the web and Android hosts use.

## Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source
                          │
                          ├─→ Web (native-tasks-web)          Vite + runtime-dom
                          ├─→ iOS (THIS dir)                  XcodeGen + SwiftUI
                          └─→ Android (native-tasks-android)  Gradle + Compose
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

**The UI test needs a fixture server on port 8787.** The suite fetches
`quotes.json` over loopback, so without it `test_authGateStoreMutationAndTypedParamsDetail`
fails on the quote assertion long before reaching the screens it is actually
exercising — the failure message names the cause, but the command above does not
start the server. CI starts it as a workflow step; locally:

```bash
python3 -m http.server 8787 --bind 127.0.0.1 \
  --directory ../native-tasks/fixtures &
```

## Status

`scripts/build.sh` points at `../native-tasks/src/TasksApp.tsx` (#1449) —
that directory has landed, so the source path resolves. CI wiring has landed
too: `.github/workflows/native-device.yml` runs this directory's emit +
xcodegen + `xcodebuild build` + `xcodebuild test` steps. The Android sibling,
[`native-tasks-android`](../native-tasks-android), has also landed — Gap 5's
full host-shells surface (web + iOS + Android) is closed.

## Audit status

Closes the iOS half of Gap 5's host-shells follow-up.
