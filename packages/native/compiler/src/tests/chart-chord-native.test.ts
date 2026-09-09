// `<ChordChart>` on native — the family lands with the same shape as its
// neighbours (a `PyreonChartCanvas` over `renderChord(layoutChord(…))`), and
// the point of compiling it on BOTH toolchains is that the two fail
// differently: the Swift half of this took an `invalid redeclaration of 'TAU'`
// and a `cannot find 'Number' in scope` that no warning count would have shown.

import { describe, expect, it } from 'vitest'
import { CHART_HOSTS } from '../chart-hosts'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const CHORD = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { ChordChart } from '@pyreon/charts/plot'
import type { ChordLink, ChordNode } from '@pyreon/charts/plot'
export function Trade() {
  const nodes = signal<ChordNode[]>([{ name: 'EU' }, { name: 'US' }, { name: 'CN' }])
  const links = signal<ChordLink[]>([
    { source: 'EU', target: 'US', value: 10 },
    { source: 'US', target: 'CN', value: 6 },
    { source: 'CN', target: 'EU', value: 4 },
  ])
  return (
    <Stack>
      <Text>Trade</Text>
      <ChordChart animate={false} nodes={nodes()} links={links()} height={300} data-testid="trade" title="Trade flows" />
    </Stack>
  )
}`

describe('<ChordChart> lowers', () => {
  it('is registered as a LOWERED host, not an unlowered one', () => {
    // The registry is what stops a chart tag falling through to the generic
    // component path and emitting a phantom component.
    expect(Object.hasOwn(CHART_HOSTS, 'ChordChart')).toBe(true)
  })

  it('Swift: a canvas over renderChord(layoutChord(…)) with the web host box', () => {
    const r = transform(CHORD, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('GeometryReader { pyreonGeo in')
    expect(r.code).toContain(
      'PyreonChartCanvas(cmds: renderChord(layoutChord(nodes, links, PyreonChartRect(x: 8.0, y: 8.0, w: max(0.0, Double(pyreonGeo.size.width) - 16.0), h: max(0.0, 300.0 - 16.0)), pyreonOptions), pyreonOptions))',
    )
    expect(r.code).toContain('}.frame(height: 300.0)')
    expect(r.code).toContain('.accessibilityLabel("Trade flows")')
    expect(r.code).toContain('.accessibilityIdentifier("trade")')
  })

  it('Kotlin: the same call, sized by BoxWithConstraints', () => {
    const r = transform(CHORD, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('renderChord(layoutChord(nodes, links,')
  })

  it('a missing links prop warns BY NAME rather than drawing an empty ring', () => {
    const r = transform(
      `import { ChordChart } from '@pyreon/charts/plot'
export function C() { return <ChordChart animate={false} nodes={[]} /> }`,
      { target: 'swift' },
    )
    expect(r.warnings.join('\n')).toContain('<ChordChart>: needs a `links` attribute on native')
    expect(r.code).toContain('EmptyView()')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift TYPECHECKS against the real engine', () => {
    const r = transform(CHORD, { target: 'swift' })
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin TYPECHECKS', () => {
    const r = transform(CHORD, { target: 'kotlin' })
    const v = validateKotlin(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})
