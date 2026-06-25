/**
 * Tests for `pyreon upgrade` — the pure planning core (`compareVersions`,
 * `cleanVersion`, `resolveTarget`, `computeUpgradePlan`, `rewriteDeps`) plus
 * the dry-run/`--write` file behavior of `upgrade()` against fixture projects.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  cleanVersion,
  compareVersions,
  computeUpgradePlan,
  resolveTarget,
  rewriteDeps,
  upgrade,
} from '../upgrade'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})
function fixture(pkg: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-upgrade-'))
  dirs.push(root)
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
  return root
}

describe('compareVersions', () => {
  it('orders by major/minor/patch', () => {
    expect(compareVersions('0.37.0', '0.36.0')).toBe(1)
    expect(compareVersions('0.36.0', '0.37.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1) // numeric, not lexical
  })
  it('sorts a release above its prerelease', () => {
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1)
  })
})

describe('cleanVersion', () => {
  it('strips range operators', () => {
    expect(cleanVersion('^0.37.0')).toBe('0.37.0')
    expect(cleanVersion('~0.36.1')).toBe('0.36.1')
    expect(cleanVersion('>=0.30.0')).toBe('0.30.0')
    expect(cleanVersion('0.37.0')).toBe('0.37.0')
  })
  it('returns null for non-version specifiers', () => {
    expect(cleanVersion('workspace:*')).toBeNull()
    expect(cleanVersion('latest')).toBeNull()
  })
})

describe('resolveTarget', () => {
  it('explicit --to wins when valid', () => {
    expect(resolveTarget(['0.36.0'], '0.40.0')).toBe('0.40.0')
    expect(resolveTarget(['0.36.0'], '^0.40.0')).toBe('0.40.0')
  })
  it('rejects an invalid explicit target', () => {
    expect(resolveTarget(['0.36.0'], 'latest')).toBeNull()
    expect(resolveTarget(['0.36.0'], 'next')).toBeNull()
  })
  it('defaults to the highest version present (align up)', () => {
    expect(resolveTarget(['^0.30.0', '0.37.0', '~0.36.1'])).toBe('0.37.0')
  })
  it('null when nothing resolvable', () => {
    expect(resolveTarget([])).toBeNull()
    expect(resolveTarget(['workspace:*'])).toBeNull()
  })
})

describe('computeUpgradePlan', () => {
  const declared = {
    '@pyreon/core': '^0.30.0',
    '@pyreon/router': '^0.37.0',
    '@pyreon/zero': 'workspace:*',
    react: '^19.0.0',
  }
  it('rewrites only out-of-date @pyreon deps, caret-preserving', () => {
    const plan = computeUpgradePlan(declared, '0.37.0', false)
    expect(plan).toEqual([{ name: '@pyreon/core', from: '^0.30.0', to: '^0.37.0' }])
  })
  it('--exact pins without the caret', () => {
    const plan = computeUpgradePlan(declared, '0.37.0', true)
    expect(plan.find((c) => c.name === '@pyreon/core')?.to).toBe('0.37.0')
    // router was ^0.37.0 → with exact target 0.37.0 it now differs, so it changes too
    expect(plan.find((c) => c.name === '@pyreon/router')?.to).toBe('0.37.0')
  })
  it('skips workspace:/non-version specifiers and non-@pyreon deps', () => {
    const plan = computeUpgradePlan(declared, '0.37.0', false)
    expect(plan.some((c) => c.name === '@pyreon/zero')).toBe(false)
    expect(plan.some((c) => c.name === 'react')).toBe(false)
  })
  it('empty plan when all already at target', () => {
    expect(computeUpgradePlan({ '@pyreon/core': '^0.37.0' }, '0.37.0', false)).toEqual([])
  })
})

describe('rewriteDeps', () => {
  it('applies changes across dependencies + devDependencies, leaving others intact', () => {
    const pkg = {
      dependencies: { '@pyreon/core': '^0.30.0', react: '^19' },
      devDependencies: { '@pyreon/cli': '^0.30.0' },
    }
    const next = rewriteDeps(pkg, [
      { name: '@pyreon/core', from: '^0.30.0', to: '^0.37.0' },
      { name: '@pyreon/cli', from: '^0.30.0', to: '^0.37.0' },
    ]) as typeof pkg
    expect(next.dependencies['@pyreon/core']).toBe('^0.37.0')
    expect(next.dependencies.react).toBe('^19')
    expect(next.devDependencies['@pyreon/cli']).toBe('^0.37.0')
  })
})

describe('upgrade() file behavior', () => {
  it('dry-run does NOT modify package.json', () => {
    const root = fixture({ dependencies: { '@pyreon/core': '^0.30.0', '@pyreon/router': '^0.37.0' } })
    const before = readFileSync(join(root, 'package.json'), 'utf8')
    const code = upgrade({ cwd: root, json: true }) // json+no-write = dry plan
    expect(code).toBe(0)
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toBe(before)
  })
  it('--write aligns the laggard up to the highest present version', () => {
    const root = fixture({ dependencies: { '@pyreon/core': '^0.30.0', '@pyreon/router': '^0.37.0' } })
    upgrade({ cwd: root, write: true, json: true })
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@pyreon/core']).toBe('^0.37.0')
    expect(pkg.dependencies['@pyreon/router']).toBe('^0.37.0')
  })
  it('returns 1 on an unresolvable explicit target', () => {
    const root = fixture({ dependencies: { '@pyreon/core': '^0.30.0' } })
    expect(upgrade({ cwd: root, to: 'bogus', json: true })).toBe(1)
  })
})
