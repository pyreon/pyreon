import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertClientClean,
  assertRouteBudgets,
  firstLoadJsGzip,
  staticImports,
} from '../../../../../scripts/zero-app-checks'

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

  it('fails over budget and on a route with no budget', () => {
    const d = app()
    const budgets = join(d, 'b.json')
    writeFileSync(budgets, JSON.stringify({ budgets: { 'x:/': 1 } }))
    expect(() => assertRouteBudgets('x', d, { '/': join(d, 'index.html') }, budgets)).toThrow(/budget 1 B/)
    expect(() => assertRouteBudgets('x', d, { '/other': join(d, 'index.html') }, budgets)).toThrow(/no budget/)
    writeFileSync(budgets, JSON.stringify({ budgets: { 'x:/': 100000 } }))
    expect(() => assertRouteBudgets('x', d, { '/': join(d, 'index.html') }, budgets)).not.toThrow()
  })
})
