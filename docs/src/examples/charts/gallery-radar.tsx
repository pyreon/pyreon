import { RadarChart } from '@pyreon/charts'
import type { RadarAxis } from '@pyreon/charts'
import type { Signal } from '@pyreon/reactivity'

/**
 * Gallery — a radar comparison: two filled series over six named axes, each
 * with its own maximum.
 */
interface Framework {
  name: string
  scores: number[]
}

const AXES: RadarAxis[] = ['Speed', 'Size', 'DX', 'Ecosystem', 'SSR', 'Native'].map((label) => ({ label, max: 100 }))
const FRAMEWORKS: Framework[] = [
  { name: 'Framework A', scores: [92, 88, 80, 55, 90, 85] },
  { name: 'Framework B', scores: [70, 60, 85, 95, 75, 40] },
]

export default function GalleryRadar(_props: { shared?: Signal<number> }) {
  return <RadarChart data={FRAMEWORKS} axes={AXES} values={(d) => d.scores} label={(d) => d.name} fillAlpha={0.2} height={320} showLegend />
}
