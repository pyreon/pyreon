// `for (let i = 0, n = xs.length; i < n; i++)` — the "cache the bound" idiom.
// A native range loop evaluates its bound once, which is what caching it in a
// second declarator does in JS, so when the extra names are read only in the
// test, inlining them into the test and lowering the ordinary count loop is
// exact. Any other use of an extra name keeps the loop warned, by name.
import { describe, expect, it } from 'vitest'
import { validateKotlin, validateSwiftWithStubs } from '../validate'
import { transform } from './first-party-plugins'

const app = (helper: string) =>
  `import { Text } from '@pyreon/primitives'\n${helper}\nexport function App() { return <Text>{String(sum([1, 2]))}</Text> }`

const CACHED = `function sum(xs: number[]): number { let t = 0; for (let i = 0, n = xs.length; i < n; i++) { t += xs[i] } return t }`

describe('for loop with a cached bound', () => {
  it('Swift: lowers to a range over the inlined bound, and compiles', () => {
    const r = transform(app(CACHED), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('for i in 0..<xs.count {')
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it('Kotlin: lowers to a range over the inlined bound, and compiles', () => {
    const r = transform(app(CACHED), { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('for (i in 0L until xs.length) {')
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  for (const [label, helper] of [
    ['the extra name is used in the body', `function sum(xs: number[]): number { let t = 0; for (let i = 0, n = xs.length; i < n; i++) { t += n } return t }`],
    ['the extra initialiser reads the counter', `function sum(xs: number[]): number { let t = 0; for (let i = 0, n = i + 3; i < n; i++) { t += i } return t }`],
    ['the extra name is never read (its initialiser would be dropped)', `function sum(xs: number[]): number { let t = 0; for (let i = 0, j = xs.pop(); i < 2; i++) { t += i } return t }`],
  ] as const) {
    it(`still warns, by name, when ${label}`, () => {
      const r = transform(app(helper), { target: 'swift' })
      expect(r.warnings.some((w) => w.includes('cached bound'))).toBe(true)
      expect(r.code).not.toContain('for i in')
    })
  }

  it('an ordinary single-declarator loop is unchanged', () => {
    const r = transform(app(`function sum(xs: number[]): number { let t = 0; for (let i = 0; i < xs.length; i++) { t += xs[i] } return t }`), { target: 'swift' })
    expect(r.code).toContain('for i in 0..<xs.count {')
  })
})
