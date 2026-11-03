---
title: PMTC Per-Target Setup
---

# PMTC Per-Target Setup

This page assumes you've followed [Multi-Platform (PMTC)](./multiplatform.md) and have a `.tsx` source compiling to Swift / Kotlin via `@pyreon/native-compiler`. The next question is: **how do you turn that emitted source into a real app on iOS / Android / web?**

Three setup paths, in order of how-much-control:

1. **Greenfield**: use `npm create @pyreon/multiplatform@latest <name>` (the scaffolder). One command, three platforms.
2. **Integrate into an existing iOS / Android app**: bring PMTC + the runtime into a project that already builds.
3. **Bare minimum**: just compile and ship the emit; no scaffold, no Xcode/Gradle template.

---

## 1. Greenfield: `create-multiplatform`

The fastest path — produces a working 3-target project from a single command.

```bash
npm create @pyreon/multiplatform@latest my-app
# or: npx @pyreon/create-multiplatform my-app
cd my-app
npm install
```

What you get:
- `src/App.tsx` — ONE source compiled to all three targets via PMTC
- Web at the project root — `index.html`, `vite.config.ts`, `src/entry-web.tsx`
- `ios/` — XcodeGen `project.yml` (with a pre-build phase that runs `scripts/build-ios.sh`), the SwiftUI app shell, `Info.plist`
- `android/` — Gradle Kotlin-DSL project (`settings.gradle.kts`, `app/build.gradle.kts`, `MainActivity.kt`). No Gradle wrapper is generated; `gradle` must be on `PATH`.
- `scripts/build-ios.sh` / `scripts/build-android.sh` — the `pyreon-native wire` + `pyreon-native build` calls described below

The scaffold pins the Android Gradle plugin, Kotlin, Compose and SDK levels it is tested with in its generated build files, and the iOS deployment target in `project.yml`. The full file list is in [create-multiplatform](./create-multiplatform.md). If you outgrow it, fall back to one of the integration paths below.

---

## 2. Integrate into an existing iOS app (Xcode)

### Prerequisites

- macOS 14.0+ (Sonoma), Xcode 15.0+
- Swift 5.9+ (ships with Xcode 15)
- iOS 17 deployment target (the runtime's `Package.swift` declares `.iOS(.v17)` / `.macOS(.v14)`; it uses SwiftUI's `@Observable`)
- `@pyreon/native-cli`, `@pyreon/native-runtime-swift` and `@pyreon/native-router-swift` installed from npm in the JavaScript project that holds your `.tsx` source

### Step 1 — Link the Swift runtime as a local SwiftPM package

`@pyreon/native-runtime-swift` and `@pyreon/native-router-swift` are published to npm as Swift **source** (each ships a `Package.swift`). There is no SwiftPM package at the repository root, so a git URL dependency cannot resolve them; Xcode consumes them from `node_modules` as **local packages**.

Because the `node_modules` layout depends on hoisting and the package manager, let `pyreon-native wire` resolve it. It links the runtimes into `ios/PyreonPackages/` and stages any co-located feature Swift into `ios/PyreonNative/`:

```bash
npx pyreon-native wire --app=. --ios-out=ios
```

Reference the links by their fixed paths. With XcodeGen:

```yaml
# ios/project.yml
packages:
  PyreonRuntime:
    path: PyreonPackages/native-runtime-swift
  PyreonRouter:
    path: PyreonPackages/native-router-swift
targets:
  MyApp:
    dependencies:
      - package: PyreonRuntime
      - package: PyreonRouter
    sources:
      - path: Sources
      - path: generated
      - path: PyreonNative
        optional: true
```

