// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { MapChart } from '@pyreon/charts'
import type { GeoOverlayOptions, GeoOverlayPath, GeoOverlayPoint, GeoShape } from '@pyreon/charts'
const SHAPES: GeoShape[] = [
  { name: 'A', rings: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]] },
  { name: 'B', rings: [[{ x: 12, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }]] },
]
const PATHS: GeoOverlayPath[] = [{ coords: [{ lon: 0, lat: 0 }, { lon: 20, lat: 8 }], width: 2 }]
const POINTS: GeoOverlayPoint[] = [{ name: 'Capital', lon: 5, lat: 5, value: 3 }]
const OVERLAY: GeoOverlayOptions = { effect: true, showLabels: true }
export function Regions() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <MapChart animate={false} map={SHAPES} values={{ A: 5, B: 9.5 }} paths={PATHS} points={POINTS} overlayOptions={OVERLAY} options={{ showLabels: true }} height={280} tooltip onSelectIndex={(i: number) => picked.set(i)} onSelectPointIndex={(i: number) => picked.set(i + 100)} />
    </Stack>
  )
}
