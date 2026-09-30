// `const RowBar = Bar<Row>` — the typed way to write marks once per row type.
// An instantiation expression compiles to the component itself, so the alias
// IS the mark: the grammar resolves it by identity, with the row type checked.
import { describe, expect, expectTypeOf, it } from 'vitest'
import { h } from '@pyreon/core'
import { Bar, Line, resolveGrammar } from './grammar'
import type { BarProps } from './grammar'

interface Row { month: string; revenue: number; target: number }
const ROWS: Row[] = [{ month: 'Jan', revenue: 3, target: 5 }, { month: 'Feb', revenue: 6, target: 4 }]

const RowBar = Bar<Row>
const RowLine = Line<Row>

describe('typed mark aliases', () => {
  it('is the same component, so the chart resolves it as the mark it names', () => {
    expect(RowBar).toBe(Bar)
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'month' }, [h(RowBar, { y: 'revenue' }), h(RowLine, { y: (d: Row) => d.target })])
    expect(g.marks.map((m) => m.kind)).toEqual(['bars', 'line'])
  })

  it('checks channels against the row: a field name, and an accessor typed without annotation', () => {
    expectTypeOf<Parameters<typeof RowBar>[0]>().toEqualTypeOf<BarProps<Row>>()
    // @ts-expect-error — `revnue` is not a field of Row
    void (<RowBar y="revnue" />)
    // `d` is Row here, with no annotation.
    void (<RowLine y={(d) => d.revenue * 2} />)
  })
})