In the Xcode UI the equivalent is File → Add Package Dependencies → Add Local… → `ios/PyreonPackages/native-runtime-swift` (and `native-router-swift`). Add both `PyreonPackages/` and `PyreonNative/` to `.gitignore`; they are derived from `node_modules`. See [Native Packages → iOS](./native-packages.md#ios-resolved-symlinks-staged-sources) for the details.

**CocoaPods**: not supported. The Swift runtime ships as SwiftPM only.

### Step 2 — Run PMTC at build time

PMTC is a Node CLI that emits `.swift` files. Run it (and `wire`) from a script before Xcode compiles:

```bash
#!/usr/bin/env bash
# scripts/build-ios.sh — emit Swift from src/, then let Xcode compile
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${PROJECT_DIR}/ios/generated"
npx pyreon-native wire --app="${PROJECT_DIR}" --ios-out="${PROJECT_DIR}/ios"
npx pyreon-native build --target=ios --source="${PROJECT_DIR}/src" --out="${PROJECT_DIR}/ios/generated"
```

Pass `--app` explicitly: Xcode runs build phases with the working directory set to `ios/`, which has no `package.json`. Add the script as a **Build Phase → Run Script** before Compile Sources (with XcodeGen, a `preBuildScripts` entry), so every build re-emits before compiling. A `.tsx` that imports `@pyreon/runtime-dom` (a web entry) is skipped, not compiled.

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
            RouteRecord(path: "/", component: { AnyView(HomePage()) }),
            RouteRecord(path: "/profile", component: { AnyView(ProfilePage()) }),
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

- JDK 17 on `PATH`, the Android SDK, and Gradle (the scaffold's scripts call `gradle` directly)
- Kotlin with the Compose compiler plugin, and Jetpack Compose. Use the Android Gradle plugin, Kotlin and Compose BOM versions the scaffold pins in its generated `build.gradle.kts` files — those are the tested combination.
- `@pyreon/native-cli`, `@pyreon/native-runtime-kotlin` and `@pyreon/native-router-kotlin` installed from npm in the JavaScript project that holds your `.tsx` source

### Step 1 — Add the Kotlin runtime as source directories

`@pyreon/native-runtime-kotlin` and `@pyreon/native-router-kotlin` are published to npm as Kotlin **source** (no `build.gradle.kts`, no AAR), so they are not Gradle modules and are not on Maven Central. Your app module compiles them as extra `srcDir`s.

`pyreon-native wire` resolves the source roots (the base runtime, the router, and every co-located feature `native/kotlin/` directory your dependencies contribute, in dependency order) and writes them to a file:

```bash
npx pyreon-native wire --app=. --android-out=android/app/pyreon-native.srcdirs
```

`app/build.gradle.kts` reads that list at configure time:

```kotlin
android {
    sourceSets {
        getByName("main") {
            kotlin {
                val resolved = file("pyreon-native.srcdirs")
                    .takeIf { it.exists() }
                    ?.readLines()
                    ?.filter { it.isNotEmpty() && !it.startsWith("#") }
                    ?: emptyList()
                resolved.forEach { srcDir(it) }
            }
        }
    }
}
```

The runtimes also need their own library dependencies on the app module (Compose, kotlinx-serialization, OkHttp, and the media/imaging artifacts for the primitives you use). Copy the `dependencies { }` block from a scaffolded project's `app/build.gradle.kts` rather than assembling it by hand. See [Native Packages → Android](./native-packages.md#android-a-generated-srcdir-list) for the details.

### Step 2 — Run PMTC at build time

Emit Kotlin into your source tree, stamping the package your code imports it from:

```bash
#!/usr/bin/env bash
# scripts/build-android.sh
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${PROJECT_DIR}/android/app/src/main/kotlin/com/example/myapp/generated"
mkdir -p "${OUT}"
npx pyreon-native build --target=android --source="${PROJECT_DIR}/src" --out="${OUT}" --kotlin-package=com.example.myapp.generated
npx pyreon-native wire --app="${PROJECT_DIR}" --android-out="${PROJECT_DIR}/android/app/pyreon-native.srcdirs"
```

Without `--kotlin-package` the emit lands in Kotlin's root package and an import such as `com.example.myapp.generated.App` does not resolve. Run the script before Gradle configures the project — the scaffold runs it from `npm run build:android` — so the `srcdirs` file exists at configure time.

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

### Step 4 — Manifest entries for packages that need them

Most packages need nothing in `AndroidManifest.xml`. The runtime ships as Kotlin **sources** wired into your module rather than an AAR, so there is no library manifest to merge — a package whose native half needs an activity asks you to declare it:

| Package | What to declare |
| --- | --- |
| `@pyreon/auth` (`useOidc`) | `PyreonAuthActivity` and an exported `PyreonAuthRedirectActivity` with an intent filter for your `nativeRedirectUri` scheme — see [Auth → Per-platform setup](/docs/auth#per-platform-setup). iOS needs nothing. |

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

```tsx
// src/entry-web.tsx
import { mount } from '@pyreon/runtime-dom'
import { App } from './App'

mount(<App />, document.getElementById('app')!)
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
bash scripts/build-ios.sh   # wire + emit Swift
cd ios && xcodegen generate
xcodebuild -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15'
```

**Android**:
```bash
bash scripts/build-android.sh   # emit Kotlin + wire
cd android && gradle assembleDebug
```

**Web**:
```bash
npm install
npm run dev                 # starts the Vite dev server
```

For a quick check that does not touch Xcode or Gradle, `npx pyreon-native check --source=src` runs the compiler for both targets in memory and reports what does not lower.

If any of the three fail with errors about un-emitted shapes, check [`pmtc-supported-typescript.md`](./pmtc-supported-typescript.md) — the catalogue lists every silent-drop pattern and how to refactor around it.

---

## Cross-references

- [Multi-Platform (PMTC)](./multiplatform.md) — the architectural overview
- [PMTC Supported TypeScript](./pmtc-supported-typescript.md) — what shapes compile
- [`docs/create-multiplatform.md`](./create-multiplatform.md) — the scaffolder
- [`examples/native-counter-ios/`](https://github.com/pyreon/pyreon/tree/main/examples/native-counter-ios) — minimal iOS reference
- [`examples/native-todomvc-{ios,android,web}/`](https://github.com/pyreon/pyreon/tree/main/examples) — full one-source 3-target reference
