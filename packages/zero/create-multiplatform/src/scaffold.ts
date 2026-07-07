// Scaffold generator for `create-multiplatform` — turns one project name
// into a complete web + iOS + Android project sharing ONE `src/App.tsx`.
//
// Pure function: `buildScaffold(opts) → FileSpec[]`. No filesystem access
// here (the CLI half writes the files) — so the generator is unit-testable
// in isolation, and the generated shared `App.tsx` can be fed straight
// through PMTC's `transform()` to prove it compiles to SwiftUI + Compose.
//
// Templates mirror the proven `examples/native-todomvc-{web,ios,android}`
// shells (same XcodeGen / Gradle / Vite shapes), parameterized by name. The
// per-platform PROJECT configs (project.yml, Gradle, Info.plist, Vite) are
// copied from those maintained shells; what this package verifies itself is
// the GENERATOR output structure + that the shared source is real
// PMTC-compilable canonical-primitive code. Full device builds are the
// `native-device` CI gate's job (a separate, infra-gated arc).

/** A single file the scaffold emits, relative to the project root. */
export interface FileSpec {
  /** POSIX-style relative path, e.g. `ios/Sources/App.swift`. */
  path: string
  /** Full file contents. */
  content: string
}

export interface ScaffoldOptions {
  /** Project name — kebab-case recommended (`my-app`). Drives the Swift
   *  `@main` struct, the Gradle `rootProject.name`, the bundle id, and the
   *  web `<title>`. */
  name: string
}

/** `my-app` → `MyApp` (PascalCase; used for the Swift struct + display name). */
export function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

/** `My-App` → `myapp` (lowercased, separators stripped) — a valid Android
 *  package segment + bundle-id leaf. */
export function toIdentifierLeaf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Build the full file tree for a new multiplatform project. Returns the
 * files in a stable order; the CLT writes each one under the target dir.
 */
export function buildScaffold(opts: ScaffoldOptions): FileSpec[] {
  const name = opts.name.trim()
  if (name.length === 0) throw new Error('[create-multiplatform] project name is required')
  const pascal = toPascalCase(name)
  const leaf = toIdentifierLeaf(name)
  const androidPkg = `com.example.${leaf}`
  const androidPkgPath = androidPkg.replace(/\./g, '/')
  const bundleId = `com.example.${pascal}`

  const files: FileSpec[] = []
  const add = (path: string, content: string) => files.push({ path, content })

  // ── Shared source — the ONE file all three targets render ────────────────
  add(
    'src/App.tsx',
    `// The single source for web, iOS, and Android. Uses the canonical
// @pyreon/primitives vocabulary — the web build auto-imports the DOM
// runtimes; PMTC compiles the same tags to SwiftUI (iOS) + Compose
// (Android) via its canonical-primitives table.

import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'

export function App() {
  const count = signal(0)
  return (
    <Stack gap="md" align="center">
      <Text>{count}</Text>
      <Button onPress={() => count.set(count() + 1)}>Increment</Button>
    </Stack>
  )
}
`,
  )

  // ── Web target ───────────────────────────────────────────────────────────
  add(
    'package.json',
    `${JSON.stringify(
      {
        name,
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
          'build:ios': 'bash scripts/build-ios.sh',
          'build:android': 'bash scripts/build-android.sh',
        },
        dependencies: {
          '@pyreon/core': 'latest',
          '@pyreon/primitives': 'latest',
          '@pyreon/reactivity': 'latest',
          '@pyreon/runtime-dom': 'latest',
        },
        devDependencies: {
          '@pyreon/vite-plugin': 'latest',
          '@pyreon/native-cli': 'latest',
          // Native runtimes — installed into node_modules so the iOS
          // SPM project (project.yml `packages:`) and the Android Gradle
          // source-sets reference them by node_modules path. The emitted
          // Swift `import PyreonRuntime`/`PyreonRouter` + Kotlin
          // `PyreonReactivity`/`PyreonFetch`/… resolve against these.
          '@pyreon/native-runtime-swift': 'latest',
          '@pyreon/native-router-swift': 'latest',
          '@pyreon/native-runtime-kotlin': 'latest',
          '@pyreon/native-router-kotlin': 'latest',
          typescript: '^6.0.0',
          vite: '^8.0.0',
        },
      },
      null,
      2,
    )}\n`,
  )
  add(
    'index.html',
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${pascal} — Web</title>
  </head>
  <body>
    <div id="app" data-testid="app-root"></div>
    <script type="module" src="/src/entry-web.tsx"></script>
  </body>
</html>
`,
  )
  add(
    'vite.config.ts',
    `import pyreon from '@pyreon/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [pyreon()],
})
`,
  )
  add(
    'src/entry-web.tsx',
    `// Web entry — boots the shared App into #app via @pyreon/runtime-dom.
