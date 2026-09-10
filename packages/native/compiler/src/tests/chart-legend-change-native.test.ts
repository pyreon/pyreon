// `<PlotChart onLegendChange>` on native.
//
// The hidden-series set was already held by the native legend toggle — this
// was the observer half, and it is the smallest of the five props that were
// waiting on host state. The two emitters route the NEW set through a local
// before the state write, so the handler sees the value the state settles on
// rather than re-reading `@State` / `mutableStateOf` inside the closure that
// just wrote it.

import { describe, expect, it } from 'vitest'
import { PLOT_UNLOWERED_PROPS, plotUnloweredWarning } from '../chart-hosts'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

// `x` is typed `(d, i) => string` on the web — a NUMERIC axis is `xValue`.
// Worth stating because the wrong shape is easy to write and PMTC emits
// uncompilable native for it with no warning (`[String]` mapped from an Int)
// rather than refusing: TypeScript rejects it first, so a user cannot reach
// that state, but a test fixture skips the typecheck and can.
const SRC = `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, line } from '@pyreon/charts/plot'
type Row = { label: string; a: number; b: number }
export function Trends() {
  const rows = signal<Row[]>([{ label: 'Jan', a: 2.5, b: 3.5 }, { label: 'Feb', a: 4.5, b: 1.5 }])
  const hidden = signal<number[]>([])
  const onLegendChange = (next: number[]) => { hidden.set(next) }
  return (
    <Stack>
      <PlotChart
        animate={false}
        data={rows()}
        x={(d: Row) => d.label}
        marks={[line((d: Row) => d.a), line((d: Row) => d.b)]}
        showLegend
        legendToggle
        onLegendChange={onLegendChange}
        height={240}
      />
    </Stack>
  )
}`

describe('<PlotChart onLegendChange> lowers', () => {
  it('is no longer listed as unlowered', () => {
    expect(PLOT_UNLOWERED_PROPS).not.toContain('onLegendChange')
    // …and the warning helper no longer has a reason for it, which is the
    // other direction: a prop can drop off the list and keep a stale reason.
    expect(plotUnloweredWarning('PlotChart', ['onLegendChange'])).not.toContain('unbuilt half')
  })

  it('Swift: fires with the NEW hidden set, after the state write', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let pyreonNextHidden = legendToggle(pyreonHidden, pyreonLegendHit)')
    expect(r.code).toContain('pyreonHidden = pyreonNextHidden')
    // The handler receives the local, NOT the state var — that is the whole
    // point of the local, so assert the argument rather than just the call.
    expect(r.code).toMatch(/onLegendChange\(pyreonNextHidden\)|let \w+ = pyreonNextHidden/)
  })

  it('Kotlin: the same shape', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val pyreonNextHidden = legendToggle(pyreonHidden, pyreonLegendHit)')
    expect(r.code).toContain('pyreonHidden = pyreonNextHidden')
  })

  it('a chart WITHOUT the handler still toggles, and emits no CALL', () => {
    // The toggle predates the observer; adding the observer must not make the
    // handler-less chart pay for it or change what it draws. Asserting on the
    // CALL rather than the name: the `const onLegendChange` declaration still
    // lowers to a func whether or not the chart uses it, so a name check
    // passes for the wrong reason.
    const without = SRC.replace('        onLegendChange={onLegendChange}\n', '')
    const r = transform(without, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('pyreonHidden = pyreonNextHidden')
    expect(r.code).not.toContain('onLegendChange(pyreonNextHidden)')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift TYPECHECKS', () => {
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin TYPECHECKS', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})
