# native-showcase: Today, one source file on three targets

> **Experimental.** The native targets (PMTC → SwiftUI and Jetpack Compose) are experimental: demo-quality, not
> production-ready. See `docs/src/content/docs/multiplatform.md`.

**Today** is a small todo app: a heading with a count, a field with an Add button, a list with a switch and a Remove
action per todo, and an empty state. It is written once, in [`src/TodayApp.tsx`](src/TodayApp.tsx), with signals and the
canonical `@pyreon/primitives`. One directory holds the source and all three hosts, the layout
`bun create multiplatform` scaffolds:

| Path | What it does |
| --- | --- |
| `index.html`, `vite.config.ts`, `src/entry-client.tsx`, `src/entry-server.ts`, `scripts/prerender.ts` | the web host: renders the app to HTML at build time and hydrates it in the browser. `index.html` sets only page-level styling (page colour, font, the accent for the browser's own controls and focus ring) |
| `ios/` (`project.yml`, `Sources/`, `UITests/`) | the iOS host: compiles the source to SwiftUI with PMTC (`ios/generated/`, gitignored) and builds it with the shared `PyreonRuntime` / `PyreonRouter` packages. `Sources/App.swift` and `Sources/ContentView.swift` set the page colour, top alignment and accent tint |
| `android/` (Gradle project, `app/`) | the Android host: compiles the source to Jetpack Compose (`android/app/src/main/kotlin/com/pyreon/generated/`, gitignored) before every Gradle build. `MainActivity.kt` goes edge-to-edge with the content in the safe-drawing area (as #4294), sets the page colour and a Material theme carrying the accent |

The system controls stay native on each platform (a checkbox on the web, the iOS switch, the Material switch and text
field). The surfaces, type and the ember accent come from the source, in a light and a dark version chosen by
`useColorMode()`, so the app follows the system appearance on all three. The hosts only set the page colour and give the
platform controls the accent colour, as any app does.

```bash
bun run check        # PMTC for both targets, in memory: 0 errors, 0 warnings
```

## Run it

From the repo root, after `bun install`:

```bash
cd examples/native-showcase

# Web: build (client bundle + server render + prerender), then serve
bun run build && bunx vite preview

# iOS (macOS, Xcode 16+, xcodegen): generate the project, build, install, launch
bun run xcode
cd ios && xcodebuild -project PyreonShowcase.xcodeproj -scheme PyreonShowcase \
  -destination 'id=<simulator udid>' -derivedDataPath build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcrun simctl install <simulator udid> build/DerivedData/Build/Products/Debug-iphonesimulator/PyreonShowcase.app
xcrun simctl launch <simulator udid> com.pyreon.PyreonShowcase

# Android (JDK 17, Android SDK, Gradle 9.6+): build, install, launch
cd android && gradle assembleDebug --project-cache-dir .gradle
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.pyreon.PyreonShowcase/com.pyreon.MainActivity
```

Every build compiles the shared source first (`scripts/build-ios.sh` and `scripts/build-android.sh`, wired into the Xcode
pre-build script and the Gradle `preBuild` task), so an edit to `TodayApp.tsx` reaches all three on the next build.

CI builds both native hosts (no simulator or emulator) in the `iOS — xcodebuild` and `Android — gradlew` lanes of
`native-device.yml` whenever this directory or what it compiles against changes. The device tests below are not run in
CI yet.

## Device tests

The same identifiers (`data-testid` in the source) reach all three: `data-testid` on the web,
`.accessibilityIdentifier` on iOS, Compose test tags on Android.

```bash
# iOS: add, check off and remove a todo; the empty state (tests in ios/UITests/)
cd examples/native-showcase/ios && xcodebuild test -project PyreonShowcase.xcodeproj -scheme PyreonShowcase \
  -destination 'id=<simulator udid>' -derivedDataPath build/DerivedData

# Android: the same two tests as Compose instrumented tests (android/app/src/androidTest/)
cd examples/native-showcase/android && gradle connectedDebugAndroidTest --project-cache-dir .gradle
```

`TEST_RUNNER_PYREON_SHOWCASE_CAPTURE=1` puts the iOS test in capture mode (one key at a time, each state held, a
`[beat]` line per step), which is how the pyreon.dev homepage loop was recorded.

## Gaps this example works around

Each is filed; the source uses a shape that renders the same on all three instead:

- #4344: a label-less `<Toggle>` fills its row on iOS. The switch gets `style={{ maxWidth: '64px' }}`.
- #4345: token `padding*` props sit outside a `style` background on Android. Padding lives in the `style` object.
- #4346: a style ternary cannot flip `borderColor` or a per-side padding. Cards have no border and one padding value.
- #4347: `<Heading>` is regular weight on Android. The title is `<Text size="xl" weight="bold" accessibilityRole="header">`.
- `<Stack align="stretch">` hugs on native (the compiler warns); rows fill their width through a `<Spacer />`.
- The web build renders the light version on the server; a visitor in dark mode sees it switch to dark at hydration.
- On Android, Back closes the keyboard but leaves the field focused (Compose does not clear focus there).