import { mount } from '@pyreon/runtime-dom'
import { App } from './App'

const root = document.getElementById('app')
if (root === null) throw new Error('#app element missing from index.html')
mount(App, root)
`,
  )
  add(
    'tsconfig.json',
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'preserve',
          jsxImportSource: '@pyreon/core',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['src', 'vite.config.ts'],
      },
      null,
      2,
    )}\n`,
  )

  // ── iOS target (XcodeGen) ─────────────────────────────────────────────────
  add(
    'ios/project.yml',
    `# XcodeGen project spec. Run \`xcodegen generate\` here, then open the
# generated .xcodeproj. The preBuildScript compiles src/App.tsx → Swift
# before each Xcode build (idempotent).

name: ${pascal}

options:
  bundleIdPrefix: com.example
  deploymentTarget:
    iOS: '17.0'

# Pyreon native runtimes as local SPM packages — they ship their Swift
# sources via npm, so after \`npm install\` they live under node_modules
# and XcodeGen consumes them by path. This spec lives in ios/, so the
# paths are relative to ios/ (node_modules is one level up at the project
# root). The emitted generated/App.swift's \`import PyreonRuntime\` /
# \`import PyreonRouter\` resolve against these.
packages:
  PyreonRuntime:
    path: ../node_modules/@pyreon/native-runtime-swift
  PyreonRouter:
    path: ../node_modules/@pyreon/native-router-swift

preBuildScripts:
  # SRCROOT is the .xcodeproj dir (ios/); scripts/ lives at the project
  # root, one level up.
  - script: |
      bash "\${SRCROOT}/../scripts/build-ios.sh"
    name: '[Pyreon] Compile src/App.tsx → generated/App.swift'
    runOnlyWhenInstalling: false
    basedOnDependencyAnalysis: false

targets:
  ${pascal}:
    type: application
    platform: iOS
    deploymentTarget: '17.0'
    dependencies:
      - package: PyreonRuntime
      - package: PyreonRouter
    sources:
      - path: Sources
        type: group
      - path: generated
        type: group
        optional: true
      # WebView viz bundle (\`web/\` → \`pyreon-native stage-web\`). A
      # \`type: group\` flattens the staged html/js/css into the app
      # bundle's resource root, so PyreonWebView's
      # \`Bundle.main.url(forResource:)\` resolves \`<WebView src="…">\`.
      - path: WebContent
        type: group
        optional: true
    info:
      path: Info.plist
      properties:
        CFBundleShortVersionString: 0.0.1
        CFBundleVersion: '1'
        LSRequiresIPhoneOS: true
        UILaunchScreen: {}
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: ${bundleId}
        SWIFT_VERSION: '5.0'
        CODE_SIGN_STYLE: Automatic
`,
  )
  add(
    // NOT "App.swift" — the emitted component file is generated/App.swift
    // (src/App.tsx → App.swift); two files named App.swift in one target
    // is a Swift compile error ("filename used twice").
    'ios/Sources/Main.swift',
    `// @main entry point. SwiftUI App protocol — the canonical iOS entrypoint.
import SwiftUI

// \`SwiftUI.App\` (fully qualified) — the emitted component from
// src/App.tsx is \`struct App: View\`, which shadows the bare \`App\`
// protocol name in this module; without the qualifier this conformance
// would resolve to that struct (a non-protocol type) and fail.
@main
struct ${pascal}App: SwiftUI.App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`,
  )
  add(
    'ios/Sources/ContentView.swift',
    `// Root view — mounts the Pyreon-emitted App() from generated/App.swift
// (produced by scripts/build-ios.sh running \`pyreon-native build\`).
import SwiftUI

struct ContentView: View {
    var body: some View {
        App()
    }
}
`,
  )
  add(
    'ios/Info.plist',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.0.1</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
    </array>
</dict>
</plist>
`,
  )
  add(
    'scripts/build-ios.sh',
    `#!/usr/bin/env bash
# Compile src/App.tsx → ios/generated/App.swift via pyreon-native.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
mkdir -p "\${PROJECT_DIR}/ios/generated"
npx pyreon-native build --target=ios --source="\${PROJECT_DIR}/src" --out="\${PROJECT_DIR}/ios/generated"
# Asset pipeline: shared assets/ → Assets.xcassets (skipped when empty).
if [[ -d "\${PROJECT_DIR}/assets" ]]; then
  npx pyreon-native assets --target=ios --source="\${PROJECT_DIR}/assets" --out="\${PROJECT_DIR}/ios"
fi
# WebView viz bundle: shared web/ → ios/WebContent (skipped when empty).
if [[ -d "\${PROJECT_DIR}/web" ]]; then
  npx pyreon-native stage-web --target=ios --source="\${PROJECT_DIR}/web" --out="\${PROJECT_DIR}/ios"
fi
`,
  )

  // ── Android target (Gradle) ───────────────────────────────────────────────
  add(
    'android/settings.gradle.kts',
    `pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "${pascal}"
include(":app")
`,
  )
  add(
    'android/build.gradle.kts',
    `plugins {
    id("com.android.application") version "8.7.0" apply false
    kotlin("android") version "2.0.21" apply false
    // The Pyreon Kotlin runtime sources use @Serializable (useFetch /
    // loader payloads); the app module applies this plugin, so its
    // version must be declared (apply false) at the root or Gradle can't
    // resolve "org.jetbrains.kotlin.plugin.serialization".
    kotlin("plugin.serialization") version "2.0.21" apply false
}
`,
  )
  add(
    'android/gradle.properties',
    `org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
`,
  )
  add(
    'android/app/build.gradle.kts',
    `plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("plugin.serialization")
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21"
}

