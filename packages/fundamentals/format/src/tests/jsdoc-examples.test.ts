/**
 * The `@example` blocks in the JSDoc of the public functions are real: each `expr // output` line is evaluated
 * against the package and compared with the output shown (so hovering in an editor never teaches a wrong output).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as convertModule from '../convert'
import * as format from '../index'
import * as unitsModule from '../units'
import * as unitsCoreModule from '../units/core'
import { resetLocaleState } from '../locale'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

const norm = (v: unknown): unknown =>
  typeof v === 'string' ? v.replace(/[   ]/g, ' ') : Array.isArray(v) ? v.map(norm) : v

function examplesOf(file: string): Array<{ name: string; lines: string[] }> {
  const source = readFileSync(join(SRC, file), 'utf8')
  const out: Array<{ name: string; lines: string[] }> = []
  const re = /\/\*\*((?:(?!\*\/)[\s\S])*?)@example\s*\n\s*\*\s*```ts\n([\s\S]*?)\n\s*\*\s*```[\s\S]*?\*\/\s*\nexport function (\w+)/g
  for (const m of source.matchAll(re)) {
    out.push({ name: m[3] as string, lines: (m[2] as string).split('\n').map((l) => l.replace(/^\s*\*\s?/, '')) })
  }

  return out
}

afterEach(() => resetLocaleState())

describe.each([['core.ts', 25], ['index.ts', 25], ['convert.ts', 3], ['units/core.ts', 1], ['units.ts', 3]] as const)('JSDoc examples in %s', (file, atLeast) => {
  const found = examplesOf(file)

  it('has examples', () => {
    expect(found.length).toBeGreaterThan(atLeast - 1)
  })

  it.each(found.map((f) => [f.name, f.lines] as const))('%s', (_name, lines) => {
    const body: string[] = []
    const checks: Array<[string, string]> = []
    for (const raw of lines) {
      const line = raw.replace(/\((\w+): number\)/g, '($1)')
      const at = line.lastIndexOf(' // ')
      if (at === -1) {
        body.push(line)
        continue
      }
      const expr = line.slice(0, at).replace(/^;/, '')
      checks.push([expr, line.slice(at + 4)])
      body.push(`__check(${JSON.stringify(expr)}, () => (${expr}))`)
    }
    const results: unknown[] = []
    // The unit files document their own names (formatUnit there is the converting one), so each is evaluated in its own scope.
    const scope: Record<string, unknown> = file === 'units.ts' ? { ...format, ...unitsModule } : file === 'units/core.ts' ? { ...format, ...unitsCoreModule } : file === 'convert.ts' ? { ...format, ...convertModule } : { ...format }
    new Function(...Object.keys(scope), '__check', body.join('\n'))(...Object.values(scope), (_e: string, get: () => unknown) => results.push(get()))
    checks.forEach(([expr, shown], i) => {
      expect(norm(results[i]), expr).toEqual(norm(JSON.parse(shown)))
    })
  })
})
