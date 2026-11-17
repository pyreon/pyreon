# native-counter: Counter

> **Experimental.** The native targets (PMTC → SwiftUI and Jetpack Compose) are Experimental overall: the store-release and crash-reporting path is not ready yet. Each area has its own tier (Beta / Experimental / Not ready) in the "Maturity by area" table of `docs/src/content/docs/multiplatform.md`.

One source, [`src/Counter.tsx`](src/Counter.tsx): a counter plus device APIs: geolocation, haptics, share, picker. This directory holds the source and every host, the layout `bun create multiplatform` scaffolds:

| Path | What it is |
| --- | --- |
| `src/` | the shared app source |
| `ios/` | the iOS host: `project.yml` (xcodegen), `Sources/`, `UITests/`; PMTC writes `ios/generated/` (gitignored) |
| `android/` | the Android host: the Gradle project; PMTC writes `android/app/src/main/kotlin/com/pyreon/generated/` |
| `scripts/build-ios.sh`, `scripts/build-android.sh` | compile the source for each host; the Xcode pre-build script and the Gradle `preBuild` task run them |

Both native hosts are built and device-tested in CI (`native-device.yml`, lane key `counter`).

```bash
cd examples/native-counter
bun run check            # PMTC for both targets, in memory
bun run build:ios        # src → ios/generated/*.swift
bun run build:android    # src → android/app/src/main/kotlin/com/pyreon/generated/*.kt
```

## iOS host (`ios/`)

> **PRIVATE / EXPERIMENTAL.** Minimal PMTC counter example for iOS.

This example demonstrates the full PMTC compile loop for iOS:

```
src/Counter.tsx          (user-authored Pyreon JSX)
        │
        │ scripts/build.sh
        │   → bun packages/native/cli/src/cli.ts build --target=ios ...
        ▼
generated/Counter.swift  (compiler-emitted SwiftUI)
        │
        │ Xcode (host project)
        ▼
ios/App.swift + ios/ContentView.swift  consumes the generated symbol
```

### Status

What's here:

| File | Purpose |
|---|---|
| `src/Counter.tsx` | User-authored Pyreon source — started as a minimal counter (PR 4); has since grown into a shared multi-feature device-proof fixture (see the note below) |
| `ios/App.swift` | `@main` SwiftUI app entry point |
| `ios/ContentView.swift` | Root view, bootstraps `Counter()` from `generated/` |
| `ios/Info.plist` | Standard iOS bundle metadata |
| `scripts/build-ios.sh` | Drives the Pyreon → Swift compile loop |
| `scripts/xcode-setup.sh` | Compiles the source + regenerates `PyreonCounter.xcodeproj` via xcodegen |
| `project.yml` | xcodegen spec — the source of truth for the generated `.xcodeproj` |
| `package.json` | Workspace member, runs `build.sh` via `bun run build` |
| `.gitignore` | Generated outputs + Xcode artifacts not committed |

`.xcodeproj` generation (originally tracked as a "PR 4a follow-up" below) has
since landed — it's driven by `xcodegen` + the committed `project.yml`, not
committed directly (see "Open in Xcode" below for why). iOS simulator CI
against real Apple-hardware runners is still tracked separately.

### What the counter does

:::note
This section originally described `src/Counter.tsx` as it was in PR 4 (PMTC
Phase 0) — a minimal ~12-line counter. That file is now a **583-line shared
device-proof fixture**: the PMTC team consolidated dozens of feature proofs
(flow diagrams, animations, biometrics, i18n plurals, notifications, haptics,
geolocation, rocketstyle dimension resolution, and more) into this one
source rather than standing up a separate Xcode/Gradle project per feature.
The counter proof is still IN there — `const count = signal<number>(0)`,
a `<Text>Count: {count}</Text>`, and an `Increment` button that calls
`count.set(count() + 1)` — it's just one slice of a much bigger tree now.
The canonical vocabulary has also moved on: current source uses
`@pyreon/primitives`' `Stack`/`Button onPress` (not the `VStack`/`onClick`
shown in the old snippet below), and every file header comment explains what
each proof demonstrates. Read `src/Counter.tsx` directly for the current,
accurate source rather than trusting a frozen excerpt here.
:::