android {
    namespace = "${androidPkg}"
    compileSdk = 35
    defaultConfig {
        applicationId = "${bundleId}"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.0.1"
    }
    buildFeatures { compose = true }
    // Production release build: R8 minify + shrink (the Play Store path).
    // The Pyreon Kotlin runtime uses kotlinx-serialization (useFetch /
    // loader payloads), which ships its OWN R8 keep rules
    // (META-INF/.../kotlinx-serialization-r8.pro, auto-applied), so the
    // framework's @Serializable types survive minification with no manual
    // rules — verified by a real \`gradle assembleRelease\` of a useFetch
    // app. Add app-specific keep rules to proguard-rules.pro.
    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // The Pyreon Kotlin runtimes ship source-only via npm (no AAR), so
    // add the installed packages' src/main/kotlin as extra source roots.
    // After npm install they live under node_modules, two levels up from
    // android/app/. The emitted Kotlin's PyreonReactivity / PyreonRouter /
    // PyreonFetch / useNavigate compile from these sources.
    sourceSets {
        getByName("main") {
            kotlin {
                srcDir("../../node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin")
                srcDir("../../node_modules/@pyreon/native-router-kotlin/src/main/kotlin")
            }
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material")
    implementation("androidx.compose.runtime:runtime-saveable")
    // Required by the Pyreon Kotlin runtime sources (srcDir above):
    // useFetch/loader need kotlinx-serialization + coroutines; storage needs core-ktx.
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.core:core-ktx:1.13.1")
    // <Icon> emit references Icons.Filled.* at compile time (core set).
    implementation("androidx.compose.material:material-icons-core")
    // Remote <Image src="http…"> → Coil's AsyncImage.
    implementation("io.coil-kt:coil-compose:2.7.0")
}

// Re-run the .tsx → .kt compile on every build (mirrors iOS preBuildScript).
tasks.register<Exec>("pyreonCompile") {
    workingDir = projectDir.parentFile.parentFile
    commandLine("bash", "scripts/build-android.sh")
}
tasks.named("preBuild") { dependsOn("pyreonCompile") }
`,
  )
  add(
    'android/app/proguard-rules.pro',
    `# R8 / ProGuard rules for the release build.
#
# The Pyreon Kotlin runtime needs NO manual rules — its only
# reflection-sensitive dependency is kotlinx-serialization (useFetch /
# loader payloads), which ships its own keep rules
# (META-INF/com.android.tools/r8/kotlinx-serialization-r8.pro) that R8
# applies automatically. A real \`./gradlew assembleRelease\` with
# minify enabled builds clean against the runtime out of the box.
#
# Add keep rules for YOUR app's own reflection / serialization here, e.g.:
#   -keep class com.example.${leaf}.model.** { *; }
`,
  )
  add(
    'android/app/src/main/AndroidManifest.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Required the moment the shared source uses useFetch — without
         it, socket creation fails with the opaque
         \`SocketException: socket failed: EPERM\` (a real device-CI
         finding). Harmless for apps that never touch the network. -->
    <uses-permission android:name="android.permission.INTERNET" />
    <application
        android:label="${pascal}"
        android:allowBackup="true">
        <activity
            android:name="${androidPkg}.MainActivity"
            android:exported="true"
            android:theme="@android:style/Theme.Material.Light.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
  )
  add(
    `android/app/src/main/kotlin/${androidPkgPath}/MainActivity.kt`,
    `// Root activity — mounts the Pyreon-emitted App() from generated/App.kt.
package ${androidPkg}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import ${androidPkg}.generated.App

// ComponentActivity (NOT plain android.app.Activity) — Compose's
// setContent {} is an extension on ComponentActivity; a plain Activity
// fails to resolve it (receiver type mismatch).
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            App()
        }
    }
}
`,
  )
  add(
    'scripts/build-android.sh',
    `#!/usr/bin/env bash
