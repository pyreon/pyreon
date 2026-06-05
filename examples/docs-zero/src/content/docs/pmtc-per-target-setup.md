---
title: PMTC Per-Target Setup
---

# PMTC Per-Target Setup

> **Status:** Phase D3 of the [2026-06 native readiness audit](https://github.com/pyreon/pyreon/blob/main/.claude/audits/native-readiness-2026-06-02.md). Scout-8 scored *per-target setup docs* at **38/100** — the audit's findings: *"'Setup' story = 'use scaffolder'; zero docs on integrating into existing Xcode/Gradle, SwiftPM vs CocoaPods, etc."* This page closes that gap.

This page assumes you've followed [Multi-Platform (PMTC)](./multiplatform.md) and have a `.tsx` source compiling to Swift / Kotlin via `@pyreon/native-compiler`. The next question is: **how do you turn that emitted source into a real app on iOS / Android / web?**

Three setup paths, in order of how-much-control:

1. **Greenfield**: use `bunx create-multiplatform <name>` (the scaffolder). One command, three platforms.
2. **Integrate into an existing iOS / Android app**: bring PMTC + the runtime into a project that already builds.
3. **Bare minimum**: just compile and ship the emit; no scaffold, no Xcode/Gradle template.

---

## 1. Greenfield: `create-multiplatform`

The fastest path — produces a working 3-target scaffold from a single command. Cribs from `examples/native-todomvc-{ios,android,web}` (the canonical reference).

```bash
bunx create-multiplatform my-app
cd my-app
# Three subdirectories: ios/, android/, web/
# All three reference src/App.tsx via PMTC.
```

What you get:
- `ios/` — XcodeGen `project.yml` + App entry + the canonical iOS host shell
- `android/` — Gradle project with `assembleDebug` working out of the box
- `web/` — Vite + `@pyreon/runtime-dom` + entry-client
- `src/App.tsx` — ONE source compiled to all three targets via PMTC

Limitations of the scaffolder are documented in [`docs/docs/create-multiplatform.md`](./create-multiplatform.md). If you outgrow it, fall back to one of the integration paths below.

---

## 2. Integrate into an existing iOS app (Xcode)

### Prerequisites

- macOS 14.0+ (Sonoma), Xcode 15.0+
- Swift 5.9+ (ships with Xcode 15)
- `@pyreon/native-compiler` available via bun/npm (workspace-managed or globally installed)
- `@pyreon/native-runtime-swift` reachable as a SwiftPM dependency

### Step 1 — Add the Swift runtime as a SwiftPM dependency

`@pyreon/native-runtime-swift` is a Swift Package. From your app's Xcode project:

**Xcode UI**: File → Add Package Dependencies → enter `https://github.com/pyreon/pyreon`, branch `main`, select `PyreonRuntime` + `PyreonRouter` (depending on which you need).

**Or Package.swift** (for SPM-based apps):

```swift
dependencies: [
    .package(url: "https://github.com/pyreon/pyreon", branch: "main"),
],
targets: [
    .executableTarget(
        name: "MyApp",
        dependencies: [
            .product(name: "PyreonRuntime", package: "pyreon"),
            .product(name: "PyreonRouter", package: "pyreon"),
        ],
    ),
],
```

**CocoaPods**: not supported today. PMTC's Swift runtime ships as SwiftPM only — there's no Podspec yet, and one isn't planned for v1. Migrate the consuming app to SwiftPM, or vendor the runtime's `Sources/` directly (works but loses version-tracking).

### Step 2 — Run PMTC at build time

PMTC isn't a Swift build phase yet — it's a Bun script that emits `.swift` files. The canonical pattern (from `examples/native-counter-ios/scripts/build.sh`):

```bash
#!/bin/bash
# scripts/build.sh — emit Swift from .tsx, then let Xcode compile
set -eo pipefail
mkdir -p generated/
bun --filter='@pyreon/native-compiler' build \
    --source src/App.tsx \
    --target swift \
    --out generated/App.swift
# Xcode picks up generated/App.swift via the project's source-file
# list (add the file to your target in Xcode).
```

Add this as a **Build Phase → Run Script** before Compile Sources, so every `xcodebuild` invocation re-emits before compiling. Reference: `examples/native-counter-ios/project.yml` (XcodeGen) for the wiring.

### Step 3 — Wire the entry view + router

The compiler emits a SwiftUI `View` per top-level component. From your `App` entry:

```swift
import SwiftUI
import PyreonRuntime
import PyreonRouter

@main
struct MyApp: App {
    @State private var router = PyreonRouter(
        routes: [
            RouteRecord(path: "/") { AnyView(HomePage()) },
            RouteRecord(path: "/profile") { AnyView(ProfilePage()) },
        ],
    )

    var body: some Scene {
        WindowGroup {
            RouterProvider(router: router) {
                RouterView()
            }
        }
    }
}
```

The compiler-emitted `HomePage` / `ProfilePage` come from your `src/App.tsx`. The router config above can ALSO be PMTC-emitted if you prefer single-source — see the routing section in [`pmtc-supported-typescript.md`](./pmtc-supported-typescript.md).

### Step 4 — `init({ navigate })` (router-agnostic primitives)

If your `.tsx` uses `<Link to="/x">` from `@pyreon/primitives`, the web side needs `init({ navigate })` at app bootstrap so primitives can drive navigation without depending on the router. iOS / Android don't need this — PMTC emits the navigation call inline.

```ts
// web/src/entry-client.ts (web side only)
import { init } from '@pyreon/primitives'
import { router } from './router'
init({ navigate: (to) => router.push(to) })
```

---

## 3. Integrate into an existing Android app (Gradle)

### Prerequisites

- Android Studio Hedgehog (2023.1) or newer
- Kotlin 2.0.21+ (`kotlin-stdlib` + `kotlin-compose`)
- AGP 8.1+
- Compose 1.5+
- JDK 17+ on PATH

### Step 1 — Add the Kotlin runtime as a Gradle dependency

Today, `@pyreon/native-runtime-kotlin` is published as a workspace package (NOT yet on Maven Central). Two integration paths:

**Option A — Local Gradle module reference** (recommended during early adoption):

```kotlin
// settings.gradle.kts
include(":pyreon-runtime-kotlin")
project(":pyreon-runtime-kotlin").projectDir =
    File("../path/to/pyreon/packages/native/runtime-kotlin")
```

```kotlin
// app/build.gradle.kts
dependencies {
    implementation(project(":pyreon-runtime-kotlin"))
    implementation(project(":pyreon-router-kotlin"))  // if using router
}
```

**Option B — Vendor the source** (zero-dep but harder to update):

Copy `packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/` into your app's source tree. Lose version-tracking; gain zero-config build.

**Maven Central publishing** is planned for Phase D5. Until then, one of the two paths above is the supported way to consume the runtime in a real Android app.

### Step 2 — Run PMTC at build time

Same shape as iOS — PMTC is a Bun script. The canonical pattern (from `examples/native-todomvc-android/`):

```bash
#!/bin/bash
# scripts/build.sh
set -eo pipefail
mkdir -p app/src/main/java/com/example/generated/
bun --filter='@pyreon/native-compiler' build \
    --source src/App.tsx \
    --target kotlin \
    --out app/src/main/java/com/example/generated/App.kt
```

Wire it as a Gradle pre-build task:

```kotlin
// app/build.gradle.kts
tasks.register<Exec>("emitPyreonSource") {
    workingDir = rootDir
    commandLine("bash", "scripts/build.sh")
}
tasks.named("preBuild").configure { dependsOn("emitPyreonSource") }
```

### Step 3 — Wire the entry Composable + router

```kotlin
import androidx.compose.material.Surface
import androidx.compose.runtime.remember
import androidx.compose.runtime.Composable
import com.pyreon.router.PyreonRouter
import com.pyreon.router.RouteRecord
import com.pyreon.router.RouterProvider
import com.pyreon.router.RouterView

@Composable
fun MyApp() {
    val router = remember {
        PyreonRouter(routes = listOf(
            RouteRecord("/") { HomePage() },
            RouteRecord("/profile") { ProfilePage() },
        ))
    }
    Surface {
        RouterProvider(router) { RouterView() }
    }
}
```

`HomePage` / `ProfilePage` come from the compiler-emitted Kotlin.

---

## 4. Web side (Vite)

The web side is the standard `@pyreon/runtime-dom` setup — no PMTC emit happens at build time; the `.tsx` IS the runtime source. Two parts:

### Step 1 — Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import pyreon from '@pyreon/vite-plugin'

export default defineConfig({
    plugins: [pyreon()],
})
```

### Step 2 — Mount the same source

```ts
// web/src/entry-client.ts
import { mount } from '@pyreon/runtime-dom'
import { App } from '../../src/App'

mount(App, document.getElementById('app')!)
```

The `src/App.tsx` is the ONE file all three targets share. iOS + Android consume it via PMTC; web consumes it directly via the Vite plugin + `@pyreon/runtime-dom`.

---

## 5. Cross-target source-sharing strategies

Three patterns, in order of confidence:

| Pattern | When | Trade-off |
|---|---|---|
| Single source (`src/App.tsx`) referenced by all 3 targets | Most cases — the canonical multiplatform shape | Need to stick to [supported TS surface](./pmtc-supported-typescript.md); platform-specific bits go in escape hatches |
| Per-target entry (`src/App.tsx` + `src/web-only.ts` + `src/ios-only.swift`) | Need substantial platform-specific code | More boilerplate; clearer division |
| Three separate apps with copy-paste source | Hard requirements for divergent behavior on each platform | Loses the one-source benefit; PMTC adds nothing |

The canonical pattern is the first. Read `examples/native-todomvc-{ios,android,web}/README.md` to see how each consumes the SAME `examples/native-todomvc-ios/src/TodoApp.tsx`.

---

## 6. Escape hatches (platform-specific code)

When the supported TS surface doesn't reach (Apple Pencil gestures, Android-only intents, browser fetch headers), drop into per-platform code via explicit wrappers:

```tsx
// In .tsx — these are platform-conditional
import { NativeIOS, NativeAndroid, Web } from '@pyreon/primitives'

export function App() {
    return (
        <>
            <Stack>
                <Text>This renders on every target</Text>

                <NativeIOS>
                    {/* iOS-only SwiftUI JSX — PMTC emits this; web ignores */}
                    <Text>Hello, iOS</Text>
                </NativeIOS>

                <NativeAndroid>
                    {/* Android-only Compose JSX */}
                    <Text>Hello, Android</Text>
                </NativeAndroid>

                <Web>
                    {/* Web-only DOM JSX */}
                    <a href="https://example.com">Web-only link</a>
                </Web>
            </Stack>
        </>
    )
}
```

The escape hatches are documented in [multiplatform.md → Layer 4](./multiplatform.md#layer-4-platform-escape-hatches).

---

## 7. Verification

After integration, verify each target compiles + runs:

**iOS**:
```bash
cd ios/
bash scripts/build.sh       # emit Swift
xcodebuild -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15'
```

**Android**:
```bash
cd android/
bash scripts/build.sh       # emit Kotlin
./gradlew assembleDebug
```

**Web**:
```bash
cd web/
bun install
bun run dev                 # starts vite dev server
```

If any of the three fail with errors about un-emitted shapes, check [`pmtc-supported-typescript.md`](./pmtc-supported-typescript.md) — the catalogue lists every silent-drop pattern and how to refactor around it.

---

## Cross-references

- [Multi-Platform (PMTC)](./multiplatform.md) — the architectural overview
- [PMTC Supported TypeScript](./pmtc-supported-typescript.md) — what shapes compile
- [`docs/create-multiplatform.md`](./create-multiplatform.md) — the scaffolder
- [`examples/native-counter-ios/`](https://github.com/pyreon/pyreon/tree/main/examples/native-counter-ios) — minimal iOS reference
- [`examples/native-todomvc-{ios,android,web}/`](https://github.com/pyreon/pyreon/tree/main/examples) — full one-source 3-target reference
- [`.claude/audits/native-readiness-2026-06-02.md`](https://github.com/pyreon/pyreon/blob/main/.claude/audits/native-readiness-2026-06-02.md) — the audit that drove this doc
