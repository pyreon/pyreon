// Tests for the create-multiplatform scaffold generator.
//
// The load-bearing assertions: (1) the generated file tree has every file a
// 3-target project needs, parameterized correctly by name; (2) the generated
// shared `src/App.tsx` is REAL PMTC-compilable canonical-primitive code —
// fed straight through `@pyreon/native-compiler`'s `transform()`, it must
// produce valid SwiftUI + Compose. That second check is what proves the
// scaffold isn't shipping placeholder source that wouldn't actually compile
// on native.

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { transform } from '@pyreon/native-compiler'
import { describe, expect, it } from 'vitest'
import { parseArgs, writeScaffold } from '../index'
import { buildScaffold, toIdentifierLeaf, toPascalCase } from '../scaffold'

describe('name transforms', () => {
  it('toPascalCase', () => {
    expect(toPascalCase('my-app')).toBe('MyApp')
    expect(toPascalCase('todo_list app')).toBe('TodoListApp')
    expect(toPascalCase('app')).toBe('App')
  })
  it('toIdentifierLeaf strips separators + lowercases', () => {
    expect(toIdentifierLeaf('My-App')).toBe('myapp')
    expect(toIdentifierLeaf('Todo List 2')).toBe('todolist2')
  })
})

describe('buildScaffold — file tree', () => {
  const files = buildScaffold({ name: 'my-app' })
  const paths = files.map((f) => f.path)
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? ''

  it('emits the shared source + all three target trees', () => {
    for (const p of [
      'src/App.tsx',
      'package.json',
      'index.html',
      'vite.config.ts',
      'src/entry-web.tsx',
      'tsconfig.json',
      'ios/project.yml',
      'ios/Sources/Main.swift',
      'ios/Sources/ContentView.swift',
      'ios/Info.plist',
      'scripts/build-ios.sh',
      'android/settings.gradle.kts',
      'android/build.gradle.kts',
      'android/app/build.gradle.kts',
      'android/app/src/main/AndroidManifest.xml',
      'scripts/build-android.sh',
      'README.md',
    ]) {
      expect(paths, `missing ${p}`).toContain(p)
    }
  })

  it('parameterizes the name across targets', () => {
    // Swift @main struct (in Main.swift, NOT App.swift — that name
    // collides with the emitted generated/App.swift) + iOS project name.
    expect(get('ios/Sources/Main.swift')).toContain('struct MyAppApp: SwiftUI.App')
    expect(get('ios/project.yml')).toContain('name: MyApp')
    expect(get('ios/project.yml')).toContain('PRODUCT_BUNDLE_IDENTIFIER: com.example.MyApp')
    // Gradle root project + Android package.
    expect(get('android/settings.gradle.kts')).toContain('rootProject.name = "MyApp"')
    expect(get('android/app/build.gradle.kts')).toContain('namespace = "com.example.myapp"')
    // Android package path → MainActivity location + package decl.
    expect(paths).toContain('android/app/src/main/kotlin/com/example/myapp/MainActivity.kt')
    expect(get('android/app/src/main/kotlin/com/example/myapp/MainActivity.kt')).toContain(
      'package com.example.myapp',
    )
    // package.json name + web title.
    expect(get('package.json')).toContain('"name": "my-app"')
    expect(get('index.html')).toContain('<title>MyApp — Web</title>')
  })

  it('all three hosts render the same App() component', () => {
    expect(get('ios/Sources/ContentView.swift')).toContain('App()')
    expect(get('android/app/src/main/kotlin/com/example/myapp/MainActivity.kt')).toContain('App()')
    expect(get('src/entry-web.tsx')).toContain('mount(App, root)')
  })

  it('wires WebView viz-bundle staging (web/ → app resources on both native targets)', () => {
    // iOS: WebContent must be an included group so staged html/js/css
    // flatten to the bundle-resource root PyreonWebView resolves against.
    const projectYml = get('ios/project.yml')
    expect(projectYml).toContain('path: WebContent')
    // Both build scripts invoke stage-web, gated on a `web/` dir so it's
    // a no-op when the app ships no viz bundle.
    const buildIos = get('scripts/build-ios.sh')
    expect(buildIos).toContain('pyreon-native stage-web --target=ios')
    expect(buildIos).toContain('${PROJECT_DIR}/web')
    const buildAndroid = get('scripts/build-android.sh')
    expect(buildAndroid).toContain('pyreon-native stage-web --target=android')
    // Android stages into app/src/main → assets/ (file:///android_asset/).
    expect(buildAndroid).toContain('${PROJECT_DIR}/android/app/src/main')
  })

  it('rejects an empty name', () => {
    expect(() => buildScaffold({ name: '   ' })).toThrow()
  })
})

