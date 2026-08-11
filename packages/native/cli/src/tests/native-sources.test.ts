// Native-source resolution tests — the toolchain that replaces the scaffold's
// FIXED `../node_modules/@pyreon/native-runtime-swift` paths.
//
// The whole point is that the resolver survives the three real install layouts
// the fixed path breaks on: FLAT (per-app node_modules), HOISTED (dep at the
// workspace root, absent from the app's local node_modules — npm/yarn), and
// PNPM (the dep is a SYMLINK into the store). We build each layout as a real
// on-disk fixture in a per-run tempdir and assert:
//   - the base runtimes resolve through the `pyreon.native` field in EVERY
//     layout, including the hoisted one where the fixed path would dangle;
//   - a co-located feature package (default `native/{swift,kotlin}/`) is
//     aggregated with zero config, its Swift into the PyreonRuntime module;
//   - a `pyreon.native` field overrides the default dirs / module;
//   - a DECLARED-but-missing dir is reported as a broken declaration, while a
//     missing DEFAULT dir is silently skipped;
//   - resolution is deduped by resolved directory + deterministic in order.
//
// Per-run tempdir via mkdtempSync (no Math.random in the path — CodeQL/#796).

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SWIFT_MODULE,
  findPackageDir,
  resolveNativeSources,
  swiftDirsForModule,
  swiftModules,
} from '../native-sources'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-sources-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Write a package.json + a file into each declared native dir. */
function writePackage(
  dir: string,
  manifest: Record<string, unknown>,
  nativeFiles: { rel: string; content?: string }[] = [],
): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
  for (const f of nativeFiles) {
    const full = join(dir, f.rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, f.content ?? '// native\n')
  }
}

/** The four base-runtime manifests, mirroring the real `pyreon.native` fields. */
const BASE = {
  runtimeSwift: {
    name: '@pyreon/native-runtime-swift',
    pyreon: { native: { swift: { module: 'PyreonRuntime', dir: 'Sources/PyreonRuntime' } } },
  },
  routerSwift: {
    name: '@pyreon/native-router-swift',
    pyreon: { native: { swift: { module: 'PyreonRouter', dir: 'Sources/PyreonRouter' } } },
  },
  runtimeKotlin: {
    name: '@pyreon/native-runtime-kotlin',
    pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } },
  },
  routerKotlin: {
    name: '@pyreon/native-router-kotlin',
    pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } },
  },
}

/** Install the four base runtimes into a given node_modules dir. */
function installBase(nodeModules: string): void {
  writePackage(join(nodeModules, '@pyreon/native-runtime-swift'), BASE.runtimeSwift, [
    { rel: 'Sources/PyreonRuntime/PyreonRuntime.swift' },
  ])
  writePackage(join(nodeModules, '@pyreon/native-router-swift'), BASE.routerSwift, [
    { rel: 'Sources/PyreonRouter/PyreonRouter.swift' },
  ])
  writePackage(join(nodeModules, '@pyreon/native-runtime-kotlin'), BASE.runtimeKotlin, [
    { rel: 'src/main/kotlin/com/pyreon/runtime/PyreonRuntime.kt' },
  ])
  writePackage(join(nodeModules, '@pyreon/native-router-kotlin'), BASE.routerKotlin, [
    { rel: 'src/main/kotlin/com/pyreon/router/PyreonRouter.kt' },
  ])
}

const APP_DEPS = {
  '@pyreon/native-runtime-swift': 'latest',
  '@pyreon/native-router-swift': 'latest',
  '@pyreon/native-runtime-kotlin': 'latest',
  '@pyreon/native-router-kotlin': 'latest',
}

