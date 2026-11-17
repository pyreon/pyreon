# native-todomvc: TodoMVC

> **Experimental.** The native targets (PMTC → SwiftUI and Jetpack Compose) are demo-quality. See `docs/src/content/docs/multiplatform.md`.

One source, [`src/TodoApp.tsx`](src/TodoApp.tsx): the PMTC TodoMVC reference, with the Android R8 release lane and the iOS device-SDK archive lane. This directory holds the source and every host, the layout `bun create multiplatform` scaffolds:

| Path | What it is |
| --- | --- |
| `src/` | the shared app source |
| `index.html`, `vite.config.ts`, `src/entry-client.tsx` | the web host (`bun run dev` / `bun run build`); e2e: `bun run test:e2e:native-todomvc-web` |
| `ios/` | the iOS host: `project.yml` (xcodegen), `Sources/`, `UITests/`; PMTC writes `ios/generated/` (gitignored) |
| `android/` | the Android host: the Gradle project; PMTC writes `android/app/src/main/kotlin/com/pyreon/generated/` |
| `scripts/build-ios.sh`, `scripts/build-android.sh` | compile the source for each host; the Xcode pre-build script and the Gradle `preBuild` task run them |

Both native hosts are built and device-tested in CI (`native-device.yml`, lane key `todomvc`).

```bash
cd examples/native-todomvc
bun run check            # PMTC for both targets, in memory
bun run build:ios        # src → ios/generated/*.swift
bun run build:android    # src → android/app/src/main/kotlin/com/pyreon/generated/*.kt
```

## iOS host (`ios/`)

> **PRIVATE / EXPERIMENTAL.** Reference compile target for the PMTC TodoMVC arc — the canonical "non-trivial but not contrived" Pyreon app. As of post-Phase-2 closure, **the emitted Swift typechecks-clean** (0 errors via `swiftc -typecheck`). 5 named gaps closed + 7 Phase-2 hardening PRs landed; G7 / G8 deferred to Phase 3.
>
> **Multiplatform note:** the canonical TodoMVC source lives here at [`src/TodoApp.tsx`](src/TodoApp.tsx). The Android sibling [`native-todomvc/android`](android/) **reads from this same file** — proving the PMTC contract that one Pyreon source compiles to both SwiftUI AND Compose. **Both emits are now typecheck-clean** against their respective compiler-stub harnesses (Swift: `swiftc -typecheck` via `validate-swift.test.ts`; Kotlin: `kotlinc + K4 stubs` via `validate-kotlin.test.ts` K-FINAL gate). Phase 2 closed on both platforms.

### Open in Xcode (one command)

```bash
bash ../scripts/xcode-setup.sh       # compiles src/*.tsx → generated/, then runs xcodegen
open PyreonTodoMVC.xcodeproj   # ⌘+R to run on Simulator
```

Requires `xcodegen` (`brew install xcodegen`) and Xcode 15+ targeting iOS 17+.

Inside Xcode, the project's `preBuildScript` re-runs the compile loop on every build — source edits in `src/TodoApp.tsx` are picked up the next time you hit ⌘+B.

### What this exists for

TodoMVC is the canonical "non-trivial but not contrived" app — every UI framework uses it as a baseline. For PMTC it's the structural test of whether the full compiler stack handles real-app shape, surfacing every spot where the chosen mapping breaks down.

This example is the SOURCE (`src/TodoApp.tsx`) that `pyreon-native build` consumes. The emit lands in `generated/` (gitignored, produced on `bash ../scripts/build-ios.sh` OR automatically on every Xcode build via the `project.yml` preBuildScript).

### Current state

The compiler emits a **typecheck-clean** Swift translation (per the banner
above — Phase 2 closed on both platforms). The current `src/TodoApp.tsx`
already exercises: `useStorage` (persistence), canonical `<Field
value onChangeText>` two-way binding, `<Button onPress>`, `<Toggle>`,
immutable array mutation (`todos.set([...todos(), x])` and the
map-based partial-update idiom), the `Filter` union type used throughout the
filter logic, and a `<TransitionGroup>`-wrapped animated keyed list — all
compiling clean.

<details>
<summary>Historical: the Phase 1 gap table (all since closed)</summary>

Not yet working, AS OF PHASE 1 (each was tracked as a gap-closure PR in
[`compile-baseline test`](../../packages/native/compiler/src/tests/todomvc-baseline.test.ts)
— kept here for context on what the compile-baseline arc actually closed):