The historical (PR 4) shape, kept for context on what "Phase 0 success
criterion 2" originally verified:

```tsx
import { signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal<number>(0)
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Button onClick={() => count.set(count() + 1)}>Increment</Button>
    </VStack>
  )
}
```

Which compiled to a `generated/Counter.swift` byte-for-byte indistinguishable
from idiomatic hand-written SwiftUI. That claim still holds for the CURRENT,
much larger source — `swiftc -parse` accepting the generated output cleanly
is the same CI-verified guarantee, just over more surface area now.

### Run the compile loop now

```bash
## From this directory
bun run build:ios
```

Output: `generated/Counter.swift` carrying the SwiftUI translation of `src/Counter.tsx`. Verify with:

```bash
cat generated/Counter.swift
```

### Open in Xcode (automated via xcodegen)

One-time prerequisite: install [xcodegen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
```

Then from this directory:

```bash
./scripts/xcode-setup.sh   # compiles src/*.tsx + generates PyreonCounter.xcodeproj
open ios/PyreonCounter.xcodeproj
```

`PyreonCounter.xcodeproj` is generated deterministically from [`project.yml`](./ios/project.yml) — gitignored, regenerated on demand. The project carries a pre-build script that re-runs `./scripts/build-ios.sh` on every Xcode build, so edits to `src/Counter.tsx` are picked up automatically the next time you hit ⌘+B.

#### Why xcodegen vs. committing the .xcodeproj directly

Apple's `.xcodeproj` is a directory of XML/plist files with full file paths baked in. Three issues:

1. **Moving directories breaks references** — committed `.xcodeproj`s rot when the surrounding tree changes.
2. **Different machines produce different orderings** in the binary `.pbxproj`, so diffs are noisy even when nothing meaningful changed.
3. **No single source of truth** — the `.pbxproj` IS the authoritative file but it's not human-friendly to edit.

xcodegen sidesteps all three: the YAML spec IS the source of truth; the `.xcodeproj` regenerates deterministically. Same convention used by [Vapor](https://github.com/vapor/vapor), [SwiftLint](https://github.com/realm/SwiftLint), and many other Apple-platform projects.

#### Manual setup (if you can't install xcodegen)

If xcodegen isn't an option:

1. Run `./scripts/build-ios.sh` to produce `generated/Counter.swift`.
2. Open Xcode → File → New → Project → iOS App.
3. Save the new Xcode project at the parent directory level (NOT inside `examples/native-counter/ios/`).
4. Delete the auto-generated `ContentView.swift` from Xcode's new project.
5. Drag `ios/App.swift`, `ios/ContentView.swift`, `ios/Info.plist`, and `generated/Counter.swift` into the Xcode project.
6. Build target → iPhone simulator → Run.

### What this example proves

**Phase 0 success criterion 2** (signal → @State round-trip with counter on iOS simulator):

- Pyreon TSX compiles cleanly via the CLI ✓
- The generated Swift file passes `swiftc -parse` ✓
- Output uses real SwiftUI primitives: `@State`, `VStack`/`Stack`, `Text(...)`, `Button(...) { ... }` — idiomatic SwiftUI ✓
- Increment semantics: `count.set(count() + 1)` becomes `count = count + 1` (SwiftUI's `@State` IS the assignment target) ✓
- Compile is automated (one command) ✓
- Xcode project is automated (xcodegen + project.yml) ✓
- **Final user step**: `open ios/PyreonCounter.xcodeproj`, build, tap the button on simulator.

### Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.

## Android host (`android/`)

> **PRIVATE / EXPERIMENTAL.** Android-target sibling of [`native-counter/ios`](../native-counter/ios/). Compiles the **SAME** `Counter.tsx` source to Jetpack Compose / Kotlin — proving the PMTC multi-target contract for the canonical Counter sample at the Android-real-toolchain level.

### Architecture

```text
examples/native-counter/src/Counter.tsx     ← canonical source (single file)
                          │
                          ▼ PMTC compile
                          │
examples/native-counter/android/app/src/main/kotlin/com/pyreon/generated/Counter.kt
                          │
                          ▼ Compose composition
                          │
   MainActivity.setContent { Counter() }        ← 5-line host shell
```

Mirror of [`native-todomvc-android`](../native-todomvc-android/) — same Gradle structure, same plugin versions, same dependency set MINUS:
- `kotlinx-serialization-json` (Counter has no `@Serializable` types)
- `compose.runtime:runtime-saveable` (no `rememberSaveable` — Counter state doesn't survive config changes by design)

### What this proves

- **One source, three targets** at counter-sample scope. The same `Counter.tsx` lives in `native-counter/src/`; both `native-counter/ios` (iOS) and this directory (Android) compile from it. Web sibling `native-counter (web host)/` would do the same (deferred — not in this scaffold's scope).
- **Signal → @State → mutableStateOf round-trip** via the canonical PMTC Phase 0 success criterion #2. `signal<number>(0)` emits as `var count by remember { mutableStateOf(0) }` on Compose, `count.set(count() + 1)` rewrites as `count = count + 1`.
- **Espresso instrumented-test parity with iOS XCUITest** (#1452). Same shape, same assertion (initial render + signal-write → re-render).

### Build + test

```bash
cd examples/native-counter/android
bun install                              # workspace setup (one-time)
./scripts/build.sh                       # PMTC emit: Counter.tsx → Counter.kt
./gradlew assembleDebug                  # builds the APK (needs Android SDK)
./gradlew connectedCheck                 # runs the Espresso test against a connected device/emulator
```

The `app/build.gradle.kts` wires `preBuild.dependsOn("pyreonCompile")` so source edits to `examples/native-counter/src/Counter.tsx` are picked up on every `gradlew build` — mirror of iOS's xcodegen `preBuildScript`.

### Instrumented test

`app/src/androidTest/kotlin/com/pyreon/CounterInstrumentedTest.kt`:
- Boots MainActivity via `createAndroidComposeRule<MainActivity>()`
- Asserts `Count: 0` text is displayed
- Performs click on `Increment` button
- Asserts `Count: 1` text is displayed

Counter source doesn't carry `data-testid` (predates the canonical-primitives migration), so the test queries by displayed text via `onNodeWithText("Count: N")`. Stable for the deterministic-initial-state smoke.

### CI wiring

`.github/workflows/native-device.yml`'s `android-build` job runs `gradle assembleDebug` + `gradle connectedCheck` against the labelled-PR / nightly schedule. Same advisory-only opt-in shape as the iOS `xcodebuild test` runs and the TodoMVC Android sibling.

### Limitations

- **No real-device validation in this PR**: this scaffold's Gradle build was not run against a real Android SDK in this session (no Android Studio / Gradle / Android SDK runner available). Real-device validation lands when the `native-device` workflow runs against this directory.
- **The canonical-primitives migration (PMTC P3) has landed** — the shared `Counter.tsx` now imports `Stack` / `Button` (with `onPress`) from `@pyreon/primitives`, not the old `<VStack>` / `onClick` vocabulary. (`Counter.tsx` has also grown well beyond a simple counter since this README was first written — it's now a shared multi-feature device-proof fixture; see `native-counter/ios/README.md` for the current description.)

### Audit status

Closes the Android Counter half of Gap 5 (Espresso parity beyond TodoMVC). The Android `native-router-demo/android` directory + a `native-counter (web host)` web sibling remain follow-up PRs.
