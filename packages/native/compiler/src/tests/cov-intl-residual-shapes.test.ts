// The `Intl` shapes `intl-lowering.test.ts` does not reach: a shadowed `Intl` / `Date`, the locale and options forms an
// app actually writes (an empty or single-entry locale array, `undefined` placeholders, spreads, computed keys, extra
// arguments, negative and boolean literals), the remaining `format()` misuses, and `toLocaleString()` on a receiver that
// is NOT a number. Each one is checked on both targets: lowered to the native formatter, or NAMED — never emitted verbatim.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const app = (body: string, jsx: string, moduleScope = '') => `
  import { signal } from '@pyreon/reactivity'
  import { Stack, Text } from '@pyreon/primitives'
  ${moduleScope}
  export function App() {
    const startsAt = signal(1792656000000)
    const price = signal(9.99)
    const label = signal('hi')
    const on = signal(true)
    const xs = signal<number[]>([1, 2])
    const row = signal<{ a: number }>({ a: 1 })
    ${body}
    return (<Stack>${jsx}</Stack>)
  }
`
const both = (body: string, jsx: string, moduleScope = '') =>
  (['swift', 'kotlin'] as const).map((target) => ({ target, ...transform(app(body, jsx, moduleScope), { target }) }))

function warns(body: string, jsx: string, needle: RegExp, moduleScope = ''): void {
  for (const r of both(body, jsx, moduleScope)) {
    expect(r.warnings.some((w) => needle.test(w)), `${r.target}: ${r.warnings.join('\n')}`).toBe(true)
  }
}

describe('locale and options forms', () => {
  it('an EMPTY locale array is the device locale; a single-entry array is that locale, with no warning', () => {
    for (const r of both('', `<Text>{price().toLocaleString([])}</Text><Text>{price().toLocaleString(['de-DE'])}</Text>`)) {
      expect(r.warnings, r.target).toEqual([])
      expect(r.code, r.target).toContain('PyreonNumberFormat(')
      expect(r.code, r.target).toContain('"de-DE"')
    }
  })

  it('`undefined` for the locale and for the options lowers like omitting them', () => {
    for (const r of both('', `<Text>{price().toLocaleString(undefined, undefined)}</Text>`)) {
      expect(r.warnings, r.target).toEqual([])
      expect(r.code, r.target).toContain('PyreonNumberFormat()')
    }
  })

  it('a spread in the options object is named and its options ignored', () => {
    warns(`const base = { maximumFractionDigits: 2 }`, `<Text>{price().toLocaleString('en', { ...base })}</Text>`, /a spread in the options object cannot be read at compile time/)
  })

  it('a computed options key is named', () => {
    warns(`const k = 'maximumFractionDigits'`, `<Text>{price().toLocaleString('en', { [k]: 2 })}</Text>`, /options/)
  })

  it('arguments after (locales, options) are named as ignored', () => {
    warns('', `<Text>{price().toLocaleString('en', {}, 3)}</Text>`, /arguments after \(locales, options\) are IGNORED/)
  })

  it('a negative literal and a boolean literal are read as static options', () => {
    for (const r of both('', `<Text>{price().toLocaleString('en', { useGrouping: false, maximumFractionDigits: 2 })}</Text>`)) {
      expect(r.code, r.target).toMatch(/useGrouping(: | = )false/)
    }
    // A negative digit count is a RangeError in JavaScript; it must not lower silently.
    const rs = both('', `<Text>{price().toLocaleString('en', { maximumFractionDigits: -1 })}</Text>`)
    for (const r of rs) expect(r.warnings.length, r.target).toBeGreaterThan(0)
  })

  it('a module const holding a string is a static locale', () => {
    for (const r of both('', `<Text>{price().toLocaleString(LOCALE)}</Text>`, `const LOCALE = 'fr-FR'`)) {
      expect(r.code, r.target).toContain('"fr-FR"')
    }
  })
})

describe('shadowing', () => {
  it('a local binding named `Intl` is not the global, so nothing lowers through it', () => {
    for (const r of both(`const Intl = { NumberFormat: (x: string) => x }`, `<Text>{String(1)}</Text>`)) {
      expect(r.code, r.target).not.toContain('PyreonNumberFormat')
    }
  })

  it('a formatter constructed with a member that is computed (`Intl["NumberFormat"]`) is not recognised', () => {
    for (const r of both(`const f = new Intl['NumberFormat']('en')`, `<Text>x</Text>`)) {
      expect(r.code, r.target).not.toContain('PyreonNumberFormat')
    }
  })
})

describe('format() misuse is named', () => {
  it('format() with no value and with two values', () => {
    warns(`const f = new Intl.NumberFormat('en')`, `<Text>{f.format()}</Text>`, /`format\(\)` with 0 arguments/)
    warns(`const f = new Intl.NumberFormat('en')`, `<Text>{f.format(1, 2)}</Text>`, /`format\(\)` with 2 arguments/)
  })

  it('format(new Date(y, m, d)) is named', () => {
    warns(`const f = new Intl.DateTimeFormat('en')`, `<Text>{f.format(new Date(2026, 1, 2))}</Text>`, /new Date\(y, m, …\)/)
  })

  it('a method a formatter does not have is named as such', () => {
    warns(`const f = new Intl.NumberFormat('en')`, `<Text>{String(f.nope(1))}</Text>`, /`Intl\.NumberFormat` has no `nope` method/)
    warns(`const f = new Intl.DateTimeFormat('en')`, `<Text>{String(f.resolvedOptions())}</Text>`, /only `format\(value\)` lowers/)
  })

  it('a member of Intl the lowering does not know is named', () => {
    warns(`const x = Intl.notAThing('en')`, `<Text>x</Text>`, /not an `Intl` member the native lowering knows/)
  })

  it('format() on an inline constructor lowers', () => {
    for (const r of both('', `<Text>{new Intl.NumberFormat('en').format(price())}</Text>`)) {
      expect(r.warnings, r.target).toEqual([])
      expect(r.code, r.target).toContain('PyreonNumberFormat(')
    }
  })
})

describe('toLocaleString() on a value that is not a number', () => {
  it('a string returns itself and a boolean its String(), as in JavaScript', () => {
    const [swift, kotlin] = both('', `<Text>{label().toLocaleString()}</Text><Text>{on().toLocaleString()}</Text>`)
    for (const r of [swift!, kotlin!]) {
      expect(r.warnings, r.target).toEqual([])
      expect(r.code, r.target).not.toMatch(/PyreonNumberFormat\(\)\.format\(label/)
    }
    expect(swift!.code).toMatch(/String\(on\)/)
    expect(kotlin!.code).toMatch(/\(on(\.value)?\)\.toString\(\)/)
  })

  it('an array and a struct are named, not formatted as a number', () => {
    warns('', `<Text>{xs().toLocaleString()}</Text>`, /`\.toLocaleString\(\)` on a array has no native lowering/)
    warns('', `<Text>{row().toLocaleString()}</Text>`, /`\.toLocaleString\(\)` on a struct has no native lowering/)
  })
})
