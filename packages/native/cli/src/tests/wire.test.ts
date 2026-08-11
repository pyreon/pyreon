// `wire` — the build-wiring generator that replaces the scaffold's FIXED
// `../node_modules/@pyreon/native-runtime-*` paths with paths RESOLVED at
// build time. The load-bearing assertion is the HOISTED layout (the exact
// shape a monorepo produces, where the fixed path dangles): the generated
// Gradle srcDirs + iOS SwiftPM package paths point at the REAL install
// location, wherever hoisting/pnpm put it.
//
// Per-run tempdir via mkdtempSync (no Math.random in the path — CodeQL/#796).

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computeWiring, renderAndroidSrcDirsFile, wireApp } from '../wire'
import { resolveNativeSources } from '../native-sources'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-wire-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writePackage(dir: string, manifest: Record<string, unknown>, files: string[] = []): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  for (const rel of files) {
    const full = join(dir, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, '// native\n')
  }
}

/** Install the four base runtimes (with their real `pyreon.native` fields +
 *  a `Package.swift` for the Swift packages) into `nodeModules`. */
function installBase(nodeModules: string): void {
  writePackage(
    join(nodeModules, '@pyreon/native-runtime-swift'),
    {
      name: '@pyreon/native-runtime-swift',
      pyreon: { native: { swift: { module: 'PyreonRuntime', dir: 'Sources/PyreonRuntime' } } },
    },
    ['Package.swift', 'Sources/PyreonRuntime/PyreonRuntime.swift'],
  )
  writePackage(
    join(nodeModules, '@pyreon/native-router-swift'),
    {
      name: '@pyreon/native-router-swift',
      pyreon: { native: { swift: { module: 'PyreonRouter', dir: 'Sources/PyreonRouter' } } },
    },
    ['Package.swift', 'Sources/PyreonRouter/PyreonRouter.swift'],
  )
  writePackage(
    join(nodeModules, '@pyreon/native-runtime-kotlin'),
    { name: '@pyreon/native-runtime-kotlin', pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } } },
    ['src/main/kotlin/com/pyreon/runtime/PyreonRuntime.kt'],
  )
  writePackage(
    join(nodeModules, '@pyreon/native-router-kotlin'),
    { name: '@pyreon/native-router-kotlin', pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } } },
    ['src/main/kotlin/com/pyreon/router/PyreonRouter.kt'],
  )
}

const APP_DEPS = {
  '@pyreon/native-runtime-swift': 'latest',
  '@pyreon/native-router-swift': 'latest',
  '@pyreon/native-runtime-kotlin': 'latest',
  '@pyreon/native-router-kotlin': 'latest',
}

describe('wire — base runtimes', () => {
  it('FLAT: SwiftPM packages point at the resolved package ROOTS (containing Package.swift), Gradle srcDirs at the kotlin roots', () => {
    const app = join(root, 'app')
    writePackage(app, { name: 'my-app', dependencies: APP_DEPS })
    installBase(join(app, 'node_modules'))

    const wiring = wireApp(app)
    expect(wiring.brokenDeclarations).toEqual([])

    // SwiftPM: two packages, each at its ROOT (not the Sources subdir).
    const modules = wiring.iosSpmPackages.map((p) => p.module).sort()
    expect(modules).toEqual(['PyreonRouter', 'PyreonRuntime'])
    const rt = wiring.iosSpmPackages.find((p) => p.module === 'PyreonRuntime')!
    expect(rt.path).toContain(join('node_modules', '@pyreon', 'native-runtime-swift'))
    expect(rt.path.endsWith('native-runtime-swift')).toBe(true) // ROOT, not /Sources/...

    // Gradle: two srcDirs at the kotlin src roots.
    expect(wiring.androidSrcDirs).toHaveLength(2)
    expect(wiring.androidSrcDirs.every((d) => d.includes(join('src', 'main', 'kotlin')))).toBe(true)
    // No co-located feature Swift yet → no target sources.
    expect(wiring.iosTargetSources).toEqual([])
  })

  it('HOISTED (the Gap-1 fix): base runtime at the workspace ROOT, absent from the app node_modules — the fixed path would dangle, wire finds it', () => {
    const app = join(root, 'apps', 'mobile')
    writePackage(app, { name: 'mobile', dependencies: APP_DEPS })
    installBase(join(root, 'node_modules')) // hoisted to monorepo root

    // The fixed scaffold Gradle path `../../node_modules/@pyreon/...` relative
    // to android/app/ (= apps/mobile/android/app/../../node_modules) does NOT
    // exist. Prove wire resolves to the REAL root install instead.
    const fixedPath = join(app, 'node_modules', '@pyreon', 'native-runtime-kotlin')
    const wiring = wireApp(app)
    expect(wiring.brokenDeclarations).toEqual([])
    for (const d of wiring.androidSrcDirs) {
      expect(d.startsWith(fixedPath)).toBe(false) // NOT the dangling per-app path
      expect(d.startsWith(join(root, 'node_modules'))).toBe(true) // the real root install
    }
    for (const p of wiring.iosSpmPackages) {
      expect(p.path.startsWith(join(root, 'node_modules'))).toBe(true)
    }
  })
})