| Gap | Source pattern | What it needed |
|---|---|---|
| G1 | `<TextField value={draft} onInput={...}>` | Two-way binding emission: Swift `TextField("...", text: $draft)`, Kotlin direct mapping |
| G2 | `onKeyDown={(e) => e.key === 'Enter' && fn()}` | Pattern-match → `.onSubmit { ... }` on Swift, `KeyboardActions(onDone)` on Kotlin |
| G3 | `todos.set([...todos(), x])` | Immutable spread vs platform mutation choice |
| G4 | `todos.set(todos().map(t => t.id === id ? {...t, done: !t.done} : t))` | Object-in-array partial update idiom |
| G5 | `useStorage<T>(key, default)` | `@AppStorage` on Swift, `DataStore` on Kotlin |
| G6 | `type Filter = 'all' \| 'active' \| 'completed'` | Native enum emission (`enum Filter: String { case all, active, completed }`) |
| G7 | `<TodoItem state={todo.done ? 'completed' : 'active'}>` | Hoist conditional dim expression to modifier call site |
| G8 | URL-hash filter sync | `@pyreon/router-ios`/`-android` (Phase 3, still open — routing on native is a separate, ongoing arc) |

Plus three parser-side gaps surfaced by the actual compile:

- **Parser-A** — BlockStatement arrow bodies (`const addTodo = () => { ... }`)
- **Parser-B** — UnaryExpression in arrow bodies (`!t.done` in filter callbacks)
- **Parser-C** — LogicalExpression (`a && b()` in the keyboard handler)

</details>

### Run the compile baseline now

```bash
bash ../scripts/build-ios.sh
cat generated/TodoApp.swift  # see the current partial emit
```

The full compile-baseline is also locked in as a snapshot test under `@pyreon/native-compiler` (`src/tests/todomvc-baseline.test.ts`). Each gap-closure PR updates the snapshot to show the improved emit + reduces the warning count by one.

### Why a separate example vs. embedding in the compiler tests

Three reasons:

1. **Real-app shape is the test.** A test that uses synthetic fixtures can't surface the integration issues that a multi-component multi-feature app does. TodoMVC is structurally larger than the 7 starter fixtures combined.
2. **The Phase 1 deliverable is a working TodoMVC running on the iOS simulator.** Per `native-platforms-phase1-roadmap.md`, that's the end-of-Phase-1 milestone. Having the source in `examples/` (not under tests/) means it can be built, opened in Xcode, run on simulator — exercising the full chain.
3. **Snapshot tests are the regression gate.** The compile-baseline test in `@pyreon/native-compiler` snapshots the current emit; gap-closure PRs update both the emit AND the warning list together so progress is visible and regressions trip immediately.

### Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.

### Device-SDK archive lane (release packaging)

```bash
bash ../scripts/archive.sh   # emit → xcodegen → xcodebuild archive (generic/platform=iOS)
```

Every other xcodebuild invocation in this repo is Simulator-SDK; this lane
compiles the app + both Pyreon Swift runtimes for the REAL device SDK
(arm64-ios) and produces the `.xcarchive` a TestFlight export starts from,
asserting the archive contains an arm64 executable. Unsigned by design —
exporting a signed `.ipa` needs an Apple Developer account; when one
exists, `xcodebuild -exportArchive -exportOptionsPlist` picks up from this
artifact. (The script's first run caught its own vacuity shape: without
the emit step, xcodegen's `optional: true` on `generated/` builds the
target WITHOUT the app — `cannot find 'TodoApp' in scope`.)

## Android host (`android/`)

> **PRIVATE / EXPERIMENTAL.** The Android-target sibling of [`native-todomvc/ios`](ios/). Compiles the **SAME** `TodoApp.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multi-target contract at real-app shape.
>
> **Status:** PMTC Phase 2 Kotlin arc CLOSED. The emit is now **typecheck-clean** against `kotlinc + K4 stubs` (0 errors via `validate-kotlin.test.ts`). K1+K2+K3+K4 all merged, K-FINAL gate locks the contract in CI. Parity with iOS Phase 2 closure reached. Layered limitations (real Compose runtime, Android SDK) noted below.

### The multiplatform contract

Both example apps consume **the same source file**:

```
examples/native-todomvc/src/TodoApp.tsx     ← canonical source
            │
            ├──→ examples/native-todomvc/ios/   bash ../scripts/build-ios.sh  →  generated/TodoApp.swift
            │                                                          (iOS / SwiftUI — typecheck-clean ✓)
            │
            └──→ examples/native-todomvc/android/ bash ../scripts/build-android.sh →  app/.../generated/TodoApp.kt
                                                                       (Android / Compose — emit exists, gaps below)