// Native runtime delivery wiring — every assertion here corresponds to a
// real scaffold bug a local end-to-end build (Android emulator + iOS
// Simulator) surfaced that compile-only validation never caught. Without
// the wiring, a scaffolded native app cannot build/launch.
describe('buildScaffold — native runtime delivery wiring (local-proof-found fixes)', () => {
  const files = buildScaffold({ name: 'my-app' })
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? ''

  it('package.json depends on the native runtimes + the CLI', () => {
    const pkg = get('package.json')
    for (const dep of [
      '@pyreon/native-cli',
      '@pyreon/native-runtime-swift',
      '@pyreon/native-router-swift',
      '@pyreon/native-runtime-kotlin',
      '@pyreon/native-router-kotlin',
    ]) {
      expect(pkg, `package.json missing devDependency ${dep}`).toContain(`"${dep}"`)
    }
  })

  it('iOS project.yml wires the SPM runtimes + paths relative to ios/', () => {
    const yml = get('ios/project.yml')
    // SPM package paths: node_modules is at the project ROOT, project.yml
    // is in ios/, so the path must be ../node_modules (bug #5).
    expect(yml).toContain('path: ../node_modules/@pyreon/native-runtime-swift')
    expect(yml).toContain('path: ../node_modules/@pyreon/native-router-swift')
    // Target depends on both SPM packages.
    expect(yml).toContain('package: PyreonRuntime')
    expect(yml).toContain('package: PyreonRouter')
    // Source + Info paths relative to ios/ — NOT ios/Sources (bug #6).
    expect(yml).toContain('- path: Sources')
    expect(yml).toContain('- path: generated')
    expect(yml).toContain('path: Info.plist')
    expect(yml).not.toContain('path: ios/Sources')
    expect(yml).not.toContain('path: node_modules/@pyreon') // un-prefixed = wrong
    // preBuildScript reaches the root-level scripts/ from SRCROOT (ios/).
    expect(yml).toContain('bash "${SRCROOT}/../scripts/build-ios.sh"')
  })

  it('iOS @main lives in Main.swift, qualifies SwiftUI.App (no App.swift collision/shadow)', () => {
    // bug #7: two files named App.swift in one target is a Swift error.
    expect(files.map((f) => f.path)).not.toContain('ios/Sources/App.swift')
    const main = get('ios/Sources/Main.swift')
    // bug #8: the emitted `struct App: View` shadows the bare App protocol.
    expect(main).toContain('struct MyAppApp: SwiftUI.App')
  })

  it('Android root build.gradle.kts declares the serialization plugin version', () => {
    // bug #3: the app module applies kotlin("plugin.serialization"); its
    // version must be declared (apply false) at the root.
    expect(get('android/build.gradle.kts')).toContain(
      'kotlin("plugin.serialization") version',
    )
  })

  it('Android app build.gradle.kts wires the Kotlin runtime srcDirs + deps', () => {
    const g = get('android/app/build.gradle.kts')
    expect(g).toContain('kotlin("plugin.serialization")')
    expect(g).toContain(
      'srcDir("../../node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin")',
    )
    expect(g).toContain(
      'srcDir("../../node_modules/@pyreon/native-router-kotlin/src/main/kotlin")',
    )
    // Runtime-source deps (useFetch/loader @Serializable + coroutines).
    expect(g).toContain('kotlinx-serialization-json')
    expect(g).toContain('kotlinx-coroutines-android')
  })

  it('MainActivity extends ComponentActivity (Compose setContent receiver)', () => {
    // bug #4: setContent {} is an extension on ComponentActivity, not the
    // plain android.app.Activity the scaffold previously used.
    const act = get('android/app/src/main/kotlin/com/example/myapp/MainActivity.kt')
    expect(act).toContain('import androidx.activity.ComponentActivity')
    expect(act).toContain('class MainActivity : ComponentActivity()')
    expect(act).not.toContain('import android.app.Activity')
  })

  it('build-android.sh stamps the FQN package the MainActivity import needs', () => {
    // bug #2: without --kotlin-package the emit lands in the anonymous
    // root package and MainActivity's `import …generated.App` fails.
    expect(get('scripts/build-android.sh')).toContain(
      '--kotlin-package=com.example.myapp.generated',
    )
  })

  it('ships a production release buildType (R8 minify) + a proguard-rules.pro', () => {
    // Production Play Store builds need a minified release. The scaffold's
    // Android project was debug-only; a `./gradlew assembleRelease` with
    // R8 was verified to build clean against the Pyreon runtime
    // (kotlinx-serialization ships its own keep rules), so the release
    // buildType ships enabled out of the box.
    const g = get('android/app/build.gradle.kts')
    expect(g).toContain('buildTypes {')
    expect(g).toContain('isMinifyEnabled = true')
    expect(g).toContain('getDefaultProguardFile("proguard-android-optimize.txt")')
    expect(g).toContain('"proguard-rules.pro"')
    // The placeholder proguard file ships (app-specific keep rules go here;
    // the framework needs none).
    const pg = get('android/app/proguard-rules.pro')
    expect(pg).toContain('kotlinx-serialization')
    expect(pg).toContain('NO manual rules')
  })
})

