import { Bar, Chart, Tooltip, currency, fillBy, shadeBy } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — colour a datum on its own. `fillBy` reads a colour off the row
 * (here a status colour), `shadeBy` maps a value through a ramp (here the
 * margin). `color` stays the series colour and `<Chart color="field">` the
 * long-format split; `fill` is a descriptor, so it cannot be mistaken for
 * either. The tooltip and the accessible table print the margin, so the shade
 * is never the only carrier of the number.
 */
interface Region {
  name: string
  revenue: number
  margin: number
  status: string
}

const REGIONS: Region[] = [
  { name: 'North', revenue: 420, margin: 12, status: '#16a34a' },
  { name: 'South', revenue: 310, margin: 4, status: '#dc2626' },
  { name: 'East', revenue: 505, margin: 18, status: '#16a34a' },
  { name: 'West', revenue: 260, margin: 9, status: '#d97706' },
]

export default function GalleryBarColors() {
  const byShade = signal(true)
  return (
    <div class="example-col">
      <div class="example-row">
        <button type="button" onClick={() => byShade.set(!byShade())}>
          {() => (byShade() ? 'Shade by margin' : 'Colour by status')}
        </button>
      </div>
      <Chart<Region> data={REGIONS} x="name" height={260} format={currency('$')} title="Revenue by region">
        {() =>
          byShade() ? (
            <Bar<Region> y="revenue" label="Revenue" fill={shadeBy<Region>('margin', { ramp: ['#fde68a', '#b45309'] })} />
          ) : (
            <Bar<Region> y="revenue" label="Revenue" fill={fillBy<Region>('status')} />
          )
        }
        <Tooltip />
      </Chart>
    </div>
  )
}
