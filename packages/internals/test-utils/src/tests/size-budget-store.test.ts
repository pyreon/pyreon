/**
 * Where size ceilings live (`scripts/size-budget-store.ts`).
 *
 * The property under test is the layout: one file per owner. The three former
 * tables (`bundle-budgets.json`, `import-budgets.json`, `zero-app-budgets.json`)
 * held every package on adjacent lines of one file, so two pull requests that
 * each changed a DIFFERENT package's number conflicted, and a conflicting pull
 * request is dispatched no CI at all.
 */

import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { SCENARIOS } from '../../../../../scripts/check-import-budgets'
import { listDirIfExists, readTextIfExists } from '../../../../../scripts/fs-read'
import {
  ceilingFile,
  loadCeilings,
  packageFileName,
  sizeBudgetsDir,
  writeCeiling,
} from '../../../../../scripts/size-budget-store'

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..')

describe('size-budget-store', () => {
  let dir: string | null = null
  const tmp = (): string => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-size-store-')))
    return dir
  }
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('two packages never share a file, across all three families', () => {
    const d = tmp()
    const a = writeCeiling(d, 'bundle', '@pyreon/core', 8232)
    const b = writeCeiling(d, 'bundle', '@pyreon/router', 15616)
    const c = writeCeiling(d, 'imports', '@pyreon/router::basic', 3866)
    const r = writeCeiling(d, 'routes', 'ssr-showcase:/about', 56950)
    expect(a).toBe(join('packages', 'core.json'))
    expect(b).toBe(join('packages', 'router.json'))
    // A package's bundle and its import scenarios are one owner, one file.
    expect(c).toBe(b)
    expect(r).toBe(join('apps', 'ssr-showcase.json'))
    expect(new Set([a, b, r]).size).toBe(3)
  })

  it('writing one ceiling leaves every other file byte-identical', () => {
    const d = tmp()
    writeCeiling(d, 'bundle', '@pyreon/core', 8232)
    writeCeiling(d, 'bundle', '@pyreon/router', 15616)
    const before = readFileSync(join(d, 'packages', 'core.json'), 'utf8')
    writeCeiling(d, 'bundle', '@pyreon/router', 17000)
    writeCeiling(d, 'imports', '@pyreon/router::basic', 3866)
    expect(readFileSync(join(d, 'packages', 'core.json'), 'utf8')).toBe(before)
  })

  it('round-trips every family and keeps a package file\'s other values', () => {
    const d = tmp()
    writeCeiling(d, 'imports', '@pyreon/runtime-dom::mount+hydrate', 18000)
    writeCeiling(d, 'bundle', '@pyreon/runtime-dom', 23612)
    writeCeiling(d, 'imports', '@pyreon/runtime-dom::mount', 9750)
    writeCeiling(d, 'routes', 'ssr-showcase:/', 56950)
    writeCeiling(d, 'routes', 'ssr-showcase:/island-demo', 59450)
    expect(loadCeilings(d)).toEqual({
      bundle: { '@pyreon/runtime-dom': 23612 },
      imports: { '@pyreon/runtime-dom::mount': 9750, '@pyreon/runtime-dom::mount+hydrate': 18000 },
      routes: { 'ssr-showcase:/': 56950, 'ssr-showcase:/island-demo': 59450 },
    })
    // Stable key order, so the same state is the same bytes whoever wrote it.
    expect(readFileSync(join(d, 'packages', 'runtime-dom.json'), 'utf8')).toBe(
      `${JSON.stringify({ package: '@pyreon/runtime-dom', bundle: 23612, imports: { mount: 9750, 'mount+hydrate': 18000 } }, null, 2)}\n`,
    )
  })

  it('a directory that does not exist reads as no ceilings (a base before this layout)', () => {
    expect(loadCeilings(join(tmp(), 'absent'))).toEqual({ bundle: {}, imports: {}, routes: {} })
  })

  it('names files by package, keeping a foreign scope', () => {
    expect(packageFileName('@pyreon/zero-cli')).toBe('zero-cli.json')
    expect(packageFileName('@pyreon-test/good-fixture')).toBe('pyreon-test__good-fixture.json')
    expect(ceilingFile('imports', '@pyreon/core::jsx')).toBe(join('packages', 'core.json'))
  })

  it('rejects a value that is not a byte count, naming the file', () => {
    const d = tmp()
    writeCeiling(d, 'bundle', '@pyreon/core', Number.NaN)
    expect(() => loadCeilings(d)).toThrow(/core\.json/)
  })
})

describe('fs-read: read it if it is there, as one operation', () => {
  let dir: string | null = null
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('a missing file reads as undefined and a missing directory as empty', () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-fs-read-')))
    expect(readTextIfExists(join(dir, 'absent.json'))).toBeUndefined()
    expect(listDirIfExists(join(dir, 'absent'))).toEqual([])
    // A path THROUGH a file (ENOTDIR) is "not there" too.
    writeFileSync(join(dir, 'file'), 'x')
    expect(readTextIfExists(join(dir, 'file', 'inner'))).toBeUndefined()
    expect(listDirIfExists(join(dir, 'file'))).toEqual([])
    expect(readTextIfExists(join(dir, 'file'))).toBe('x')
  })

  it('any other failure still throws: a directory is not an empty file', () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-fs-read-')))
    expect(() => readTextIfExists(dir as string)).toThrow()
  })

  it('writeCeiling into a directory that does not exist yet creates the file', () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-fs-read-')))
    const budgets = join(dir, 'not', 'yet')
    writeCeiling(budgets, 'bundle', '@pyreon/core', 8232)
    expect(loadCeilings(budgets).bundle).toEqual({ '@pyreon/core': 8232 })
  })

  it('a ceiling file that is not JSON is an error naming the file, never treated as absent', () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'pyreon-fs-read-')))
    writeCeiling(dir, 'bundle', '@pyreon/core', 8232)
    writeFileSync(join(dir, 'packages', 'core.json'), '{ broken')
    expect(() => loadCeilings(dir as string)).toThrow(/core\.json is not valid JSON/)
    expect(() => writeCeiling(dir as string, 'bundle', '@pyreon/core', 9000)).toThrow(/core\.json is not valid JSON/)
  })
})

describe('the committed ceilings', () => {
  const ceilings = loadCeilings(sizeBudgetsDir(REPO_ROOT))

  it('load, and every file is named for the package it declares', () => {
    const dir = join(sizeBudgetsDir(REPO_ROOT), 'packages')
    for (const file of readdirSync(dir)) {
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { package: string }
      expect(packageFileName(data.package), file).toBe(file)
    }
    expect(Object.keys(ceilings.bundle).length).toBeGreaterThan(60)
  })

  it('cover every minimal-import scenario the gate measures', () => {
    // The gate fails a scenario with no ceiling; this fails earlier, without a build.
    expect(SCENARIOS.filter((s) => ceilings.imports[s.id] === undefined).map((s) => s.id)).toEqual([])
    // … and hold no ceiling for a scenario that no longer exists.
    const ids = new Set(SCENARIOS.map((s) => s.id))
    expect(Object.keys(ceilings.imports).filter((id) => !ids.has(id))).toEqual([])
  })

  it('cover the size-judged ssr-showcase routes', () => {
    expect(Object.keys(ceilings.routes).sort()).toEqual([
      'ssr-showcase:/',
      'ssr-showcase:/about',
      'ssr-showcase:/island-demo',
    ])
  })
})
