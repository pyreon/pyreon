import { Axis, Bar, Chart, compact, Tooltip } from '@pyreon/charts'
import type { Trend } from './stats'

interface ChartRow {
  label: string
  downloads: number
}

/** Weekly npm downloads as a bar chart (an island on `/open`). */
export default function TrendChart(props: { label: Trend['label']; points: Trend['points'] }) {
  const rows: ChartRow[] = props.points.map((p) => ({
    label: new Date(p.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    downloads: p.downloads,
  }))
  return (
    <Chart<ChartRow> data={rows} x="label" height={260} animate={false} title={`Weekly npm downloads, ${props.label}`}>
      <Bar y="downloads" label="Downloads" />
      <Axis y format={compact} />
      <Tooltip />
    </Chart>
  )
}