describe('wire — co-located feature packages', () => {
  it('feature native/kotlin becomes an extra Gradle srcDir; feature native/swift (no Package.swift) becomes a co-located target source, not an SPM package', () => {
    const app = join(root, 'app')
    writePackage(app, {
      name: 'my-app',
      dependencies: { ...APP_DEPS, '@pyreon/query': 'latest' },
    })
    const nm = join(app, 'node_modules')
    installBase(nm)
    writePackage(join(nm, '@pyreon/query'), { name: '@pyreon/query' }, [
      'native/swift/PyreonQuery.swift', // NO Package.swift → co-located
      'native/kotlin/com/pyreon/runtime/PyreonQuery.kt',
    ])

    const wiring = wireApp(app)
    // Kotlin: query's dir joins the srcDir list (3 total).
    expect(wiring.androidSrcDirs).toHaveLength(3)
    expect(wiring.androidSrcDirs.some((d) => d.includes(join('query', 'native', 'kotlin')))).toBe(true)
    // Swift: query is NOT an SPM package (no Package.swift) — it's a co-located
    // source for the PyreonRuntime target.
    expect(wiring.iosSpmPackages.map((p) => p.module).sort()).toEqual(['PyreonRouter', 'PyreonRuntime'])
    const rtTarget = wiring.iosTargetSources.find((t) => t.module === 'PyreonRuntime')
    expect(rtTarget).toBeDefined()
    expect(rtTarget!.dirs.some((d) => d.includes(join('query', 'native', 'swift')))).toBe(true)
  })
})

describe('renderAndroidSrcDirsFile', () => {
  it('emits absolute dirs, one per line, with a provenance comment', () => {
    const app = join(root, 'app')
    writePackage(app, { name: 'my-app', dependencies: APP_DEPS })
    installBase(join(app, 'node_modules'))

    const wiring = computeWiring(resolveNativeSources(app))
    const text = renderAndroidSrcDirsFile(wiring)
    const lines = text.trimEnd().split('\n')
    const comments = lines.filter((l) => l.startsWith('#'))
    const dirs = lines.filter((l) => !l.startsWith('#'))
    expect(comments.length).toBeGreaterThan(0)
    expect(dirs).toEqual(wiring.androidSrcDirs)
    expect(dirs.every((d) => d.startsWith('/'))).toBe(true) // absolute

    // Round-trip: the file the scaffold reads back parses to the same dirs.
    const outFile = join(app, 'android', 'pyreon-native.srcdirs')
    mkdirSync(join(outFile, '..'), { recursive: true })
    writeFileSync(outFile, text)
    const parsed = readFileSync(outFile, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'))
    expect(parsed).toEqual(wiring.androidSrcDirs)
  })
})
