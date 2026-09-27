import { Band, Bar, Bollinger, Chart, Histogram, StackedArea, Tooltip } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * The marks that are not one value per category — a live demo of the four
 * shapes the prose describes and nothing rendered.
 *
 * Each is here because it says something the single-channel marks cannot:
 * `band` is an interval (two bounds, no centre), `stackedArea` is shares over
 * time, `waterfall` is a running total, and `histogram` bins a raw sample
 * instead of plotting it. `<Bollinger>` is the interval mark doing real work —
 * a rolling envelope whose bounds are computed from the series.
 *
 * `showValues` is on the band deliberately: it labels the HIGH edge, which is
 * the boundary a reader points at, and the tooltip carries both bounds.
 *
 * Falls back to a local signal when unbridged, per the "bridgeable, not
 * require-bridged" contract every Example follows.
 */
interface Day {
  d: string
  lo: number
  hi: number
  actual: number
}

interface Split {
  q: string
  direct: number
  partner: number
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function makeDays(): Day[] {
  return DAYS.map((d) => {
    const actual = 40 + Math.round(Math.random() * 40)
    const spread = 6 + Math.round(Math.random() * 10)
    return { d, lo: actual - spread, hi: actual + spread, actual }
  })
}

const SPLITS: Split[] = [
  { q: 'Q1', direct: 30, partner: 12 },
  { q: 'Q2', direct: 42, partner: 18 },
  { q: 'Q3', direct: 38, partner: 27 },
  { q: 'Q4', direct: 51, partner: 22 },
]

interface Step {
  name: string
  delta: number
}

const STEPS: Step[] = [
  { name: 'Open', delta: 120 },
  { name: 'Sales', delta: 48 },
  { name: 'Refunds', delta: -19 },
  { name: 'Fees', delta: -12 },
]

// A raw sample, not a summary — `histogram` is the mark that bins it.
const SAMPLE = Array.from({ length: 240 }, () => 50 + (Math.random() + Math.random() + Math.random() - 1.5) * 22)

export default function PlotIntervals(props: { shared?: Signal<number> }) {
  const refreshes = props.shared ?? signal(0)
  const days = signal<Day[]>(makeDays())

  const regenerate = () => {
    days.set(makeDays())
    refreshes.update((n) => n + 1)
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="button" onClick={regenerate}>
          Regenerate
        </button>
        <span>{() => `${refreshes()} regeneration${refreshes() === 1 ? '' : 's'}`}</span>
      </div>

      <figure style={{ margin: 0 }}>
        <figcaption>A forecast interval — two bounds, no centre value.</figcaption>
        <Chart<Day> data={() => days()} x="d" height={200} title="Forecast range">
          <Band low="lo" high="hi" label="Range" showValues />
          <Tooltip />
        </Chart>
      </figure>

      <figure style={{ margin: 0 }}>
        <figcaption>A rolling envelope: Bollinger bands are a filled band plus its middle line.</figcaption>
        <Chart<Day> data={() => days()} x="d" height={200} title="Actual against its envelope">
          <Bollinger<Day> y="actual" window={3} k={1.5} label="σ" />
        </Chart>
      </figure>

      <figure style={{ margin: 0 }}>
        <figcaption>Shares over time — each area is filled between running totals.</figcaption>
        <Chart<Split> data={SPLITS} x="q" height={200} title="Revenue by channel">
          <StackedArea y="direct" label="Direct" />
          <StackedArea y="partner" label="Partner" />
        </Chart>
      </figure>

      <figure style={{ margin: 0 }}>
        <figcaption>A running total, each step measured from the last.</figcaption>
        <Chart<Step> data={STEPS} x="name" height={200} title="Balance">
          <Bar y="delta" waterfall label="Change" showValues />
        </Chart>
      </figure>

      <figure style={{ margin: 0 }}>
        <figcaption>A raw sample, binned — the x axis is the bin, not the row.</figcaption>
        {/* `<Histogram>` BINS the sample, so the chart's rows become bins
            rather than the raw values — it is the whole chart. */}
        <Chart<number> data={SAMPLE} height={200} title="Latency distribution">
          <Histogram<number> x={(d) => d} bins={14} label="Requests" />
        </Chart>
      </figure>
    </div>
  )
}
