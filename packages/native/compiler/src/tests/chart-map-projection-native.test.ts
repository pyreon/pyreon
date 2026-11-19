// Map projections on native: `projection` and the numeric parameters ride in the GeoOptions literal; the projection
// arithmetic (forward and inverse) is the generated engine's, so a native map is the web's map.
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './charts-plugin'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const src = (options: string): string => `
import { MapChart } from '@pyreon/charts'
import type { GeoShape } from '@pyreon/charts'
const SHAPES: GeoShape[] = [
  { name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] },
]
export function App() {
  return <MapChart map={SHAPES} values={{ A: 1 }} height={200} options={${options}} />
}`

describe.each(['swift', 'kotlin'] as const)('MapChart projection options on %s', (target) => {
  it.each(['equalEarth', 'naturalEarth1', 'albers', 'albersUsa'])('%s with its numeric parameters lowers, warns of nothing and compiles', (projection) => {
    const r = transform(src(`{ projection: '${projection}', centerLon: -96, parallel1: 29.5, parallel2: 45.5 }`), { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(projection)
    expect(r.code).toMatch(/parallel1/)
    if (target === 'swift' && isSwiftcAvailable()) expect(validateSwiftWithStubs(r.code)).toMatchObject({ ok: true })
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
})
