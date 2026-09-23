import { groupedBars, PlotChart, stackedBars } from '@pyreon/charts/plot'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — the same three series as a stack or side by side. The mark list is
 * an accessor, so switching layout repaints the canvas; with `updateAnimation`
 * on (the default) a same-shape change tweens, a shape change snaps.
 * The `shared` signal counts switches.
 */
interface Row {
  region: string
  web: number
  store: number
  partner: number
}

const ROWS: Row[] = [
  { region: 'North', web: 42, store: 28, partner: 12 },
  { region: 'South', web: 31, store: 35, partner: 18 },
  { region: 'East', web: 55, store: 22, partner: 9 },
  { region: 'West', web: 38, store: 30, partner: 21 },
  { region: 'Central', web: 26, store: 41, partner: 15 },
]

export default function GalleryBars(props: { shared?: Signal<number> }) {
  const switches = props.shared ?? signal(0)
  const stacked = signal(true)
  const marks = () => {
    const bar = stacked() ? stackedBars : groupedBars
    return [
      bar((d: Row) => d.web, { label: 'Web' }),
      bar((d: Row) => d.store, { label: 'Store' }),
      bar((d: Row) => d.partner, { label: 'Partner' }),
    ]
  }
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            stacked.set(!stacked())
            switches.update((n) => n + 1)
          }}
        >
          {() => (stacked() ? 'Show grouped' : 'Show stacked')}
        </button>
        <span>switches: {() => switches()}</span>
      </div>
      <PlotChart<Row> data={ROWS} x={(d) => d.region} marks={marks()} showLegend tooltip height={280} title="Orders by channel" />
    </div>
  )
}
