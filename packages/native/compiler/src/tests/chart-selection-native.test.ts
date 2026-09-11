// `<PlotChart selectedMode onSelectChange>` on native.
//
// A tap pins a datum, the engine draws the pinned outline from
// `ChartSpec.emphasis`, and the change reports. This is the half of the events
// model a touch target actually has: `emphasis`'s hover band and `onHighlight`
// are mouseover-driven and stay declined by NAME, with reasons that say so
// rather than implying unbuilt work.

import { describe, expect, it } from 'vitest'
import { PLOT_UNLOWERED_PROPS, plotUnloweredWarning } from '../chart-hosts'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const chart = (attrs: string): string => `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts/plot'
type Row = { label: string; v: number }
export function P() {
  const rows = signal<Row[]>([{ label: 'a', v: 1.5 }, { label: 'b', v: 2.5 }])
  const sel = signal<number[]>([])
  const onSelectChange = (next: number[]) => { sel.set(next) }
  return (
    <Stack>
      <PlotChart animate={false} data={rows()} x={(d: Row) => d.label} marks={[bars((d: Row) => d.v)]} ${attrs} height={220} />
    </Stack>
  )
}`

const MULTI = chart('selectedMode="multiple" onSelectChange={onSelectChange}')
const SINGLE = chart('selectedMode="single" onSelectChange={onSelectChange}')

describe('<PlotChart selectedMode> lowers', () => {
  it('selectedMode and onSelectChange are no longer listed as unlowered', () => {
    expect(PLOT_UNLOWERED_PROPS).not.toContain('selectedMode')
    expect(PLOT_UNLOWERED_PROPS).not.toContain('onSelectChange')
  })

  it('the two that REMAIN say they are a decline, not unbuilt work', () => {
    // The old reasons ("waits on the same emphasis state") read as a backlog
    // item. Both are hover-driven, which is a wall on a touch target — the
    // distinction a reader needs, and the one this table exists to draw.
    const why = plotUnloweredWarning('PlotChart', ['emphasis', 'onHighlight'])
    expect(why).toContain('HOVER')
    expect(why).toContain('no hover state')
    expect(why).not.toContain('waits on')
    // …and emphasis says the part that DOES cross, so a reader is not told a
    // capability is missing when the pinned outline works.
    expect(why).toContain('selectedMode')
  })

  it('Swift: taps once, pins through the shared helper, reports the new set', () => {
    const r = transform(MULTI, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var pyreonSelected: [Int] = []')
    // The hit is computed ONCE and reused — the pin, the callback and any
    // onSelect must name the same pick.
    expect(r.code).toContain('let pyreonPick = plotHitBars(')
    expect(r.code).toContain('let pyreonNextSel = pinSelection(pyreonSelected, pyreonPick, true)')
    expect(r.code).toContain('pyreonSelected = pyreonNextSel')
    expect(r.code).toContain('onSelectChange(pyreonNextSel)')
  })

  it('Kotlin: the same shape over remembered state', () => {
    const r = transform(MULTI, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var pyreonSelected by remember { mutableStateOf(listOf<Int>()) }')
    expect(r.code).toContain('val pyreonNextSel = pinSelection(pyreonSelected, pyreonPick, true)')
    expect(r.code).toContain('pyreonSelected = pyreonNextSel')
  })

  it('single vs multiple reaches the helper as the flag, on both targets', () => {
    // The whole difference between the two modes lives in that boolean, so it
    // is the one thing worth asserting per mode.
    expect(transform(SINGLE, { target: 'swift' }).code).toContain('pinSelection(pyreonSelected, pyreonPick, false)')
    expect(transform(SINGLE, { target: 'kotlin' }).code).toContain('pinSelection(pyreonSelected, pyreonPick, false)')
  })

  it('the pinned set reaches the DRAWN spec, not just the state', () => {
    // State nobody renders from is a chart that pins invisibly. `emphasis` is
    // what the engine reads to draw the outline.
    expect(transform(MULTI, { target: 'swift' }).code).toContain('emphasis: Emphasis(highlight: -1, selected: pyreonSelected)')
    expect(transform(MULTI, { target: 'kotlin' }).code).toContain('emphasis = Emphasis(highlight = -1, selected = pyreonSelected)')
  })

  it('a chart with ONLY selectedMode still installs a tap', () => {
    // It has no onSelect, no legend, no brush and no tooltip — nothing else
    // that would install a gesture. Before `pinning` joined that gate the pin
    // was emitted into a chart that never taps.
    const bare = transform(chart('selectedMode="single"'), { target: 'swift' })
    expect(bare.warnings).toEqual([])
    expect(bare.code).toContain('DragGesture(minimumDistance: 0)')
    expect(bare.code).toContain('pinSelection(')
  })

  it('a chart WITHOUT selectedMode gains no state and no pin', () => {
    const none = transform(chart('onSelect={(i: number) => { sel.set([i]) }}'), { target: 'swift' })
    expect(none.code).not.toContain('pyreonSelected')
    expect(none.code).not.toContain('pinSelection(')
    expect(none.code).not.toContain('emphasis:')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift TYPECHECKS', () => {
    const v = validateSwiftWithStubs(transform(MULTI, { target: 'swift' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin TYPECHECKS', () => {
    const v = validateKotlin(transform(MULTI, { target: 'kotlin' }).code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})