describe('resolveNativeSources — base runtimes across install layouts', () => {
  it('FLAT: per-app node_modules — all four base packages resolve', () => {
    const app = join(root, 'app')
    writePackage(app, { name: 'my-app', dependencies: APP_DEPS })
    installBase(join(app, 'node_modules'))

    const res = resolveNativeSources(app)
    expect(res.brokenDeclarations).toEqual([])
    expect(swiftModules(res).sort()).toEqual(['PyreonRouter', 'PyreonRuntime'])
    // Two kotlin src roots (runtime + router).
    expect(res.kotlin.map((k) => k.package).sort()).toEqual([
      '@pyreon/native-router-kotlin',
      '@pyreon/native-runtime-kotlin',
    ])
    // The PyreonRuntime Swift dir points at the runtime package's Sources.
    const rt = swiftDirsForModule(res, 'PyreonRuntime')
    expect(rt).toHaveLength(1)
    expect(rt[0]).toContain(join('native-runtime-swift', 'Sources', 'PyreonRuntime'))
  })

  it('HOISTED: dep at the workspace root, NOT in the app node_modules (the fixed path would dangle)', () => {
    // apps/mobile has NO local node_modules for @pyreon/*; they hoist to root.
    const app = join(root, 'apps', 'mobile')
    writePackage(app, { name: 'mobile', dependencies: APP_DEPS })
    installBase(join(root, 'node_modules')) // hoisted to monorepo root

    // The fixed scaffold path `<app>/../node_modules/...` (= apps/node_modules)
    // does NOT exist — prove the resolver walks up to the real root install.
    expect(findPackageDir('@pyreon/native-runtime-swift', join(app, 'src'))).toContain(
      join(root, 'node_modules', '@pyreon', 'native-runtime-swift'),
    )
    const res = resolveNativeSources(app)
    expect(res.brokenDeclarations).toEqual([])
    expect(swiftModules(res).sort()).toEqual(['PyreonRouter', 'PyreonRuntime'])
    expect(res.kotlin).toHaveLength(2)
  })

  it('PNPM: the base package is a SYMLINK into a store — resolves through the link', () => {
    const app = join(root, 'app')
    writePackage(app, { name: 'my-app', dependencies: APP_DEPS })

    // Real files live in a pnpm-style store; node_modules/@pyreon/* symlinks in.
    const store = join(root, 'store')
    installBase(store)
    const appNm = join(app, 'node_modules', '@pyreon')
    mkdirSync(appNm, { recursive: true })
    for (const name of [
      'native-runtime-swift',
      'native-router-swift',
      'native-runtime-kotlin',
      'native-router-kotlin',
    ]) {
      symlinkSync(join(store, '@pyreon', name), join(appNm, name), 'dir')
    }

    const res = resolveNativeSources(app)
    expect(res.brokenDeclarations).toEqual([])
    expect(swiftModules(res).sort()).toEqual(['PyreonRouter', 'PyreonRuntime'])
    expect(res.kotlin).toHaveLength(2)
  })
})

describe('resolveNativeSources — co-located feature packages', () => {
  it('zero-config: a package with default native/{swift,kotlin}/ aggregates into PyreonRuntime + kotlin list', () => {
    const app = join(root, 'app')
    writePackage(app, {
      name: 'my-app',
      dependencies: { ...APP_DEPS, '@pyreon/query': 'latest' },
    })
    const nm = join(app, 'node_modules')
    installBase(nm)
    // @pyreon/query ships co-located native sources with NO pyreon.native field.
    writePackage(join(nm, '@pyreon/query'), { name: '@pyreon/query' }, [
      { rel: 'native/swift/PyreonQuery.swift' },
      { rel: 'native/kotlin/com/pyreon/runtime/PyreonQuery.kt' },
    ])

    const res = resolveNativeSources(app)
    expect(res.brokenDeclarations).toEqual([])
    // The feature's Swift compiles into the SAME PyreonRuntime module (bare types).
    const rt = swiftDirsForModule(res, 'PyreonRuntime')
    expect(rt.some((d) => d.includes(join('query', 'native', 'swift')))).toBe(true)
    // …and its kotlin dir is a srcDir alongside the runtime's.
    expect(res.kotlin.some((k) => k.package === '@pyreon/query')).toBe(true)
    expect(res.kotlin.some((k) => k.dir.includes(join('query', 'native', 'kotlin')))).toBe(true)
  })

  it('a package with NO native half contributes nothing (silent skip)', () => {
    const app = join(root, 'app')
    writePackage(app, {
      name: 'my-app',
      dependencies: { ...APP_DEPS, '@pyreon/reactivity': 'latest' },
    })
    const nm = join(app, 'node_modules')
    installBase(nm)
    writePackage(join(nm, '@pyreon/reactivity'), { name: '@pyreon/reactivity' }) // web-only

    const res = resolveNativeSources(app)
    expect(res.swift.some((s) => s.package === '@pyreon/reactivity')).toBe(false)
    expect(res.kotlin.some((k) => k.package === '@pyreon/reactivity')).toBe(false)
    expect(res.brokenDeclarations).toEqual([])
  })

  it('a THIRD-PARTY package opts in by declaring the pyreon.native field', () => {
    const app = join(root, 'app')
    writePackage(app, {
      name: 'my-app',
      dependencies: { ...APP_DEPS, '@acme/widgets': 'latest' },
    })
    const nm = join(app, 'node_modules')
    installBase(nm)
    writePackage(
      join(nm, '@acme/widgets'),
      { name: '@acme/widgets', pyreon: { native: { swift: 'ios', kotlin: 'android' } } },
      [{ rel: 'ios/Widgets.swift' }, { rel: 'android/Widgets.kt' }],
    )

    const res = resolveNativeSources(app)
    // Default include() is @pyreon/* — but a field-declaring package opts in.
    expect(res.swift.some((s) => s.package === '@acme/widgets' && s.module === DEFAULT_SWIFT_MODULE)).toBe(true)
    expect(res.kotlin.some((k) => k.package === '@acme/widgets')).toBe(true)
  })
})