```

If the source ever needed to fork per-platform, PMTC's design would have failed. The Android example deliberately reads from `examples/native-todomvc/src/` rather than carrying its own copy — drift would invalidate the proof.

### Open in Android Studio

Requires Android SDK + Gradle 8.x + JDK 17. The local devloop:

```bash
bash ../scripts/build-android.sh       # compiles examples/native-todomvc/src/*.tsx → app/.../generated/
gradle build             # runs preBuildScript that re-runs ../scripts/build-android.sh, then Compose build
# or: open the project root in Android Studio (Iguana 2023.2+) and hit ▶
```

The app module's `app/build.gradle.kts` wires `preBuild.dependsOn("pyreonCompile")` so source edits to `examples/native-todomvc/src/TodoApp.tsx` are picked up on every Gradle build — mirroring iOS's xcodegen preBuildScript.

### Current state (Phase 2 Kotlin arc CLOSED)

The compiler-emit pipeline works end-to-end — `bash ../scripts/build-android.sh` produces `app/src/main/kotlin/com/pyreon/generated/TodoApp.kt` from the shared source. **The emit typechecks-clean against `kotlinc + K4 stubs` (0 errors).** The `validate-kotlin.test.ts` "K-FINAL — real TodoMVC emit typechecks via kotlinc + K4 stubs" gate locks the contract in CI.

#### The Phase 2 Kotlin arc — all CLOSED

| PR | Closes | Status |
|----|--------|--------|
| [K1 #879](https://github.com/pyreon/pyreon/pull/879) | enum-vs-string equality (`filter == "active"` → `filter == Filter.active`) | ✅ merged |
| [K3 #880](https://github.com/pyreon/pyreon/pull/880) | `VStack`/`HStack` → `Column`/`Row` mapping at JSX emit | ✅ merged |
| [K2 #881](https://github.com/pyreon/pyreon/pull/881) | `derivedStateOf` non-local return (`return@derivedStateOf`) | ✅ merged |
| [K4 #882](https://github.com/pyreon/pyreon/pull/882) | Extended Compose stubs (rememberSaveable / Saver / Material widgets / kotlinx-serialization) | ✅ merged |
| K-FINAL (this PR) | End-to-end TodoMVC `transform()` → kotlinc validation gate | this PR |

#### Remaining gap

None currently known. The `nextId + 1` id-generation bug this section used
to describe no longer applies — the shared `TodoApp.tsx` source now derives
each new todo's id from `todos().reduce((m, t) => (t.id > m ? t.id : m), 0) +
1` (recomputed from the current list on every add), not a stale incrementing
counter variable.

### Verifiable locally vs requires Android SDK

Same pattern as iOS (where Xcode build requires Xcode + Simulator + signing). What this example proves WITHOUT Android SDK:

- ✓ `bash ../scripts/build-android.sh` produces structurally valid Kotlin (parses, syntax-correct)
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

### Release lane (signed + R8-minified, device-proven)

```bash
bash ../scripts/ensure-release-keystore.sh        # one-time: self-signed keystore (gitignored)
gradle assembleRelease                          # signed, minified release APK
gradle -PpyreonReleaseTests connectedCheck      # the SAME instrumented suite vs the RELEASE build
bash ../scripts/assert-release-lane.sh             # proves R8 ran + the release build was what got tested
```

The keystore is self-signed and generated locally — Play App Signing re-signs
store uploads, so this key is enough to install and run the real release
artifact today; a real upload key drops into the same `keystore.properties`.

Two lanes, two claims, stated precisely:

- **`release-smoke.sh`** boots the UNTOUCHED release APK — full R8
  shrink+obfuscate+optimize, the exact bytes a user would install — and
  asserts a REACTIVE Compose text landed in the accessibility tree (no test
  APK, no instrumentation relationship, so nothing about the artifact is
  altered to test it).
- **`-PpyreonReleaseTests connectedCheck`** re-runs the full instrumented
  suite against the SIGNED release build with `-dontshrink` applied (test
  frameworks resolve the stdlib/coroutines/tracing/compose hooks from the
  app's classpath, which shrinking strips — found four classes deep before
  the shape was recognized). Obfuscation + optimization stay ON, so renamed
  reflection lookups and inlining are exercised; behavior under full
  shrinking is the smoke lane's claim, not this one's.

The assert script closes the silent-vacuity holes: minify dropped (no
`mapping.txt`), toggle removed (`-P` silently unused → the suite re-tests
debug), and a runner that crashed at startup (0 executed tests). CI runs
both lanes on the required Android job, on the same emulator boot as the
debug suite.

### Why a separate example dir (vs sharing iOS's)

Three reasons matching the iOS rationale:

1. **Per-platform host code differs.** iOS has `App.swift` + `ContentView.swift` + `Info.plist` + `project.yml`. Android has `MainActivity.kt` + `AndroidManifest.xml` + Gradle files. Co-locating in one dir would tangle the build configs.
2. **The Phase 1 deliverable is a working TodoMVC on each platform.** Per `native-platforms-phase1-roadmap.md`, that's the end-of-Phase-1 milestone. Having both examples in `examples/` (one per platform) lets each be opened in its native IDE — Xcode for iOS, Android Studio for Android — without conflicting project files.
3. **The shared source is the proof.** `examples/native-todomvc/scripts/build-android.sh` reading from `examples/native-todomvc/src/` is the structural assertion: the multiplatform claim survives ONE source. Two dirs sharing one source > one dir with two emit targets.

### Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.

## Web host (root)

> **PRIVATE / EXPERIMENTAL.** PMTC TodoMVC reference rendered on **WEB** via the `@pyreon/primitives` runtime. Sibling of:
>
> - [`examples/native-todomvc/ios/`](ios/) — SwiftUI target via PMTC compiler emit
> - [`examples/native-todomvc/android/`](android/) — Compose target via PMTC compiler emit
>
> Phase D of the PMTC multiplatform story — proves the canonical primitive vocabulary renders end-to-end on web.

### What this proves

`@pyreon/primitives`' web primitives (this app uses `Stack`, `Inline`, `Text`, `Button`, `Field`, `Toggle` — 6 of the now 17 implemented) plus Pyreon's `<For>` / `<Show>` control flow render a non-trivial app (TodoMVC) end-to-end with reactive signals + persistent storage. The `verify-modes` cell `native-todomvc-web × spa` asserts the production build emits expected HTML content.

### Build / dev

```bash
cd examples/native-todomvc
bun run dev      # vite dev server
bun run build    # vite production build → dist/
bun run preview  # serve dist/ via vite preview
```

### Source structure

| File | Purpose |
|---|---|
| `index.html` | Bootstrap shell — mounts `#app` + loads `entry-client.tsx`. |
| `src/entry-client.tsx` | `@pyreon/runtime-dom` mount call — `import { TodoApp } from 'examples/native-todomvc/src/TodoApp'`. |

