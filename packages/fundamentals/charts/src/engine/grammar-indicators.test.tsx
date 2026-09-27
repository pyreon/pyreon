// Indicators as grammar marks: `<Sma>`, `<Ema>`, `<Trend>`, `<Bollinger>`.
//
// They are the array form's `sma(...)`, `ema(...)`, `trend(...)` and
// `...bollinger(...)` spelled as children, so the contract is that both
// spellings resolve to the SAME marks with the SAME values. The native
// compiler desugars the tags to those calls, and its copy of the tag table is
// asserted against `GRAMMAR_INDICATOR_TAGS` in
// `packages/native/compiler/src/tests/chart-grammar-tags.test.ts`.

import { describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import * as plot from '../engine'
import { resolveGrammar } from './grammar'
import { bollinger, ema, sma, trend } from './indicators'
import type { Mark } from './marks'

interface Row { d: string; v: number; s: string }
const ROWS: Row[] = [3, 5, 4, 8, 6, 9, 7, 12].map((v, i) => ({ d: `d${i}`, v, s: 'a' }))
const RAW = ROWS.map((r) => r.v)

/** Every indicator tag and the array-form constructor it stands for. */
export const GRAMMAR_INDICATOR_TAGS: Readonly<Record<string, string>> = {
  Sma: 'sma',
  Ema: 'ema',
  Trend: 'trend',
  Bollinger: 'bollinger',
}

/** What a mark draws: the engine applies `transform` to the accessor's values. */
function drawn(m: Mark<Row>, raw: number[]): { kind: string; values: number[]; values2?: number[] } {
  const values = m.transform ? m.transform(raw) : raw
  return m.transform2 ? { kind: m.kind, values, values2: m.transform2(raw) } : { kind: m.kind, values }
}

const resolve = (tag: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  resolveGrammar<Row>(ROWS, { data: ROWS, x: 'd', ...extra }, [h((plot as unknown as Record<string, never>)[tag]!, props as never)])

describe('indicator marks', () => {
  it('every tag ships as a component', () => {
    for (const tag of Object.keys(GRAMMAR_INDICATOR_TAGS)) expect(typeof (plot as Record<string, unknown>)[tag], tag).toBe('function')
  })

  it('<Sma> draws what sma() draws', () => {
    const g = resolve('Sma', { y: 'v', window: 3, label: 'SMA 3' })
    const direct = sma<Row>((r) => r.v, 3)
    expect(g.marks.map((m) => drawn(m, RAW))).toEqual([drawn(direct, RAW)])
    expect(g.marks[0]!.options.label).toBe('SMA 3')
  })

  it('<Ema> draws what ema() draws', () => {
    const g = resolve('Ema', { y: 'v', window: 4 })
    expect(g.marks.map((m) => drawn(m, RAW))).toEqual([drawn(ema<Row>((r) => r.v, 4), RAW)])
  })

  it('<Trend> draws what trend() draws', () => {
    const g = resolve('Trend', { y: 'v' })
    expect(g.marks.map((m) => drawn(m, RAW))).toEqual([drawn(trend<Row>((r) => r.v), RAW)])
  })

  it('<Bollinger> is two marks, a band and its middle line, as bollinger() is', () => {
    const g = resolve('Bollinger', { y: 'v', window: 3, k: 1.5 })
    const direct = bollinger<Row>((r) => r.v, 3, 1.5)
    expect(g.marks.map((m) => m.kind)).toEqual(['band', 'line'])
    expect(g.marks.map((m) => drawn(m, RAW))).toEqual(direct.map((m) => drawn(m, RAW)))
    expect(g.marks.map((m) => m.options.label)).toEqual(['Bollinger band', 'Bollinger middle'])
  })

  it('<Bollinger> defaults k to 2', () => {
    const g = resolve('Bollinger', { y: 'v', window: 3 })
    expect(g.marks.map((m) => drawn(m, RAW))).toEqual(bollinger<Row>((r) => r.v, 3).map((m) => drawn(m, RAW)))
  })

  it('a missing or non-positive window skips the mark and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(resolve('Sma', { y: 'v' }).marks).toEqual([])
      expect(resolve('Ema', { y: 'v', window: 0 }).marks).toEqual([])
      expect(warn.mock.calls.some((c) => String(c[0]).includes('<Sma> needs a `window`'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  it('under a long-format pivot each series gets its own indicator over its own column', () => {
    // Two series interleaved; the pivot splits them into columns and the
    // indicator must run over each column, not over the placeholder zeros.
    const rows: Row[] = [
      { d: 'd0', v: 1, s: 'a' }, { d: 'd0', v: 10, s: 'b' },
      { d: 'd1', v: 3, s: 'a' }, { d: 'd1', v: 30, s: 'b' },
      { d: 'd2', v: 5, s: 'a' }, { d: 'd2', v: 50, s: 'b' },
    ]
    const g = resolveGrammar<Row>(rows, { data: rows, x: 'd', color: 's' }, [h(plot.Sma as never, { y: 'v', window: 2 } as never)])
    expect(g.marks.map((m) => m.options.label)).toEqual(['a', 'b'])
    // The placeholder accessor returns zeros; `transform` ignores its input
    // and uses the pivoted column, so pass anything.
    expect(g.marks.map((m) => m.transform!([]))).toEqual([
      sma<number>((x) => x, 2).transform!([1, 3, 5]),
      sma<number>((x) => x, 2).transform!([10, 30, 50]),
    ])
  })
})
