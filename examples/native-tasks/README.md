# native-tasks — Pyreon multiplatform real-app showcase

One source, [`src/TasksApp.tsx`](src/TasksApp.tsx): the multi-feature showcase: auth-gated routing, a cross-screen store, forms, charts, flow, the WebView host. This directory holds the source and every host, the layout `bun create multiplatform` scaffolds:

| Path | What it is |
| --- | --- |
| `src/` | the shared app source |
| `index.html`, `vite.config.ts`, `src/entry-client.tsx` | the web host (`bun run dev` / `bun run build`); e2e: `bun run test:e2e:native-tasks-web` |
| `ios/` | the iOS host: `project.yml` (xcodegen), `Sources/`, `UITests/`; PMTC writes `ios/generated/` (gitignored) |
| `android/` | the Android host: the Gradle project; PMTC writes `android/app/src/main/kotlin/com/pyreon/generated/` |
| `scripts/build-ios.sh`, `scripts/build-android.sh` | compile the source for each host; the Xcode pre-build script and the Gradle `preBuild` task run them |

Both native hosts are built and device-tested in CI (`native-device.yml`, lane key `tasks`).

```bash
cd examples/native-tasks
bun run check            # PMTC for both targets, in memory
bun run build:ios        # src → ios/generated/*.swift
bun run build:android    # src → android/app/src/main/kotlin/com/pyreon/generated/*.kt
```

> **PRIVATE / EXPERIMENTAL.** Gap 5 scaffold from the 2026-06-05 native-readiness audit. Multi-feature real-app showcase exercising MULTIPLE Tier-1 features end-to-end — beyond the sample-code scope of `native-counter-ios` / `native-router-demo-ios` / `native-todomvc/ios`.

## What this proves

A SINGLE `.tsx` source compiling cleanly to BOTH Swift (SwiftUI) AND Kotlin (Jetpack Compose) via PMTC, exercising:

