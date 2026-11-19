// A map region with an inner ring (a lake or an enclave): holes and holeHost lower and the engine fills them even-odd.
import { MapChart } from '@pyreon/charts'
import type { GeoShape } from '@pyreon/charts'

const SHAPES: GeoShape[] = [
  {
    name: 'Country',
    rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]],
    holes: [[{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 6 }, { x: 3, y: 6 }]],
    holeHost: [0],
  },
  { name: 'Enclave', rings: [[{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 6 }, { x: 3, y: 6 }]] },
]
export function App() {
  return <MapChart map={SHAPES} values={{ Country: 1, Enclave: 5 }} height={200} />
}
