import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertClientClean,
  checkRouteSizes,
  routeHtmlMap,
  firstLoadJsGzip,
  staticImports,
} from '../../../../../scripts/zero-app-checks'
import { writeCeiling } from '../../../../../scripts/size-budget-store'

const dirs: string[] = []
function tmp(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'zero-app-checks-'))
  dirs.push(d)
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true })
    writeFileSync(join(d, p), c)
  }
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('zero-app-checks — staticImports', () => {
  it('collects static import/export-from forms and ignores dynamic import()', () => {
    const code =
      'import{a as b}from"./a-1.js";import"./side.js";export*from"./re.js";' +
      'export{x}from "../up.js";const l=()=>import("./lazy.js");'
    expect(staticImports(code).sort()).toEqual(['../up.js', './a-1.js', './re.js', './side.js'])
  })
})

describe('zero-app-checks — assertClientClean', () => {
  it('fails on a node: import and on a server sentinel', () => {
    const d = tmp({ 'assets/a.js': 'import{readFileSync as r}from"node:fs";', 'assets/b.js': 'x="SECRET_1"' })
    expect(() => assertClientClean(d, { forbiddenSentinels: ['SECRET_1'] })).toThrow(/node:fs[\s\S]*SECRET_1|SECRET_1[\s\S]*node:fs/)
  })

  it('a "node:fs" STRING that is not an import is not flagged', () => {
    const d = tmp({ 'assets/a.js': 'const msg="use node:fs on the server"' })
    expect(() => assertClientClean(d, { forbiddenSentinels: [] })).not.toThrow()
  })

  it('refuses a missing or JS-less directory instead of passing vacuously', () => {
    expect(() => assertClientClean('/definitely/not/here', { forbiddenSentinels: [] })).toThrow(/does not exist/)
    const d = tmp({ 'index.html': '<html></html>' })
    expect(() => assertClientClean(d, { forbiddenSentinels: [] })).toThrow(/no \.js files/)
  })
})

describe('zero-app-checks — first-load JS', () => {
  const app = (): string =>
    tmp({
      'index.html':
        '<script type="module" crossorigin src="/assets/entry.js"></script><link rel="modulepreload" href="/assets/pre.js">',
      'assets/entry.js': 'import"./dep.js";const l=()=>import("./lazy.js");',
      'assets/dep.js': 'export const d=1',
      'assets/pre.js': 'export const p=2',
      'assets/lazy.js': 'x'.repeat(5000),
    })

  it('sums entry + preloads + static closure, excluding dynamic imports', () => {
    const d = app()
    expect(firstLoadJsGzip(join(d, 'index.html'), d).files).toBe(3)
  })

  it('judges a built route against its ceiling file, in the mode the environment names', () => {
    const d = app()
    const budgets = join(d, 'budgets')
    const routes = { '/': join(d, 'index.html') }
    const run = (mode: string | undefined, fn: () => void): (() => void) => () => {
      const before = { mode: process.env.PYREON_SIZE_MODE, out: process.env.PYREON_SIZE_ROUTES_OUT }
      delete process.env.PYREON_SIZE_ROUTES_OUT
      if (mode === undefined) delete process.env.PYREON_SIZE_MODE
      else process.env.PYREON_SIZE_MODE = mode
      try {
        fn()
      } finally {
        if (before.mode === undefined) delete process.env.PYREON_SIZE_MODE
        else process.env.PYREON_SIZE_MODE = before.mode
        if (before.out !== undefined) process.env.PYREON_SIZE_ROUTES_OUT = before.out
      }
    }
    const check = (): void => checkRouteSizes('x', d, routes, budgets)

    // No ceiling at all fails in every mode, a local run included.
    expect(run(undefined, check)).toThrow(/has no ceiling/)

    writeCeiling(budgets, 'routes', 'x:/', 1)
    // The default branch fails a route over its ceiling …
    expect(run('main', check)).toThrow(/over its ceiling of 1 B/)
    // … a local run reports it and leaves the verdict to CI.
    expect(run(undefined, check)).not.toThrow()

    writeCeiling(budgets, 'routes', 'x:/', 100000)
    expect(run('main', check)).not.toThrow()
    // A ceiling whose route was not measured is guarding nothing: it fails.
    writeCeiling(budgets, 'routes', 'x:/gone', 100000)
    expect(run('main', check)).toThrow(/x:\/gone: has a ceiling but was not measured/)
  })

  it('records sizes instead of judging when CI names an output file', () => {
    const d = app()
    const out = join(d, 'routes.json')
    const before = process.env.PYREON_SIZE_ROUTES_OUT
    process.env.PYREON_SIZE_ROUTES_OUT = out
    try {
      // No ceiling exists, and this still does not throw: the verdict belongs
      // to the `Check Route Budgets` step that reads the file.
      checkRouteSizes('x', d, { '/': join(d, 'index.html') }, join(d, 'budgets'))
    } finally {
      if (before === undefined) delete process.env.PYREON_SIZE_ROUTES_OUT
      else process.env.PYREON_SIZE_ROUTES_OUT = before
    }
    const recorded = JSON.parse(readFileSync(out, 'utf8')) as Record<string, number>
    expect(recorded['x:/']).toBe(firstLoadJsGzip(join(d, 'index.html'), d).bytes)
  })

  it('maps a route to its directory-format HTML', () => {
    expect(routeHtmlMap('/dist', ['/', '/about', '/a/b'])).toEqual({
      '/': join('/dist', 'index.html'),
      '/about': join('/dist', 'about', 'index.html'),
      '/a/b': join('/dist', 'a', 'b', 'index.html'),
    })
  })
})
