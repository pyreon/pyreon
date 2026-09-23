// The native-lane decide classifier. Its two over-matches cost ~2h of
// runner time per affected PR on a 20-slot pool (5 macOS), so the contract is
// exact: the JSX compiler's napi crate and a web-only manifest edit must NOT
// run the lanes; everything genuinely native, and every uncertainty, MUST.

import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import {
  type AppSurface,
  classifyNativeSurface,
  deriveAppSurfaces,
  selectApps,
} from '../../../../../scripts/native-surface-touched'

const noFs = () => null
const withManifests = (m: Record<string, string | null>) => (p: string) => (p in m ? m[p]! : null)

describe('classifyNativeSurface — skips', () => {
  it('does not treat the JSX compiler napi crate as a native surface', () => {
    const d = classifyNativeSurface(
      ['packages/core/compiler/native/src/lib.rs', 'packages/core/compiler/src/jsx.ts'],
      noFs,
    )
    expect(d.run).toBe(false)
  })
  it('does not run for a package.json that declares no pyreon.native', () => {
    const d = classifyNativeSurface(
      ['packages/fundamentals/toast/package.json'],
      withManifests({
        'packages/fundamentals/toast/package.json': '{"name":"@pyreon/toast","dependencies":{}}',
      }),
    )
    expect(d.run).toBe(false)
  })
  it('does not run for ordinary web-only source', () => {
    expect(
      classifyNativeSurface(['packages/core/runtime-dom/src/mount.ts', 'docs/x.md'], noFs).run,
    ).toBe(false)
  })
})

describe('classifyNativeSurface — runs', () => {
  it.each([
    ['packages/native/compiler/src/emit-swift.ts'],
    ['packages/fundamentals/flow/native/swift/PyreonFlowState.swift'],
    ['examples/native-tasks/src/TasksApp.tsx'],
    ['scripts/check-native-coverage.ts'],
    ['bun.lock'],
    ['.bun-version'],
  ])('%s forces the lanes', (file) => {
    const d = classifyNativeSurface([file], noFs)
    expect(d.run).toBe(true)
    expect(d.reasons).toHaveLength(1)
  })
  it('runs for a package.json that declares pyreon.native', () => {
    const d = classifyNativeSurface(
      ['packages/fundamentals/flow/package.json'],
      withManifests({
        'packages/fundamentals/flow/package.json': '{"pyreon":{"native":{"kotlinServices":{}}}}',
      }),
    )
    expect(d.run).toBe(true)
  })
  it('runs for the workflow file itself', () => {
    expect(
      classifyNativeSurface(
        ['.github/workflows/native-device.yml'],
        noFs,
        '.github/workflows/native-device.yml',
      ).run,
    ).toBe(true)
  })
})

describe('classifyNativeSurface — fail-closed', () => {
  it('runs on an empty file list', () => {
    expect(classifyNativeSurface([], noFs).run).toBe(true)
  })
  it('runs when a changed package.json is missing at head (deleted)', () => {
    expect(classifyNativeSurface(['packages/fundamentals/flow/package.json'], noFs).run).toBe(true)
  })
  it('runs when the manifest cannot be parsed', () => {
    const d = classifyNativeSurface(
      ['packages/a/b/package.json'],
      withManifests({ 'packages/a/b/package.json': '{not json' }),
    )
    expect(d.run).toBe(true)
  })
  it('runs when the reader throws', () => {
    const d = classifyNativeSurface(['packages/a/b/package.json'], () => {
      throw new Error('EACCES')
    })
    expect(d.run).toBe(true)
  })
})

// ── Per-app device-lane selection (native-device.yml `--apps`) ──────────────

const REPO = resolve(__dirname, '../../../../..')

describe('selectApps — synthetic surfaces', () => {
  const S: AppSurface[] = [
    { platform: 'ios', app: 'counter', roots: ['examples/native-counter-ios/', 'pkg/flow/native/swift/'] },
    { platform: 'android', app: 'counter', roots: ['examples/native-counter-android/', 'examples/native-counter-ios/src/', 'pkg/flow/native/kotlin/'] },
    { platform: 'ios', app: 'finance', roots: ['examples/native-finance-ios/', 'examples/native-finance/'] },
    { platform: 'android', app: 'finance', roots: ['examples/native-finance-android/', 'examples/native-finance/'] },
  ]
  it('a platform-specific co-located source selects only that platform', () => {
    expect(selectApps(['pkg/flow/native/swift/A.swift'], S)).toMatchObject({ ios: ['counter'], android: 'none' })
  })
  it('shared source selects the app on both platforms', () => {
    expect(selectApps(['examples/native-finance/src/App.tsx'], S)).toMatchObject({ ios: ['finance'], android: ['finance'] })
  })
  it('an iOS-only UITest edit does not run the Android lane', () => {
    expect(selectApps(['examples/native-counter-ios/iosUITests/T.swift'], S)).toMatchObject({ ios: ['counter'], android: 'none' })
  })
  it('a file no app claims runs EVERY lane (fail-closed)', () => {
    expect(selectApps(['packages/native/compiler/src/emit-swift.ts', 'pkg/flow/native/swift/A.swift'], S)).toMatchObject({ ios: 'all', android: 'all' })
    expect(selectApps(['bun.lock'], S)).toMatchObject({ ios: 'all', android: 'all' })
  })
  it('a native example no lane builds selects nothing', () => {
    expect(selectApps(['examples/native-viz/src/x.tsx'], S)).toMatchObject({ ios: 'none', android: 'none' })
  })
})

// Against the REAL repo: the surfaces are derived from each app's build files,
// so this is the drift lock — rewiring an app changes what these return.
describe('deriveAppSurfaces — the real example apps', () => {
  const surfaces = deriveAppSurfaces(REPO)
  const key = (s: AppSurface) => s.app + '-' + s.platform
  it('finds all ten device-lane apps', () => {
    expect(surfaces.map(key).sort()).toEqual([
      'counter-android', 'counter-ios', 'finance-android', 'finance-ios',
      'router-demo-android', 'router-demo-ios', 'tasks-android', 'tasks-ios',
      'todomvc-android', 'todomvc-ios',
    ])
  })
  it('the runtime and router are claimed by every app on their platform', () => {
    for (const s of surfaces) {
      const rt = s.platform === 'ios' ? 'packages/native/runtime-swift/' : 'packages/native/runtime-kotlin/src/main/kotlin/'
      expect(s.roots, key(s)).toContain(rt)
    }
  })
  it('the compiler is claimed by no app (so it always runs every lane)', () => {
    for (const s of surfaces) expect(s.roots.some((r) => r.startsWith('packages/native/compiler'))).toBe(false)
  })
  it('a flow Swift change selects exactly the iOS apps wired to it', () => {
    const wired = surfaces.filter((s) => s.platform === 'ios' && s.roots.includes('packages/fundamentals/flow/native/swift/')).map((s) => s.app).sort()
    expect(wired.length).toBeGreaterThan(0)
    expect(selectApps(['packages/fundamentals/flow/native/swift/X.swift'], surfaces)).toMatchObject({ ios: wired, android: 'none' })
  })
})