The canonical source lives at [`examples/native-todomvc/src/TodoApp.tsx`](examples/native-todomvc/src/TodoApp.tsx) — **the same file** Android reads via `scripts/build.sh` and iOS reads via xcodegen. Three targets, one `.tsx`. Web has no local copy; `entry-client.tsx` resolves it by relative-path import.

### Shared-source contract (Phase E3 — landed)

`src/entry-client.tsx` imports `TodoApp` from `examples/native-todomvc/src/TodoApp` — the SAME `.tsx` file Android compiles. This is "the literal same file across all three targets" the PMTC arc claims:

- **Web** — Vite + `@pyreon/runtime-dom` resolves the import + the canonical primitives (`<Stack>`, `<Field>`, etc.) auto-import from `@pyreon/primitives` (web runtimes).
- **iOS** — `pyreon-native build --target=ios` compiles the same `.tsx` to SwiftUI via PMTC's `canonical-primitives.ts` table (no `import` lines needed; the compiler resolves bare JSX tags).
- **Android** — same `.tsx`, same compile pass, `--target=android` emits to Compose.

Verified at `examples/native-todomvc/scripts/build-android.sh` (compiles `examples/native-todomvc/src/TodoApp.tsx`) + the verify-modes `native-todomvc-web × spa` cell (proves the web build emits expected HTML from the import).

### Canonical `<Toggle>` — semantic split across platforms

`<Toggle>` is the canonical binary-toggle primitive. The PMTC compiler emits the right native widget per target:

- Web: `<input type="checkbox">`
- iOS (SwiftUI): `Toggle("", isOn: ...)` — signal binding-projection OR custom `Binding(get:set:)` for parent-owns-state (the TodoRow pattern)
- Android (Compose): `Switch(checked = ..., onCheckedChange = ...)` (NOT `Toggle` — Compose uses `Switch` for the binary toggle)

The non-signal value path (PR #970) routes through SwiftUI's `Binding(get:set:)` so parent-owns-state shapes (TodoRow reading `props.todo.done` + calling `props.onToggle`) work without converting the parent state to a signal.

### What's NOT in Phase D

- **Real-Chromium e2e gate** (Playwright spec asserting click → DOM updates). Verify-modes catches the build emits content; the runtime click contract is a follow-up.

### Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
