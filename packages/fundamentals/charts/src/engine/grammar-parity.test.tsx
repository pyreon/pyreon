// The grammar and the array form must offer the same marks.
//
// They are two spellings of one spec — `<Plot><Bar y/></Plot>` resolves to
// the `marks={[bars(...)]}` props `<PlotChart>` takes — so a mark reachable
// through one and not the other is a hole.
//
// This test exists because `stackedArea` was added to the native compiler's
// tag map FIRST, quietly claiming a tag the web grammar had never heard of:
// the same source would have compiled natively and rendered nothing on the
// web. The compiler's copy of the table is asserted against this one in
// `packages/native/compiler/src/tests/chart-grammar-tags.test.ts` — it cannot
// be imported from here, because the charts package's `rootDir` does not
// contain it and a relative reach across packages breaks `tsc` for everyone.

import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import * as plot from '../plot'
import { resolveGrammar } from './grammar'

interface Row { m: string; a: number; b: number; lo: number; hi: number }
const ROWS: Row[] = [{ m: 'x', a: 2, b: 3, lo: 1, hi: 4 }]

/** Every mark tag the grammar ships, and the Series kind it must resolve to. */
export const GRAMMAR_TAG_KINDS: Readonly<Record<string, string>> = {
  Bar: 'bars',
  Line: 'line',
  Area: 'area',
  Dot: 'points',
  StackedArea: 'stackedArea',
  Band: 'band',
}

describe('grammar ⇄ array form', () => {
  it('every mark tag is exported as a component', () => {
    const missing = Object.keys(GRAMMAR_TAG_KINDS).filter((tag) => typeof (plot as Record<string, unknown>)[tag] !== 'function')
    expect(missing, 'these tags are claimed but ship no component').toEqual([])
  })

  it('each tag resolves to the Series kind it claims', () => {
    // Resolved through the real grammar, one tag at a time, so a tag wired to
    // the wrong factory is named rather than averaged away.
    const props: Record<string, Record<string, unknown>> = {
      Bar: { y: 'a' },
      Line: { y: 'a' },
      Area: { y: 'a' },
      Dot: { y: 'a' },
      StackedArea: { y: 'a' },
      Band: { low: 'lo', high: 'hi' },
    }
    for (const [tag, kind] of Object.entries(GRAMMAR_TAG_KINDS)) {
      const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'm' }, [
        h((plot as unknown as Record<string, never>)[tag]!, props[tag]! as never),
      ])
      expect(g.marks.map((m) => m.kind), `<${tag}>`).toEqual([kind])
    }
  })

  it('Band takes two channels, because a region has no single value', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'm' }, [h(plot.Band as never, { low: 'lo', high: 'hi' } as never)])
    const mark = g.marks[0]!
    expect(mark.kind).toBe('band')
    expect(typeof mark.y).toBe('function')
    expect(typeof mark.y2).toBe('function')
    expect(mark.y!(ROWS[0]!, 0)).toBe(4)
    expect(mark.y2!(ROWS[0]!, 0)).toBe(1)
  })
})