- **Routing with auth-gate** (Gap 2 via #1440) — `createRouter` with per-route `beforeEnter: () => isAuthenticated() || '/login'`. Web router gates and the native runtimes gate identically post #1440.
- **Reactive state machine** (Gap 4 PR-2 via #1445) — `createMachine` for `idle → loading → loaded | error` app state. Emits `PyreonMachine` on both natives via the Strategy-B port.
- **i18n translations** (Gap 4 PR-3 via #1447) — `createI18n` provides per-screen strings. Emits `PyreonI18n` on both natives via the v1 Strategy-B port.
- **Canonical primitives** — `<Stack>` / `<Inline>` / `<Field>` / `<Button>` / `<Text>` / `<For>` / `<Show>` resolve per-target via `canonical-primitives.ts`.
- **Signal + computed reactivity** — `signal(0)` + `computed(() => …)` for filtered views.

## Sibling hosts (landed)

The original ~3-week arc (PR-5.1 web app + PR-5.2 native ports + PR-5.3 CI
wiring) has landed in full: the web host (this directory's root),
[`ios/`](ios/) and [`android/`](android/) each host this directory's
`src/TasksApp.tsx`, and `.github/workflows/native-device.yml` runs the iOS
XCUITest + Android Espresso suites in CI. See each sibling's own README for
its current state.

## What's still not in this scaffold

- **Real auth backend**: `login()` flips a signal — no fetch, no token storage. Real auth needs `useFetch` (Tier-1) + `useStorage` (Tier-1) wiring — straightforward but adds a backend dependency.
- **Task data from API**: `tasks` is a signal seeded with literal demos. `useFetch('/api/tasks')` is the Tier-1 hook.
- **`defineStore` for cross-screen state**: the `isAuthenticated` + `tasks` signals are module-level for v1. The proper shape uses `defineStore("auth", () => ({ isAuthenticated: signal(false) }))` — deferred per the audit's Gap 4 PR-4 queue.
- **Form validation**: deferred per Gap 4 validation-port queue.

## File layout

```text
examples/native-tasks/
├── src/
│   └── TasksApp.tsx          # canonical source (single file, all 3 targets)
├── scripts/
│   ├── build-swift.sh        # PMTC → generated/swift/TasksApp.swift
│   └── build-kotlin.sh       # PMTC → generated/kotlin/TasksApp.kt
├── generated/                 # gitignored; populated by build scripts
│   ├── swift/
│   └── kotlin/
├── package.json
└── README.md
```

## Verify

```bash
cd examples/native-tasks
bun run build:swift       # emits generated/swift/TasksApp.swift
bun run build:kotlin      # emits generated/kotlin/TasksApp.kt

# Validate Swift parses cleanly against a real Swift toolchain:
swiftc -parse generated/swift/TasksApp.swift
# → exit 0
```

**Both emits are locked by a CI gate.** `native-examples-compile.test.ts` in
`@pyreon/native-compiler` compiles this `src/TasksApp.tsx` itself (no copy)
on both targets: `swiftc -typecheck` against the SwiftUI and runtime stubs, and
`kotlinc`. It used to be checked through a hand-kept fixture copy,
`showcase-tasks.tsx`, which had drifted far from this file and was removed.

## Roadmap

PR-5.2 (web + iOS + Android hosts) and PR-5.3 (XCUITest + Espresso e2e, wired
into `native-device` CI) are both done — see "Sibling hosts" above. Remaining:

- **PR-5.4+** — real backend (`useFetch` + `useStorage`), `defineStore` migration (when Gap 4 PR-4 ships), form validation, more screens.

## iOS host (`ios/`)

> **PRIVATE / EXPERIMENTAL.** iOS host shell for the Gap 5 tasks showcase. Compiles the SHARED `TasksApp.tsx` source (`examples/native-tasks/src/`) to SwiftUI via PMTC; SAME source the web and Android hosts use.

### Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source
                          │
                          ├─→ Web (index.html at the root)    Vite + runtime-dom
                          ├─→ iOS (THIS dir)                  XcodeGen + SwiftUI
                          └─→ Android (native-tasks/android)  Gradle + Compose
```

### What this delivers

| File | Purpose |
|---|---|
| `project.yml` | XcodeGen spec — PyreonTasks app target + PyreonTasksUITests target + scheme; SPM PyreonRouter dep |
| `ios/App.swift` | `@main App` entrypoint → WindowGroup { ContentView() } |
| `ios/ContentView.swift` | 1-line shell: `body: some View { TasksApp() }` |
| `ios/Info.plist` | Standard SwiftUI iOS 17+ Info.plist |
| `scripts/build-ios.sh` | PMTC compile loop — emits `generated/TasksApp.swift` |
| `iosUITests/PyreonTasksUITests.swift` | XCUITest auth-gate + navigation smoke (2 specs) |

Mirror of `native-router-demo-ios` — same project structure, same SPM PyreonRouter dependency, same scheme wiring.

### XCUITest coverage

`PyreonTasksUITests.swift` exercises the Gap 2 (#1440) per-route auth-gate end-to-end:

1. **`test_appLaunchesOnLoginPage`** — root `/` catches to LoginPage; verify it renders within 30s.
2. **`test_authGateLoginAndNavigateThroughScreens`** — type username → tap Continue → assert tasks page renders (auth-gate passed) → tap New Task → assert new-task page → tap Cancel → back to tasks → tap Logout → assert login page renders (auth signal cleared + navigate committed).

The 5-phase test proves the SAME `beforeEnter` source compiles to working auth-gate behaviour on iOS that the web router runs.

### Build + test

```bash
cd examples/native-tasks/ios
bun install
xcodegen generate            # → PyreonTasks.xcodeproj
open PyreonTasks.xcodeproj   # Xcode for interactive dev
# OR command-line:
bash ../scripts/build-ios.sh        # PMTC → generated/TasksApp.swift
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
  --directory ../fixtures &
```

### Status

`scripts/build-ios.sh` points at `examples/native-tasks/src/TasksApp.tsx` (#1449) —
that directory has landed, so the source path resolves. CI wiring has landed
too: `.github/workflows/native-device.yml` runs this directory's emit +
xcodegen + `xcodebuild build` + `xcodebuild test` steps. The Android sibling,
[`native-tasks/android`](android), has also landed — Gap 5's
full host-shells surface (web + iOS + Android) is closed.

### Audit status

Closes the iOS half of Gap 5's host-shells follow-up.

## Android host (`android/`)

> **PRIVATE / EXPERIMENTAL.** Android host shell for the Gap 5 tasks showcase. Compiles the SHARED `TasksApp.tsx` source via PMTC; SAME source the web and iOS hosts use.

### Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source
                          │
                          ├─→ Web (root index.html)  Vite + runtime-dom
                          ├─→ iOS (native-tasks/ios)  XcodeGen + SwiftUI
                          └─→ Android (THIS dir)      Gradle + Compose
```

### What this delivers

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
| `scripts/build-android.sh` | PMTC compile driver |

Mirror of `native-router-demo-android` (#1455) — same Gradle structure + same source-set wiring for `@pyreon/native-router-kotlin`.

### Espresso test

`TasksAppInstrumentedTest.kt` — 2 specs:

1. **`appLaunchesOnLoginPage`** — root catch-all → LoginPage renders (testTag = "login-page")
2. **`authGateLoginAndNavigateThroughScreens`** — 5-phase flow:
   - Type username + tap Continue
   - Assert tasks page rendered (auth-gate passed)
   - Tap "New Task" → assert new-task page
   - Tap Cancel → back to tasks
   - Tap Logout → back to login (auth signal cleared, navigate committed)

Mirror of iOS `PyreonTasksUITests.swift` (#1457) — same shape, same flow, same assertions.

### Build + test

```bash
cd examples/native-tasks/android
bun install
bash ../scripts/build-android.sh           # PMTC emit: TasksApp.tsx → TasksApp.kt
./gradlew assembleDebug      # builds the APK (needs Android SDK)
./gradlew connectedCheck     # runs the Espresso test on a connected device/emulator
```

### Status

`scripts/build-android.sh` points at `examples/native-tasks/src/TasksApp.tsx`, which has
landed, and the Kotlin synth-data-class emit gap (`data class
TasksListPageTask` for `tasks: { id, title, done }[]` prop shapes) has
closed — kotlinc compiles the emit cleanly. CI wiring has landed too:
`.github/workflows/native-device.yml`'s `android-build` job runs this
directory's emit + `gradle assembleDebug` + `gradle connectedCheck`
(Espresso on an emulator), same 3-step pattern as `native-counter-android`.

### Audit status

Closes the FINAL Gap 5 host-shells follow-up: 3 native-tasks target hosts
(web + iOS + Android), all Kotlin scaffold limitations fixed, Android
Espresso parity for counter + router-demo + tasks, iOS XCUITest beyond
TodoMVC.

## Web host (root)

> **PRIVATE / EXPERIMENTAL.** Web sibling of the canonical [`native-tasks`]() Gap 5 scaffold. Renders the SAME `TasksApp.tsx` source via Pyreon's `runtime-dom` + the `@pyreon/primitives` web implementations.

### Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source (single file)
                          │
                          ├─→ Web (THIS dir)                  Vite + runtime-dom
                          ├─→ iOS (native-tasks/ios)          XcodeGen + SwiftUI
                          └─→ Android (native-tasks/android)  Gradle + Compose
```

Mirror of `native-todomvc-web` (Pyreon's Phase E3 reference for the three-targets-one-source pattern).

### What this exercises (currently-merged Tier-1 features)

- **Routing with auth-gate** via `createRouter` + per-route `beforeEnter`
- **Multi-screen navigation** via `useNavigate()` across login / tasks / new-task
- **Canonical primitives** — `<Stack>` / `<Inline>` / `<Field>` / `<Button>` / `<Text>` / `<For>`
- **Signal-driven state** held in the App component (closure-captured for the auth-gate)

All features verified Tier-1 on web by the showcase's CI gates (#1449's `validate-swift.test.ts` fixture loop).

### Build + dev

```bash
cd examples/native-tasks
bun install      # workspace setup (one-time)
bun run dev      # http://localhost:5173/
bun run build    # production bundle in dist/
bun run preview  # preview the production bundle
```

The dev server reloads on source edits to `examples/native-tasks/src/TasksApp.tsx` via Vite's HMR. Same source, instant feedback.

### Status

`entry-client.tsx` imports from `examples/native-tasks/src/TasksApp`, which has
landed, and both sibling hosts have landed too:
[`native-tasks/ios`](ios) (XcodeGen + XCUITest, CI-wired) and
[`native-tasks/android`](android) (Gradle + Espresso,
CI-wired).

### What's still NOT in this PR

- **e2e (Playwright)** for the web showcase — could mirror `e2e/native-todomvc-web.spec.ts` if that fixture exists; otherwise a new fixture for the auth-gate + create-task flows
- **CI integration via verify-modes matrix** — currently not gated; follow-up

### Audit status

Closes the web half of Gap 5's host-shells follow-up.
