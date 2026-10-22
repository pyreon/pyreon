---
title: Native Dev Loop
description: The fast edit loop for iOS and Android — pyreon-native dev watches your shared source, reports compiler problems in milliseconds, and rebuilds, reinstalls and relaunches the app on a simulator or emulator. What it is, what it is not, and measured timings.
---

On the web, a save updates the page in place. On iOS and Android there is no JavaScript engine on the device to patch, because [PMTC](/docs/multiplatform) compiles your shared source to real SwiftUI and Jetpack Compose. So the native loop is a **rebuild loop, not hot reload**: the app restarts and in-memory state resets. `pyreon-native dev` makes that loop as short as the toolchains allow.

## The three-layer loop

Use the cheapest layer that answers your question.

| Layer | Command | Feedback | Use it for |
| --- | --- | --- | --- |
| Web | `bun run dev` | Instant, state-preserving hot reload | Layout, logic and styling that behave the same on every target. Most of the work. |
| Compiler | `npx pyreon-native check --watch --source=src` | Milliseconds, no device | "Will this construct run on the device?" — every unsupported construct is a named warning. |
| Device | `npx pyreon-native dev --target=ios` (or `android`) | Seconds, on a real simulator or emulator | Native look and feel, device features, anything the web cannot show. |

## `pyreon-native dev`

```bash
# iOS: uses a booted simulator, or boots the newest iPhone simulator
npx pyreon-native dev --target=ios

# Android: needs an online emulator or a USB-debugging device
npx pyreon-native dev --target=android
```

Run it from the project root of a [Create Multi-Platform](/docs/create-multiplatform) app. It does this on every change:

1. **Compiles your source in memory** and prints compiler warnings and errors straight away, before any Xcode or Gradle work starts. A compile error never reaches the native toolchain, and the watcher keeps running.
2. **Decides whether a native build is needed.** If the emitted Swift or Kotlin is byte-identical to what the running app was built from (a comment, whitespace, a web-only file), the build is skipped.
3. **Builds incrementally**: `xcodebuild` against a persistent derived-data folder on iOS, `gradle installDebug` on Android.
4. **Installs and relaunches** the app by its bundle id or application id, replacing the running copy.

What triggers what:

| You changed | What runs |
| --- | --- |
| `src/**/*.tsx` | Compile in memory, then a native build only if the emit changed. |
| Hand-written native code (`ios/Sources`, `android/app/src/main`, `project.yml`, `build.gradle.kts`) or `package.json` | Native build, no recompile needed. |
| `assets/` or `web/` | The project's own staging script (`scripts/build-ios.sh` / `build-android.sh`), then a native build. |

A failed build prints the tail of the tool's output and waits. Fix the problem and save again: a failed build is never remembered as "up to date", so the next save always retries.

### Options

| Flag | Meaning |
| --- | --- |
| `--target=ios\|android` | Required. |
| `--app=<dir>` | Project root. Defaults to the current directory. |
| `--source=<dir>` | Shared source directory. Defaults to `<app>/src`. |
| `--device=<name\|id>` | A simulator name or UDID, or an adb serial, instead of the first one found. |
| `--once` | One build-install-launch cycle, then exit with status 0 on success and 2 on failure. Use it in scripts and to prepare a device before [end-to-end tests](/docs/native-e2e-testing). |
| `--interval=<ms>` | Poll interval (default 500). |
| `--plugin=<file>` / `--no-plugins` | Same meaning as for `build` and `check`. |

## Measured timings

Measured on an Apple-silicon Mac, iOS 18.5 simulator, with the scaffolded counter app. A larger app has more Swift to compile, so treat these as a floor and measure your own.

| Step | Time |
| --- | --- |
| Compile the shared source in memory | 1–9 ms |
| First run: stage, generate the Xcode project, full build, install, launch | about 31 s |
| Edit a label, rebuild, reinstall, relaunch (warm) | about 3 s |
| Comment-only edit | native build skipped |

The Android numbers depend far more on the machine and on Gradle's daemon state; the first Gradle run also downloads and configures dependencies.

## What it does not do

- **No hot reload and no state preservation.** The app restarts on every native rebuild. Keep the state you are iterating on cheap to reach, or iterate on it in the web build.
- **No source-mapped native errors.** A Swift or Kotlin compiler error is shown as the toolchain reports it, against the generated file. The generated files start with a source-location comment pointing at your `.tsx`.
- **No emulator creation.** It boots an existing iOS simulator if none is running; for Android, start an emulator or connect a device first.
- **No physical-device deployment.** It targets simulators and emulators. A physical device needs signing, which is part of release builds (see [Create Multi-Platform](/docs/create-multiplatform)), not the edit loop.
- **Autodetected project identity.** The iOS project name and bundle id come from `ios/project.yml`; the Android application id and launcher activity come from `android/app/build.gradle.kts` and the manifest. A project restructured away from the scaffold's layout will be refused with a message naming the missing file.

## Troubleshooting

- **"no iPhone simulator is installed"** — add one in Xcode → Settings → Platforms.
- **"no Android device is online"** — start an emulator (Android Studio → Device Manager) or plug in a device with USB debugging, then check `adb devices`.
- **"adb is unavailable"** — install the Android SDK platform-tools and set `ANDROID_HOME`.
- **The Android build cannot find Java** — put a JDK 17 on `PATH` (or set `JAVA_HOME`) before starting.
- **Nothing happens after a save** — the watcher ignores generated output, `node_modules` and build folders by design. A file outside `src/`, `assets/`, `web/`, `ios/` and `android/` is not watched.
