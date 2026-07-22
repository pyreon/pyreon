import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkTsconfigPresets, EXEMPT } from '../../../../../scripts/check-tsconfig-presets'

// Contract test for the @pyreon/tsconfig drift guard: every package/example
// tsconfig must extend a shared preset; template trees are never scanned;
// the root config must point at base.json. Runs against SYNTHETIC repo trees
// (not the live repo — the live repo is covered by the gate itself in
// validate-fast, and a fixture tree keeps the specs hermetic).

let dir: string

const mk = (rel: string, content: object | string) => {
  const p = path.join(dir, rel)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content))
}

const scaffold = () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tsconfig-gate-'))
  mk('tsconfig.json', { extends: '@pyreon/tsconfig/base.json' })
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('check-tsconfig-presets', () => {
  it('passes when every config extends a preset (packages, examples, jsonc comments)', () => {
    scaffold()
    mk('packages/fundamentals/foo/tsconfig.json', {
      extends: '@pyreon/tsconfig/lib-jsx.json',
    })
    mk('packages/internals/bar/tsconfig.json', {
      extends: '@pyreon/tsconfig/internal.json',
      compilerOptions: { types: ['node'] },
    })
    mk(
      'examples/demo/tsconfig.json',
      '{\n  // rationale comment survives parsing\n  "extends": "@pyreon/tsconfig/example.json"\n}',
    )
    expect(checkTsconfigPresets(dir)).toEqual([])
  })

  it('flags a config that extends the root tsconfig directly (the pre-consolidation shape)', () => {
    scaffold()
    mk('packages/fundamentals/foo/tsconfig.json', {
      extends: '../../../tsconfig.json',
      compilerOptions: { outDir: './lib' },
    })
    const findings = checkTsconfigPresets(dir)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.file).toBe('packages/fundamentals/foo/tsconfig.json')
    expect(findings[0]!.problem).toContain('must extend an @pyreon/tsconfig preset')
  })

  it('flags a config with no extends at all', () => {
    scaffold()
    mk('examples/loner/tsconfig.json', { compilerOptions: { noEmit: true } })
    const findings = checkTsconfigPresets(dir)
    expect(findings.some((f) => f.file === 'examples/loner/tsconfig.json')).toBe(true)
  })

  it('never scans user-shipped template trees', () => {
    scaffold()
    mk('packages/zero/create-zero/templates/app/tsconfig.json', {
      compilerOptions: { strict: true },
    })
    expect(checkTsconfigPresets(dir)).toEqual([])
  })

  it('flags a root tsconfig that does not point at base.json', () => {
    scaffold()
    mk('tsconfig.json', { extends: '@vitus-labs/tools-typescript/lib' })
    const findings = checkTsconfigPresets(dir)
    expect(findings.some((f) => f.file === 'tsconfig.json')).toBe(true)
  })

  it('EXEMPT entries are honored (and the list documents its rationale contract)', () => {
    scaffold()
    mk('packages/tools/odd/tsconfig.json', { compilerOptions: {} })
    const before = checkTsconfigPresets(dir)
    expect(before.some((f) => f.file === 'packages/tools/odd/tsconfig.json')).toBe(true)
    EXEMPT['packages/tools/odd/tsconfig.json'] = 'test rationale'
    try {
      const after = checkTsconfigPresets(dir)
      expect(after.some((f) => f.file === 'packages/tools/odd/tsconfig.json')).toBe(false)
    } finally {
      delete EXEMPT['packages/tools/odd/tsconfig.json']
    }
  })
})
