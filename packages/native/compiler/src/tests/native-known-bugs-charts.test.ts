import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * Known `<OptionChart>` adapter bugs (packages/native/compiler/src/chart-hosts.ts).
 *
 * 1. A diagnostic about a bad series axis index printed the PARSED number, not
 *    what the user wrote: `yAxisIndex: 'x'` reported "yAxisIndex undefined names
 *    no declared y axis". The sibling `xAxisIndex` had no diagnostic at all — a
 *    non-lowering value was silently ignored — and both read the index off the
 *    raw field, so a module-const index (`yAxisIndex: RIGHT`) was misreported
 *    instead of honoured. Fix: `writtenValue()` prints the written value, both
 *    indices resolve through `literalOf`, and `xAxisIndex` gets a named warning.
 *
 * 2. An unpinned timeline lowers every step; when one fails it falls back to the
 *    current step, lowering it AGAIN — so the failure (and every warning the
 *    current step raises) was reported twice. Fix: `desugarOptionChart` gives the
 *    whole timeline lowering (step loop, fallback, wrappers) ONE de-duplicating
 *    reporter, replacing the loop-local dedup that the fallback bypassed.
 *
 * Bisect (each fix reverted alone against this file, both targets):
 *  - `writtenValue(axisIndexRaw)` → `${axisIndex}`: the 'x' and identifier specs
 *    fail (`expected [ Array(1) ] to deep equally contain '…yAxisIndex 'x'…'`;
 *    the emitted text was `yAxisIndex undefined names no declared y axis`).
 *  - `literalOf` resolution dropped: the const spec fails
 *    (`expected [ Array(1) ] to deeply equal []` — the const read as undefined).
 *  - xAxisIndex warning disabled: `expected [] to deep equally contain '…xAxisIndex…'`.
 *  - `reportOnce` dropped (plain `warn`): both timeline specs fail with
 *    `expected [ …(2) ] to have a length of 1 but got 2`.
 *  Restored: 12/12. Existing chart suites (77 files, 1003 tests, incl. every
 *  swiftc/kotlinc compile spec) pass unchanged, so valid options emit as before.
 */
const src = (opt: string, pre = '') => `
import { OptionChart } from '@pyreon/charts/option'
${pre}
export function App() { return <OptionChart option={${opt}} height={240} /> }`

const cartesian = (series: string) => `{ xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: [{}, {}], series: [${series}] }`

describe.each(['swift', 'kotlin'] as const)('OptionChart known bugs on %s', (target) => {
  const check = (code: string) => {
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(code)).toMatchObject({ ok: true })
  }

  it("a non-numeric yAxisIndex is printed as written ('x'), not as undefined", () => {
    const r = transform(src(cartesian(`{ type: 'bar', data: [1, 2], yAxisIndex: 'x' }`)), { target })
    expect(r.warnings).toContainEqual("<OptionChart option.series[0].yAxisIndex>: yAxisIndex 'x' names no declared y axis; the series uses the left axis.")
    expect(r.warnings.join('\n')).not.toContain('undefined')
  })

  it('an unresolvable identifier yAxisIndex is named, not printed as undefined', () => {
    const r = transform(src(cartesian(`{ type: 'bar', data: [1, 2], yAxisIndex: someIndex }`)), { target })
    expect(r.warnings.some((w) => w.includes('yAxisIndex `someIndex` (not a static value)'))).toBe(true)
    expect(r.warnings.join('\n')).not.toContain('undefined')
  })

  it('a module-const yAxisIndex resolves and places the series on the right axis', () => {
    const viaConst = transform(src(cartesian(`{ type: 'bar', data: [1, 2], yAxisIndex: RIGHT }`), 'const RIGHT = 1'), { target })
    const viaLiteral = transform(src(cartesian(`{ type: 'bar', data: [1, 2], yAxisIndex: 1 }`), 'const RIGHT = 1'), { target })
    expect(viaConst.warnings).toEqual([])
    expect(viaConst.code).toBe(viaLiteral.code)
    check(viaConst.code)
  })

  it('a non-lowering xAxisIndex gets a named warning printing the written value', () => {
    const r = transform(src(cartesian(`{ type: 'bar', data: [1, 2], xAxisIndex: 'x' }`)), { target })
    expect(r.warnings).toContainEqual("<OptionChart option.series[0].xAxisIndex>: xAxisIndex 'x' names no declared x axis; the series uses the first x axis.")
    const noSecond = transform(src(cartesian(`{ type: 'bar', data: [1, 2], xAxisIndex: 1 }`)), { target })
    expect(noSecond.warnings).toContainEqual("<OptionChart option.series[0].xAxisIndex>: xAxisIndex 1 names no declared x axis; the series uses the first x axis.")
    const ok = transform(src(cartesian(`{ type: 'bar', data: [1, 2], xAxisIndex: 0 }`)), { target })
    expect(ok.warnings).toEqual([])
  })

  const timeline = (step0: string, step1: string) => `{ baseOption: { timeline: { data: ['a', 'b'] }, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar' }] }, options: [{ series: [${step0}] }, { series: [${step1}] }] }`

  it('a timeline whose current step fails reports the failure once', () => {
    const r = transform(src(timeline(`{ data: [1, 'q'] }`, `{ data: [3, 4] }`)), { target })
    const msg = '<OptionChart option.series[0].data>: native cartesian series need one literal numeric value per xAxis category; emitting nothing.'
    expect(r.warnings.filter((w) => w === msg)).toHaveLength(1)
  })

  it("a timeline whose OTHER step fails reports the current step's warning once", () => {
    const r = transform(src(timeline(`{ data: [1, 2], yAxisIndex: 7 }`, `{ data: [3, 'q'] }`)), { target })
    const axis = '<OptionChart option.series[0].yAxisIndex>: yAxisIndex 7 names no declared y axis; the series uses the left axis.'
    expect(r.warnings.filter((w) => w === axis)).toHaveLength(1)
    expect(r.warnings.filter((w) => w.includes('need one literal numeric value'))).toHaveLength(1)
  })
})
