// The native-lane decide classifier. Its two over-matches cost ~2h of
// runner time per affected PR on a 20-slot pool (5 macOS), so the contract is
// exact: the JSX compiler's napi crate and a web-only manifest edit must NOT
// run the lanes; everything genuinely native, and every uncertainty, MUST.

import { describe, expect, it } from 'vitest'
import { classifyNativeSurface } from '../../../../../scripts/native-surface-touched'

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
