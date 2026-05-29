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

## What it generates

A project sharing one canonical-primitive source across three targets:

```
my-app/
  src/App.tsx                 # the ONE source (canonical @pyreon/primitives)
  src/entry-web.tsx           # web mount
  index.html  vite.config.ts  tsconfig.json   # web
  ios/project.yml  ios/Sources/{App,ContentView}.swift  ios/Info.plist
  android/{settings,build}.gradle.kts  android/app/...   MainActivity.kt
  scripts/build-ios.sh  scripts/build-android.sh
```

`src/App.tsx` uses the canonical `@pyreon/primitives` vocabulary (`<Stack>`,
`<Text>`, `<Button>`, …). The web build auto-imports the DOM runtimes; the iOS
and Android build scripts run `pyreon-native build` to compile the same source
to SwiftUI / Compose.

## Status

**Experimental.** The generator and the generated project structure are
verified (file tree + the shared `App.tsx` compiling through PMTC to both
native targets). End-to-end device builds (Simulator / Emulator) are the
`native-device` CI gate's concern and require the platform toolchains
(Xcode / Android SDK) installed locally.
