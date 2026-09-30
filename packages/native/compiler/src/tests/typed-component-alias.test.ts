// `const RevenueBar = Bar<Row>` — a TypeScript instantiation expression that
// fixes a component's type argument. It compiles to the component itself, so
// on native it must lower exactly like the component it names.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const header = `import { Bar, Chart, Line } from '@pyreon/charts'
interface Row { month: string; revenue: number; target: number }
const ROWS: Row[] = [{ month: 'Jan', revenue: 1, target: 2 }]
`

describe('typed component aliases (`const X = Mark<Row>`)', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: an alias lowers byte-identically to the mark it names`, () => {
      const aliased = transform(
        `${header}const RowBar = Bar<Row>
const RowLine = Line<Row>
export function C() { return <Chart data={ROWS} x="month"><RowBar y="revenue" /><RowLine y="target" /></Chart> }
`,
        { target },
      )
      const plain = transform(`${header}export function C() { return <Chart data={ROWS} x="month"><Bar y="revenue" /><Line y="target" /></Chart> }
`, { target })
      expect(aliased.warnings).toEqual(plain.warnings)
      expect(aliased.code).toBe(plain.code)
    })
  }

  it('an alias of an alias resolves to the root component', () => {
    const r = transform(`${header}const A = Bar<Row>
const B = A<Row>
export function C() { return <Chart data={ROWS} x="month"><B y="revenue" /></Chart> }
`, { target: 'swift' })
    expect(r.code).not.toMatch(/\bB\(/)
    expect(r.warnings).toEqual([])
  })
})
