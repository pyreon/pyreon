// Map holes and the web-only state props on native: a `GeoShape[]` const with inner rings lowers and compiles on both
// targets (the engine fills them even-odd), and the props that have no native lowering are warned BY NAME.
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './charts-plugin'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = (extra: string): string => `
import { MapChart } from '@pyreon/charts'
import type { GeoShape } from '@pyreon/charts'
const SHAPES: GeoShape[] = [
  {
    name: 'A',
    rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]],
    holes: [[{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 6 }, { x: 3, y: 6 }]],
    holeHost: [0],
  },
  { name: 'B', rings: [[{ x: 12, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }]] },
]
export function App() {
  return <MapChart map={SHAPES} values={{ A: 1, B: 2 }} height={200} ${extra} />
}`

describe.each(['swift', 'kotlin'] as const)('MapChart holes on %s', (target) => {
  it('a GeoShape with inner rings lowers, draws through the engine and compiles', () => {
    const r = transform(SRC(''), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('holeHost')
    expect(r.code).toContain('layoutGeoShapes(')
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })

  it('selectedMode, emphasis, onSelectionChange and tooltipFormatter are warned by name', () => {
    const r = transform(SRC(`selectedMode="single" emphasis={false} onSelectionChange={() => {}} tooltipFormatter={() => null}`), { target })
    const text = r.warnings.join('\n')
    for (const p of ['selectedMode', 'emphasis', 'onSelectionChange', 'tooltipFormatter']) expect(text).toContain(p)
  })
})