describe('resolveNativeSources — declarations, overrides, dedupe', () => {
  it('a DECLARED dir that is missing on disk is a broken declaration', () => {
    const app = join(root, 'app')
    writePackage(app, { name: 'my-app', dependencies: { '@pyreon/query': 'latest' } })
    const nm = join(app, 'node_modules')
    // Declares native/swift but ships no such dir.
    writePackage(join(nm, '@pyreon/query'), {
      name: '@pyreon/query',
      pyreon: { native: { swift: { dir: 'native/swift' } } },
    })

    const res = resolveNativeSources(app)
    expect(res.swift).toEqual([])
    expect(res.brokenDeclarations).toEqual([
      { package: '@pyreon/query', target: 'swift', dir: join(nm, '@pyreon/query', 'native/swift') },
    ])
  })

  it('an array declaration ships multiple dirs/modules', () => {
    const app = join(root, 'app')
    writePackage(app, { name: 'my-app', dependencies: { '@pyreon/multi': 'latest' } })
    const nm = join(app, 'node_modules')
    writePackage(
      join(nm, '@pyreon/multi'),
      {
        name: '@pyreon/multi',
        pyreon: {
          native: {
            swift: [
              { module: 'PyreonRuntime', dir: 'native/rt' },
              { module: 'PyreonExtras', dir: 'native/extras' },
            ],
          },
        },
      },
      [{ rel: 'native/rt/A.swift' }, { rel: 'native/extras/B.swift' }],
    )

    const res = resolveNativeSources(app)
    expect(swiftModules(res).sort()).toEqual(['PyreonExtras', 'PyreonRuntime'])
  })

  it('a package reachable through two dep edges is collected ONCE (dedupe by dir)', () => {
    const app = join(root, 'app')
    writePackage(app, {
      name: 'my-app',
      dependencies: { '@pyreon/query': 'latest' },
      devDependencies: { '@pyreon/query': 'latest' }, // same name, two edges
    })
    const nm = join(app, 'node_modules')
    writePackage(join(nm, '@pyreon/query'), { name: '@pyreon/query' }, [
      { rel: 'native/swift/PyreonQuery.swift' },
    ])

    const res = resolveNativeSources(app)
    expect(res.swift.filter((s) => s.package === '@pyreon/query')).toHaveLength(1)
  })

  it('no package.json in the app dir → empty resolution, no throw', () => {
    const res = resolveNativeSources(join(root, 'does-not-exist'))
    expect(res).toEqual({ swift: [], kotlin: [], brokenDeclarations: [] })
  })
})