# Compile src/App.tsx → android/app/src/main/kotlin/${androidPkgPath}/generated/App.kt
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "\${SCRIPT_DIR}/.." && pwd)"
OUT="\${PROJECT_DIR}/android/app/src/main/kotlin/${androidPkgPath}/generated"
mkdir -p "\${OUT}"
# --kotlin-package stamps the generated .kt with the FQN MainActivity
# imports (\`${androidPkg}.generated.App\`); without it the emit lands in
# Kotlin's anonymous root package and the import fails to resolve.
npx pyreon-native build --target=android --source="\${PROJECT_DIR}/src" --out="\${OUT}" --kotlin-package=${androidPkg}.generated
# Asset pipeline: shared assets/ → res/drawable-* (skipped when empty).
if [[ -d "\${PROJECT_DIR}/assets" ]]; then
  npx pyreon-native assets --target=android --source="\${PROJECT_DIR}/assets" --out="\${PROJECT_DIR}/android/app/src/main"
fi
# WebView viz bundle: shared web/ → android assets/ (skipped when empty).
if [[ -d "\${PROJECT_DIR}/web" ]]; then
  npx pyreon-native stage-web --target=android --source="\${PROJECT_DIR}/web" --out="\${PROJECT_DIR}/android/app/src/main"
fi
`,
  )

  // ── README ────────────────────────────────────────────────────────────────
  add(
    'README.md',
    `# ${pascal}

A multiplatform Pyreon app — one \`src/App.tsx\` source rendered on **web**,
**iOS** (SwiftUI), and **Android** (Jetpack Compose).

## Web

\`\`\`bash
npm install
npm run dev        # vite dev server
\`\`\`

## iOS (requires Xcode + xcodegen)

\`\`\`bash
npm run build:ios  # src/App.tsx → ios/generated/App.swift
cd ios && xcodegen generate && open ${pascal}.xcodeproj
\`\`\`

## Android (requires the Android SDK + Gradle)

\`\`\`bash
npm run build:android   # src/App.tsx → android/.../generated/App.kt
cd android && ./gradlew assembleDebug
\`\`\`

Edit \`src/App.tsx\` — every target re-compiles from that single file.
`,
  )

  return files
}