describe('buildScaffold — the shared App.tsx is real PMTC-compilable source', () => {
  const src = buildScaffold({ name: 'my-app' }).find((f) => f.path === 'src/App.tsx')!.content

  it('compiles to valid SwiftUI', () => {
    const out = transform(src, { target: 'swift' }).code
    expect(out).toContain('struct App: View')
    expect(out).toContain('VStack')
    expect(out).toContain('Button')
  })

  it('compiles to valid Jetpack Compose', () => {
    const out = transform(src, { target: 'kotlin' }).code
    expect(out).toContain('fun App()')
    expect(out).toContain('Column')
    expect(out).toContain('Button')
  })
})

describe('parseArgs', () => {
  it('reads the name positionally; dir defaults to name', () => {
    expect(parseArgs(['my-app'])).toEqual({ name: 'my-app', dir: 'my-app' })
  })
  it('honors --dir / -d', () => {
    expect(parseArgs(['my-app', '--dir', './apps/x'])).toEqual({ name: 'my-app', dir: './apps/x' })
    expect(parseArgs(['my-app', '-d', 'out'])).toEqual({ name: 'my-app', dir: 'out' })
  })
  it('throws with usage when no name', () => {
    expect(() => parseArgs([])).toThrow(/Usage/)
    expect(() => parseArgs(['--dir', 'x'])).toThrow(/Usage/)
  })
})

describe('writeScaffold — real disk write', () => {
  it('writes the full tree under the target dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cmp-scaffold-'))
    try {
      const written = await writeScaffold('demo-app', dir)
      expect(written.length).toBeGreaterThan(15)
      // Spot-check a nested file actually landed with parameterized content.
      const app = await readFile(join(dir, 'src/App.tsx'), 'utf8')
      expect(app).toContain('export function App()')
      const main = await readFile(
        join(dir, 'android/app/src/main/kotlin/com/example/demoapp/MainActivity.kt'),
        'utf8',
      )
      expect(main).toContain('package com.example.demoapp')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
