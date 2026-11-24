import { Axis, Bar, Chart, Tooltip, date } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — daily revenue with missing days. `xValue` places each bar at its
 * timestamp, the slot is one day wide (the smallest gap between two days), and a
 * day with no row is simply an empty stretch: bars are centred on their day and
 * the axis is padded by half a day. "Stream" appends the next day and drops the
 * oldest; the bars slide by key.
 */
interface Day {
  at: number
  revenue: number
}

const DAY = 86_400_000
const START = Date.UTC(2026, 2, 1)
// Days 5, 6, 11, 17 and 18 have no row.
const PRESENT = [0, 1, 2, 3, 6, 7, 8, 9, 11, 12, 13, 14, 15, 18, 19]

const row = (d: number): Day => ({ at: START + d * DAY, revenue: 40 + ((d * 37) % 70) })

export default function GalleryBarsTime() {
  const days = signal(PRESENT.map(row))
  let next = 20
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            days.set([...days().slice(1), row(next)])
            next += 1
          }}
        >
          Stream a day
        </button>
      </div>
      <Chart<Day> data={() => days()} xValue="at" by={(d) => String(d.at)} title="Daily revenue" height={280}>
        <Bar<Day> y="revenue" label="Revenue" />
        <Axis x time format={date('MMM D')} />
        <Tooltip />
      </Chart>
    </div>
  )
}
