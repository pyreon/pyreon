/**
 * Every `// → output` in the manifest examples is re-evaluated against the real
 * package and compared with the output shown. The docs cannot drift from the
 * code: this fails when a shown output is no longer what the call returns.
 *
 * Whitespace is normalised on both sides (CLDR uses no-break and narrow no-break
 * spaces that render as plain spaces in docs).
 */
import * as format from '../index'
import * as components from '../components'
import { h } from '@pyreon/core'
import manifest from '../manifest'
import { _resetLocaleState } from '../locale'

const normalise = (s: string): string => s.replace(/[   ]/g, ' ')
const show = (v: unknown): string => (typeof v === 'string' ? JSON.stringify(normalise(v)) : v === undefined ? 'undefined' : JSON.stringify(v))

const SCOPE = { ...format, ...components, h }

function evaluate(example: string): Array<{ expr: string; shown: string; actual: string }> {
  const checks: Array<{ expr: string; shown: string; actual: string }> = []
  const body: string[] = []
  for (const line of example.split('\n')) {
    const at = line.indexOf(' // → ')
    if (at === -1 || line.trimStart().startsWith('//')) {
      body.push(line)
      continue
    }
    const expr = line.slice(0, at).replace(/^;/, '')
    const shown = line.slice(at + ' // → '.length)
    body.push(`__check(${JSON.stringify(expr)}, ${JSON.stringify(shown)}, () => (${expr}))`)
  }
  const fn = new Function(...Object.keys(SCOPE), '__check', body.join('\n'))
  fn(...Object.values(SCOPE), (expr: string, shown: string, get: () => unknown) => {
    checks.push({ expr, shown, actual: show(get()) })
  })

  return checks
}

afterEach(() => _resetLocaleState())

const examples: Array<[string, string]> = [
  ['longExample', manifest.longExample],
  ...manifest.api.map((a): [string, string] => [a.name, a.example]),
]

describe('manifest examples are true', () => {
  it('has examples to check', () => {
    const total = examples.reduce((n, [, ex]) => n + ex.split('\n').filter((l) => l.includes(' // → ')).length, 0)
    expect(total).toBeGreaterThan(80)
  })

  it.each(examples)('%s', (_name, example) => {
    for (const { expr, shown, actual } of evaluate(example)) expect(actual, expr).toBe(shown)
  })

  it('every export of the reactive entry and the components entry has a manifest entry', () => {
    const documented = new Set(manifest.api.map((a) => a.name))
    for (const name of [...Object.keys(format), ...Object.keys(components)]) {
      if (name === 'machineValue' || name === 'partsToChildren') continue // internal helpers, exported for tests
      expect(documented, name).toContain(name)
    }
  })

  it('declares the tier that is true today, with a rationale', () => {
    expect(manifest.multiplatform.tier).toBe('web-only')
    expect(manifest.multiplatform.rationale).toMatch(/planned/)
  })
})
