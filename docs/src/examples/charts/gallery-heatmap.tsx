import { Cell, Chart, Tooltip } from '@pyreon/charts'
import type { Signal } from '@pyreon/reactivity'

/**
 * Gallery — a heatmap: activity by weekday and hour, one `<Cell>` per row of
 * long-format data, coloured through the theme's value ramp.
 */
interface Obs {
  hour: string
  day: string
  n: number
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const CELLS: Obs[] = []
for (let d = 0; d < DAYS.length; d++) {
  for (let h = 0; h < 24; h++) {
    const work = d < 5 && h >= 9 && h <= 17 ? 6 : 1
    CELLS.push({ hour: `${h}h`, day: DAYS[d]!, n: Math.round(work + 4 * Math.abs(Math.sin((h + d * 3) / 4))) })
  }
}

export default function GalleryHeatmap(_props: { shared?: Signal<number> }) {
  return (
    <Chart<Obs> data={CELLS} height={300}>
      <Cell x="hour" y="day" value="n" />
      <Tooltip />
    </Chart>
  )
}
