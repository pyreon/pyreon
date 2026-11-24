import { MapChart } from '@pyreon/charts'
import world from '@pyreon/charts-maps/world-110m'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — flows along great circles: the arc is the shortest path on the sphere, so it bends on the flat map; width is
 * the flow's value; an arc that crosses the seam (Tokyo to Los Angeles) is drawn as two runs, never a chord. "Reveal"
 * sweeps `progress`, which is arc LENGTH on the sphere.
 */
const FLOWS = [
  { from: { lon: -74, lat: 40.7 }, to: { lon: -0.1, lat: 51.5 }, value: 9, name: 'NYC to London' },
  { from: { lon: 139.7, lat: 35.7 }, to: { lon: -118.2, lat: 34.1 }, value: 7, name: 'Tokyo to Los Angeles' },
  { from: { lon: 55.3, lat: 25.2 }, to: { lon: 103.8, lat: 1.35 }, value: 5, name: 'Dubai to Singapore' },
  { from: { lon: 151.2, lat: -33.9 }, to: { lon: 18.4, lat: -33.9 }, value: 3, name: 'Sydney to Cape Town' },
  { from: { lon: -46.6, lat: -23.5 }, to: { lon: 2.3, lat: 48.9 }, value: 4, name: 'Sao Paulo to Paris' },
]

export default function GalleryMapFlows() {
  const progress = signal(1)
  return (
    <div class="example-col">
      <div class="example-row">
        <label>
          Reveal {() => Math.round(progress() * 100)}%
          <input type="range" min="0" max="1" step="0.05" value={() => progress()} onInput={(e) => progress.set(Number((e.target as HTMLInputElement).value))} />
        </label>
      </div>
      <MapChart map={world} values={{}} height={360} animate={false} flows={FLOWS} flowOptions={{ progress: progress(), minWidth: 1.5, maxWidth: 5 }} options={{ sphere: true, graticule: 30 }} />
    </div>
  )
}
