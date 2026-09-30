// A chart's axis formatter is called with a Double on both targets. Every
// way to write one must lower to something that COMPILES there — a string
// assertion only shows the emitter agrees with itself. The named-function
// form was the hole: `function kg(v: number)` lowered its parameter to Int,
// so the `(Double) -> String` slot rejected it on iOS and Android alike, with
// no warning at compile time.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const src = (jsx: string, extra = ''): string => `import { Axis, Chart, Line, date, percent } from '@pyreon/charts'
interface Row { d: string; v: number }
const ROWS: Row[] = [{ d: 'a', v: 1.5 }]
function kg(v: number): string { return v.toFixed(1) + ' kg' }
${extra}
export function C() {
  function tons(v: number): string { return (v / 1000).toFixed(2) + ' t' }
  return ${jsx}
}
`

const cases: [string, string][] = [
  ['date() literal', `<Chart data={ROWS} x="d"><Line y="v" /><Axis x format={date('D MMM')} /></Chart>`],
  ['inline arrow', `<Chart data={ROWS} x="d"><Line y="v" /><Axis y format={(v) => v.toFixed(1) + ' kg'} /></Chart>`],
  ['a named module function', `<Chart data={ROWS} x="d"><Line y="v" /><Axis y format={kg} /></Chart>`],
  ['a named component-local function', `<Chart data={ROWS} x="d"><Line y="v" /><Axis y format={tons} /></Chart>`],
  ['a formatter factory', `<Chart data={ROWS} x="d"><Line y="v" /><Axis y format={percent(1)} /></Chart>`],
]

describe('chart axis formatters lower and compile on native', () => {
  for (const [name, jsx] of cases) {
    it(`${name}: no warning, compiles on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(src(jsx), { target })
        expect(r.warnings, `${target}: ${name}`).toEqual([])
        const v = target === 'swift' ? validateSwiftWithStubs(r.code) : validateKotlin(r.code)
        if (!v.skipped) expect(v.ok, `${target}: ${name}\n${v.error ?? ''}`).toBe(true)
      }
    }, 300_000)
  }

  it('a named formatter takes a Double, and a function that is NOT a formatter keeps its Int', () => {
    const r = transform(src(`<Chart data={ROWS} x="d"><Line y="v" /><Axis y format={kg} /></Chart>`, 'function count(n: number): string { return String(n) }'), { target: 'swift' })
    expect(r.code).toMatch(/func kg\(_ v: Double\)/)
    expect(r.code).toMatch(/func count\(_ n: Int\)/)
  })
})
