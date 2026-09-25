# @pyreon/create-multiplatform

Scaffold a multiplatform Pyreon app — **one `src/App.tsx` source** that runs on
**web**, **iOS** (SwiftUI), and **Android** (Jetpack Compose) via PMTC (the
Pyreon Multi-Target Compiler).

```bash
npx create-multiplatform my-app
cd my-app
npm install
npm run dev          # web (Vite)
npm run build:ios    # src/App.tsx → ios/generated/App.swift, then xcodegen + Xcode
npm run build:android # src/App.tsx → android/.../generated/App.kt, then Gradle
```

## Usage

```text
Usage: create-multiplatform <project-name> [--dir <path>]
```

| Arg | Description |
| --- | --- |
| `<project-name>` | Required positional. Also the directory scaffolded into (unless `--dir` overrides it). Must be **kebab-case**: starts with a lowercase letter, lowercase letters/digits/hyphens only, no consecutive or trailing hyphens, 1–50 characters — the name propagates into the Xcode project name and the Gradle module id, both of which have stricter rules than an npm package name. An invalid name fails fast with a suggested kebab-case fix. |
| `--dir <path>` / `-d <path>` | Scaffold into a different directory than `<project-name>` (defaults to the project name). |
| `--help` / `-h` | Print usage and exit 0. |

The target directory must not already exist and be non-empty (a `.git`-only or `.DS_Store`-only directory is fine — the common `mkdir my-app && cd my-app && npx create-multiplatform .` flow). A non-empty existing directory refuses to scaffold rather than overwrite in-progress work.

```bash
npx create-multiplatform my-app
npx create-multiplatform my-app --dir ./apps/my-app
npx create-multiplatform --help
```

## What it generates

A project sharing one canonical-primitive source across three targets:

```
my-app/
  src/App.tsx                 # the ONE source (canonical @pyreon/primitives)
  package.json                 # scripts: dev, build, preview, lint, build:ios,
                               # build:android, release:keystore, release:android
  index.html  vite.config.ts  tsconfig.json   # web
  .pyreonlintrc.json           # the "portable" lint rule group is enabled + scoped
                               # to src/App.tsx — the rules that flag a shared-source
                               # construct PMTC can't lower to iOS/Android
  ios/project.yml  ios/Sources/{App,ContentView}.swift  ios/Info.plist
  android/{settings,build}.gradle.kts  android/app/...   MainActivity.kt
  scripts/build-ios.sh  scripts/build-android.sh  scripts/ensure-release-keystore.sh
```

`src/App.tsx` uses the canonical `@pyreon/primitives` vocabulary (`<Stack>`,
`<Text>`, `<Button>`, …). The web build auto-imports the DOM runtimes; the iOS
and Android build scripts run `pyreon-native build` (via `@pyreon/native-cli`)
to compile the same source to SwiftUI / Compose.

## `package.json` scripts

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `vite` | Web dev server |
| `build` | `vite build` | Web production build |
| `preview` | `vite preview` | Preview the web build |
| `lint` | `pyreon-lint .` | Lint (`@pyreon/lint`, incl. the `portable` rule group) |
| `build:ios` | `bash scripts/build-ios.sh` | Compile `src/App.tsx` → Swift, wire native sources, open/build in Xcode |
| `build:android` | `bash scripts/build-android.sh` | Compile `src/App.tsx` → Kotlin, wire Gradle source sets, build with Gradle |
| `release:keystore` | `bash scripts/ensure-release-keystore.sh` | Generate a self-signed Android release keystore if one doesn't already exist (credential-free — Play App Signing re-signs uploads) |
| `release:android` | `... && cd android && gradle assembleRelease` | Ensure the keystore, then produce a signed, R8-minified release APK |

`dependencies` pin `@pyreon/core`, `@pyreon/primitives`, `@pyreon/reactivity`, `@pyreon/runtime-dom`; `devDependencies` add `@pyreon/vite-plugin`, `@pyreon/native-cli`, the four native runtime/router packages (`@pyreon/native-runtime-swift`, `@pyreon/native-router-swift`, `@pyreon/native-runtime-kotlin`, `@pyreon/native-router-kotlin`), and `@pyreon/lint` — all pinned to the same monorepo version as the scaffolder itself.

## What "portable" linting does

The generated `.pyreonlintrc.json` enables the opt-in `portable` `@pyreon/lint` rule group, scoped to `src/App.tsx` (the `portablePaths` option) — the rule group is off by default because it's noise in a web-only project, and unscoped it can't infer which files are meant to reach native. It's the only thing that says, before a build does, whether the shared source strays outside the TypeScript subset PMTC lowers to Swift/Kotlin (warns, mirroring how PMTC itself reports an out-of-subset construct: it names the shape and keeps going).

## Toolchain requirements

| Target | Required |
| --- | --- |
| Web | Node 18+ or Bun |
| iOS | macOS, Xcode 15+, xcodegen (`brew install xcodegen`) |
| Android | JDK 17, Android SDK, Gradle (handled by the wrapper) |

The web target needs no platform-specific toolchain — scaffold the project and build only `npm run dev` if you don't need native immediately.

## Status

**Experimental.** The generator and the generated project structure are
verified (file tree + the shared `App.tsx` compiling through PMTC to both
native targets). End-to-end device builds (Simulator / Emulator) are the
`native-device` CI gate's concern and require the platform toolchains
(Xcode / Android SDK) installed locally.

## See also

- [Multiplatform (PMTC)](https://pyreon.dev/docs/multiplatform) — the architecture, primitive vocabulary, and capability matrix.
- [`@pyreon/native-cli`](../../native/cli/README.md) — the `pyreon-native` binary the generated `build:ios` / `build:android` scripts shell out to.
- [`@pyreon/create-zero`](../create-zero/README.md) — the web-only scaffolder, when you don't need native targets.

## Documentation

Full docs: [pyreon.dev/docs/create-multiplatform](https://pyreon.dev/docs/create-multiplatform) (or `docs/src/content/docs/create-multiplatform.md` in this repo).

## License

MIT
