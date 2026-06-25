/**
 * Tests for `pyreon info` — the pure data core (`scanInstalledPyreon`,
 * `detectSkew`, `collectInfo`, `formatInfo`) against fixture project dirs.
 *
 * `pyreon info` is slim-core: it reads the project's package.json +
 * node_modules/@pyreon/* and reports env + versions + skew. No feature-package
 * coupling, so it's fully exercisable against synthetic fixtures.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { collectInfo, detectSkew, formatInfo, scanInstalledPyreon } from '../info'

const stripAnsi = (s: string): string => s.replace(/\[[0-9;]*m/g, '')

/** Build a fixture project dir: package.json + node_modules/@pyreon/* installs. */
function makeProject(opts: {
  name?: string
  deps?: Record<string, string>
  installed?: Record<string, string> // @pyreon/<key> → version
}): string {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-info-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: opts.name ?? 'fixture-app', dependencies: opts.deps ?? {} }),
  )
  if (opts.installed) {
    const scope = join(root, 'node_modules', '@pyreon')
    mkdirSync(scope, { recursive: true })
    for (const [short, version] of Object.entries(opts.installed)) {
      mkdirSync(join(scope, short), { recursive: true })
      writeFileSync(
        join(scope, short, 'package.json'),
        JSON.stringify({ name: `@pyreon/${short}`, version }),
      )
    }
  }
  return root
}

const dirs: string[] = []
const project = (opts: Parameters<typeof makeProject>[0]): string => {
  const d = makeProject(opts)
  dirs.push(d)
  return d
}

afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe('scanInstalledPyreon', () => {
  it('lists installed @pyreon/* with versions, sorted by name', () => {
    const root = project({ installed: { router: '0.36.0', core: '0.36.0', zero: '0.36.0' } })
    const found = scanInstalledPyreon(root)
    expect(found.map((p) => p.name)).toEqual(['@pyreon/core', '@pyreon/router', '@pyreon/zero'])
    expect(found.every((p) => p.version === '0.36.0')).toBe(true)
  })
  it('returns [] when there is no node_modules/@pyreon scope', () => {
    expect(scanInstalledPyreon(project({}))).toEqual([])
  })
})

describe('detectSkew', () => {
  it('no skew when all packages share one version', () => {
    const r = detectSkew([
      { name: '@pyreon/core', version: '0.36.0' },
      { name: '@pyreon/router', version: '0.36.0' },
    ])
    expect(r.hasSkew).toBe(false)
    expect(r.dominant).toBe('0.36.0')
    expect(r.versions).toEqual(['0.36.0'])
  })
  it('flags skew + picks the dominant (most-packages) version first', () => {
    const r = detectSkew([
      { name: '@pyreon/core', version: '0.36.0' },
      { name: '@pyreon/router', version: '0.36.0' },
      { name: '@pyreon/query', version: '0.30.0' },
    ])
    expect(r.hasSkew).toBe(true)
    expect(r.dominant).toBe('0.36.0') // 2 packages vs 1
    expect(r.versions).toEqual(['0.36.0', '0.30.0'])
    expect(r.byVersion['0.30.0']).toEqual(['@pyreon/query'])
  })
  it('empty install → no skew, null dominant', () => {
    const r = detectSkew([])
    expect(r).toEqual({ versions: [], hasSkew: false, byVersion: {}, dominant: null })
  })
})

describe('collectInfo', () => {
  it('captures declared deps, installed versions, isZero, and runtime', () => {
    const root = project({
      name: 'my-app',
      deps: { '@pyreon/core': '^0.36.0', '@pyreon/zero': '^0.36.0', react: '^19' },
      installed: { core: '0.36.0', zero: '0.36.0' },
    })
    const report = collectInfo(root)
    expect(report.project.name).toBe('my-app')
    expect(report.project.isZero).toBe(true)
    expect(report.project.declared).toEqual({ '@pyreon/core': '^0.36.0', '@pyreon/zero': '^0.36.0' })
    expect(report.installed).toHaveLength(2)
    expect(report.skew.hasSkew).toBe(false)
    expect(report.runtime.node).toBe(process.versions.node)
    expect(report.cliVersion).toMatch(/^\d+\.\d+\.\d+/)
  })
  it('isZero is false without @pyreon/zero declared', () => {
    expect(collectInfo(project({ deps: { '@pyreon/core': '^0.36.0' } })).project.isZero).toBe(false)
  })
})

describe('formatInfo', () => {
  it('clean state shows the ✓ aligned line', () => {
    const out = stripAnsi(formatInfo(collectInfo(project({ installed: { core: '0.36.0', router: '0.36.0' } }))))
    expect(out).toContain('All @pyreon packages on 0.36.0')
    expect(out).toContain('@pyreon/core')
    expect(out).not.toContain('Version skew')
  })
  it('skew state names the offending versions + the dup-instance guard', () => {
    const out = stripAnsi(
      formatInfo(collectInfo(project({ installed: { core: '0.36.0', router: '0.36.0', query: '0.30.0' } }))),
    )
    expect(out).toContain('Version skew')
    expect(out).toContain('0.30.0: @pyreon/query')
    expect(out).toContain('Duplicate @pyreon/X detected')
  })
  it('no installs → explains node_modules is empty', () => {
    const out = stripAnsi(formatInfo(collectInfo(project({ deps: { '@pyreon/core': '^0.36.0' } }))))
    expect(out).toContain('No @pyreon/* packages installed')
    expect(out).toContain('1 declared')
  })
})
