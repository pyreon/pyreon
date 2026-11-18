import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { _resetCurrencies } from '../currency'
import * as decimal from '../decimal'
import * as fp from '../fp'
import * as money from '../index'
import manifest from '../manifest'

/**
 * Executes every `// =>` line of the manifest examples and every `@example <code> // => <value>` line of the source JSDoc, so
 * the output the docs and the editor show is the output the package produces. Also checks the package's shape.
 */
const SRC = join(import.meta.dirname, '..')
const ROOT = join(SRC, '..')

function run(scope: Record<string, unknown>, code: string, expected: string): void {
  const names = Object.keys(scope)
  const parts = code.split('; ')
  const last = parts.pop()!
  const body = `${parts.join(';\n')}${parts.length > 0 ? ';\n' : ''}return [${last}, ${expected}]`
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^"use strict";\n?/, '')
  const [actual, want] = new Function(...names, js)(...names.map((n) => scope[n])) as [unknown, unknown]

  expect(actual).toEqual(want)
}

function lines(example: string): { code: string; expected: string }[] {
  const out: { code: string; expected: string }[] = []
  const setup: string[] = []

  for (const line of example.split('\n')) {
    const m = /^(.*?)\s+\/\/ => (.*)$/.exec(line)

    if (line.startsWith('import ') || line.trim() === '') continue
    if (m === null) setup.push(line)
    else out.push({ code: [...setup, m[1]!].join('; '), expected: m[2]! })
  }

  return out
}

const scopeOf = (name: string): Record<string, unknown> => (name.startsWith('fp.') ? { ...money, ...fp } : name.startsWith('decimal.') ? { ...money, ...decimal } : { ...money })

describe('examples run and print what they claim', () => {
  afterEach(() => _resetCurrencies())

  const fromManifest = manifest.api.filter((a) => a.kind !== 'type' && a.example !== undefined).flatMap((a) => lines(a.example!).map((l) => [`${a.name}: ${l.code}`, a.name, l] as const))

  it('finds a worthwhile number of manifest examples', () => {
    expect(fromManifest.length).toBeGreaterThan(50)
  })

  it.each(fromManifest)('manifest %s', (_label, name, l) => {
    run(scopeOf(name), l.code, l.expected)
  })

  const files = ['money.ts', 'decimal.ts', 'currency.ts', 'fp.ts']
  const fromSource = files.flatMap((file) =>
    readFileSync(join(SRC, file), 'utf8')
      .split('\n')
      .flatMap((text) => {
        const m = /^\s*\*\s*@example (.*?) \/\/ => (.*)$/.exec(text)

        return m === null ? [] : [[`${file}: ${m[1]}`, file, { code: m[1]!, expected: m[2]! }] as const]
      }),
  )

  it.each(fromSource)('jsdoc %s', (_label, file, l) => {
    run(file === 'fp.ts' ? { ...money, ...fp } : file === 'decimal.ts' ? { ...decimal } : { ...money }, l.code, l.expected)
  })

  it('every export has JSDoc with an @example', () => {
    const missing: string[] = []
    const exported = new Map<string, Set<string>>([
      ['money.ts', new Set(Object.keys(money))],
      ['decimal.ts', new Set(Object.keys(decimal))],
      ['currency.ts', new Set(Object.keys(money))],
      ['fp.ts', new Set(Object.keys(fp))],
    ])

    for (const file of files) {
      const text = readFileSync(join(SRC, file), 'utf8')

      for (const m of text.matchAll(/((?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?)export function (\w+)/g)) {
        if (exported.get(file)!.has(m[2]!) && !m[1]!.includes('@example')) missing.push(`${file} ${m[2]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('every runtime export is in the manifest', () => {
    const documented = new Set<string>(manifest.api.map((a) => a.name))
    const undocumented = [
      ...Object.keys(money).filter((n) => !documented.has(n)),
      ...Object.keys(decimal).filter((n) => !documented.has(`decimal.${n}`)),
      ...Object.keys(fp).filter((n) => !documented.has(`fp.${n}`) && !(n in money)),
    ]

    expect(undocumented).toEqual([])
  })
})

describe('the published shape', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: object; peerDependencies?: object; sideEffects: boolean; type: string; exports: Record<string, Record<string, string>> }

  it('has no dependencies and no peer dependencies, is ESM only and side-effect free', () => {
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.peerDependencies).toBeUndefined()
    expect(pkg.type).toBe('module')
    expect(pkg.sideEffects).toBe(false)
    expect(JSON.stringify(pkg.exports)).not.toMatch(/"require"|"default"/)
  })

  it('every exports target that points at source exists, and the three entries are the three promised', () => {
    expect(Object.keys(pkg.exports)).toEqual(['.', './decimal', './fp'])
    for (const target of Object.values(pkg.exports)) expect(existsSync(join(ROOT, target.bun!)), target.bun).toBe(true)
  })

  it('imports no @pyreon package and no node: module anywhere in src (outside tests)', () => {
    const offenders = readdirSync(SRC)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /from '(@pyreon\/|node:)/.test(readFileSync(join(SRC, f), 'utf8')) && f !== 'manifest.ts' && f !== 'manifest-parts.ts')

    expect(offenders).toEqual([])
  })

  it('importing the package runs nothing: no Intl lookup, no registry entry', async () => {
    const spy = vi.spyOn(Intl, 'supportedValuesOf')

    vi.resetModules()
    const fresh = await import('../index')
    const stats = await import('../currency')

    expect(spy).not.toHaveBeenCalled()
    expect(stats._currencyStats()).toEqual({ registered: 0, remembered: 0 })
    expect(typeof fresh.money).toBe('function')
    spy.mockRestore()
  })
})
