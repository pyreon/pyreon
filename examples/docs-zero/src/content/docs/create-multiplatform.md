---
title: '@pyreon/create-multiplatform'
description: 'Scaffold a multiplatform Pyreon app — one src/App.tsx that runs on web, iOS (SwiftUI), and Android (Jetpack Compose) via PMTC.'
---

# @pyreon/create-multiplatform

Scaffold a multiplatform Pyreon app — **one `src/App.tsx` source** that runs on **web**, **iOS** (SwiftUI), and **Android** (Jetpack Compose) via PMTC (the Pyreon Multi-Target Compiler).

:::warning{title="Experimental"}
The generator and the generated project structure are verified end-to-end (file tree + the shared `App.tsx` compiling through PMTC to both native targets). Device builds (Simulator / Emulator) require the platform toolchains (Xcode / Android SDK) installed locally — gated by the `native-device` CI workflow.
:::

## Quick start

```bash
npx create-multiplatform my-app
cd my-app
npm install

npm run dev             # web (Vite dev server)
npm run build:ios       # src/App.tsx → ios/generated/App.swift, then xcodegen + Xcode
npm run build:android   # src/App.tsx → android/.../generated/App.kt, then Gradle
```

## What gets generated

A project sharing **one canonical-primitive source** across three targets:

```
my-app/
  src/
    App.tsx                 # the ONE source (uses @pyreon/primitives)
    entry-web.tsx           # web mount entry
  index.html
  vite.config.ts
  tsconfig.json
  ios/
    project.yml             # xcodegen spec
    Sources/
      App.swift             # SwiftUI app shell
      ContentView.swift     # imports generated/App.swift
    Info.plist
    generated/              # PMTC output — `npm run build:ios` populates this
      App.swift
  android/
    settings.gradle.kts
    build.gradle.kts
    app/
      build.gradle.kts
      src/main/kotlin/.../MainActivity.kt
      src/main/kotlin/.../generated/  # PMTC output
        App.kt
  scripts/
    build-ios.sh            # invokes `pyreon-native build --target swift`
    build-android.sh        # invokes `pyreon-native build --target kotlin`
```

`src/App.tsx` uses the canonical [`@pyreon/primitives`](/docs/primitives) vocabulary (`<Stack>`, `<Text>`, `<Button>`, etc.). The web build auto-imports the DOM runtimes; the iOS and Android scripts run `pyreon-native build` to compile the same source to SwiftUI / Compose.

## What "one source" means in practice

```tsx
// src/App.tsx — runs on all three targets unchanged
import { Stack, Inline, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function App() {
  const count = signal(0)
  return (
    <Stack gap="md" padding="md">
      <Text size="lg">Count: {() => count()}</Text>
      <Inline gap="sm">
        <Button onPress={() => count.update((n) => n + 1)}>Increment</Button>
        <Button variant="secondary" onPress={() => count.set(0)}>Reset</Button>
      </Inline>
    </Stack>
  )
}
```

| Target | Render path |
|---|---|
| **Web** | Vite + `@pyreon/runtime-dom` + the real `@pyreon/primitives` web implementations. |
| **iOS** | PMTC reads `src/App.tsx`, emits `ios/generated/App.swift` with SwiftUI `VStack` / `HStack` / `Text` / `Button` primitives. Xcode builds the resulting Swift package. |
| **Android** | PMTC reads `src/App.tsx`, emits `android/.../generated/App.kt` with Compose `Column` / `Row` / `Text` / `Button`. Gradle builds the resulting Compose app. |

## Toolchain requirements

| Target | Required |
|---|---|
| Web | Bun / Node 18+ |
| iOS | macOS, Xcode 15+, xcodegen (`brew install xcodegen`) |
| Android | JDK 17, Android SDK, Gradle (handled by the wrapper) |

The web target requires no platform-specific toolchain. iOS and Android targets are opt-in — you can scaffold the project and only build the web target if you don't need native immediately.

## Status

The generator is verified at the file-tree-shape level + the shared `App.tsx` compiling through PMTC to both native targets. End-to-end device launches (Simulator / Emulator) live in the `native-device` CI workflow and require local toolchains. Phases B+ of PMTC (more primitive coverage, real-app feature parity) are in active development.

## See also

- [Multiplatform overview (PMTC)](/docs/multiplatform) — the architectural rationale.
- [`@pyreon/primitives`](/docs/primitives) — the canonical vocabulary the scaffolded app uses.
- [`@pyreon/create-zero`](/docs/create-zero) — for web-only / SSR / SSG / SPA apps without multiplatform.
