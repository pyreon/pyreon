/**
 * Unit tests for the package.json dependency auto-detection that gates
 * library-scoped opt-in best-practice rules. A false-negative here
 * silently disables a rule across a whole project, so this is covered
 * directly (not just smoke-checked through a rule).
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  _resetProjectDepsCache,
  isProjectDependency,
} from '../utils/project-deps'

function fixture(pkg: Record<string, unknown>): {
  dir: string
  file: string
} {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-deps-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
  const srcDir = join(dir, 'src', 'nested')
  mkdirSync(srcDir, { recursive: true })
  const file = join(srcDir, 'a.ts')
  writeFileSync(file, 'export const x = 1\n')
  return { dir, file }
}

describe('isProjectDependency', () => {
  beforeEach(() => _resetProjectDepsCache())
  afterEach(() => _resetProjectDepsCache())

  it('detects a regular dependency (walking up from a nested src file)', () => {
    const { dir, file } = fixture({
      name: 'app',
      dependencies: { '@pyreon/query': '^1.0.0' },
    })
    expect(isProjectDependency(file, '@pyreon/query')).toBe(true)
    expect(isProjectDependency(file, '@pyreon/rx')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('detects devDependencies / peerDependencies / optionalDependencies', () => {
    const { dir, file } = fixture({
      name: 'app',
      devDependencies: { '@pyreon/rx': '*' },
      peerDependencies: { '@pyreon/form': '*' },
      optionalDependencies: { '@pyreon/zero': '*' },
    })
    expect(isProjectDependency(file, '@pyreon/rx')).toBe(true)
    expect(isProjectDependency(file, '@pyreon/form')).toBe(true)
    expect(isProjectDependency(file, '@pyreon/zero')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it("treats the package's own name as a self-dependency (lib source)", () => {
    const { dir, file } = fixture({ name: '@pyreon/query' })
    // @pyreon/query's own source should be covered by query rules.
    expect(isProjectDependency(file, '@pyreon/query')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns false when the dep is absent (auto-detection: silent)', () => {
    const { dir, file } = fixture({
      name: 'app',
      dependencies: { react: '^18' },
    })
    expect(isProjectDependency(file, '@pyreon/query')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns false (never throws) on an unparseable manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-deps-bad-'))
    writeFileSync(join(dir, 'package.json'), '{ not valid json')
    const file = join(dir, 'a.ts')
    writeFileSync(file, '\n')
    expect(isProjectDependency(file, '@pyreon/query')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('is cached: a second call after the manifest changes still sees the first result', () => {
    const { dir, file } = fixture({
      name: 'app',
      dependencies: { '@pyreon/query': '*' },
    })
    expect(isProjectDependency(file, '@pyreon/query')).toBe(true)
    // Mutate the manifest WITHOUT resetting the cache → cached answer.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app' }))
    expect(isProjectDependency(file, '@pyreon/query')).toBe(true)
    // After an explicit reset the fresh manifest is read.
    _resetProjectDepsCache()
    expect(isProjectDependency(file, '@pyreon/query')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
