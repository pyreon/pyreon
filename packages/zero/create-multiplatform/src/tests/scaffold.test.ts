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
      'ios/Sources/App.swift',
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
    // Swift @main struct + iOS project name.
    expect(get('ios/Sources/App.swift')).toContain('struct MyAppApp: App')
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

  it('rejects an empty name', () => {
    expect(() => buildScaffold({ name: '   ' })).toThrow()
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
