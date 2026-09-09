// `<Bar showValues dash={[4,2]} axis="right" />` must mean what
// `bars(y, { showValues, dash, axis })` means.
//
// The grammar and the array form are two spellings of one spec, and the
// grammar's props inherit `MarkOptions` rather than restating it — so parity
// holds BY CONSTRUCTION today, through a rest-spread in `toMark`. Nothing
// asserted it. A refactor to a field-by-field map would break it silently,
// which is the exact class this branch spent five commits closing.
import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { Bar, Line, resolveGrammar } from './grammar'
import { resolveMarks } from './marks'
import { smooth } from './curve'
import type { MarkOptions } from './marks'

interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'a', v: 3 }, { m: 'b', v: 6 }]

/**
 * Every `MarkOptions` field, with a value distinguishable from its default.
 *
 * A `Record<keyof MarkOptions, unknown>` so a field added to the options does
 * not compile until it is given a value here — the same totality discipline
 * `series-channels.test.ts` applies to `Series`.
 */
const EVERY: Readonly<Record<keyof MarkOptions, unknown>> = {
  label: 'Custom',
  color: '#abcdef',
  width: 7,
  radius: 9,
  curve: smooth,
  showValues: true,
  axis: 'right',
  effect: true,
  symbol: 'diamond',
  symbolRepeat: true,
  borderRadius: 4,
  gradient: { from: '#111', to: '#222' },
  dash: [4, 2],
  negativeColor: '#ff0000',
}

describe('grammar ⇄ array option parity', () => {
  it('every MarkOptions field set on a grammar mark reaches the resolved series', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: (d: Row) => d.m }, [h(Bar<Row>, { y: (d: Row) => d.v, ...EVERY })])
    const viaGrammar = resolveMarks(ROWS, g.marks)
    const viaArray = resolveMarks(ROWS, [
      // The array form of the same thing, built from the SAME object.
      { kind: 'bars', y: (d: Row) => d.v, options: EVERY as MarkOptions, r: undefined, transform: undefined, errorLow: undefined, errorHigh: undefined },
    ])
    expect(viaGrammar).toEqual(viaArray)
  })

  it('and the parity is not vacuous — the options actually change the series', () => {
    // Without this, a `toMark` that dropped EVERY option would still pass the
    // spec above, because both sides would be equally empty.
    const bare = resolveMarks(ROWS, [
      { kind: 'bars', y: (d: Row) => d.v, options: {}, r: undefined, transform: undefined, errorLow: undefined, errorHigh: undefined },
    ])
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: (d: Row) => d.m }, [h(Bar<Row>, { y: (d: Row) => d.v, ...EVERY })])
    const rich = resolveMarks(ROWS, g.marks)
    expect(rich[0]).not.toEqual(bare[0])
    // Spot-check the ones a rest-spread would drop first: they are not part
    // of the mark's own signature, only of its options bag.
    expect(rich[0]!.label).toBe('Custom')
    expect(rich[0]!.showValues).toBe(true)
    expect(rich[0]!.axis).toBe('right')
    expect(rich[0]!.dash).toEqual([4, 2])
  })

  it('the error channels cross too — they are Channels on the grammar, accessors in the array', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: (d: Row) => d.m }, [h(Line<Row>, { y: (d: Row) => d.v, errorLow: (d: Row) => d.v - 1, errorHigh: (d: Row) => d.v + 1 })])
    const s = resolveMarks(ROWS, g.marks)
    expect(s[0]!.errLow).toEqual([2, 5])
    expect(s[0]!.errHigh).toEqual([4, 7])
  })
})
