// A map in the Equal Earth projection with a central meridian: the projection arithmetic is the generated engine's.
import { MapChart } from '@pyreon/charts'
import type { GeoShape } from '@pyreon/charts'

const SHAPES: GeoShape[] = [
  { name: 'A', rings: [[{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }]] },
  { name: 'B', rings: [[{ x: 50, y: 10 }, { x: 90, y: 10 }, { x: 70, y: 60 }]] },
]
export function App() {
  return <MapChart map={SHAPES} values={{ A: 1, B: 4 }} height={200} options={{ projection: 'equalEarth', centerLon: 10 }} />
}
