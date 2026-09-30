import { BoxplotChart } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a boxplot: raw response times per region, summarised into
 * quartiles, whiskers and outliers by the chart. "Vary" draws new samples.
 */
interface Region {
  region: string
  ms: number[]
}

function sample(center: number, spread: number): number[] {
  const out: number[] = []
  for (let i = 0; i < 40; i++) out.push(Math.round(center + (Math.random() + Math.random() - 1) * spread))
  out.push(Math.round(center + spread * 2.5))
  return out
}

function make(): Region[] {
  return [
    { region: 'EU', ms: sample(120, 40) },
    { region: 'US', ms: sample(160, 60) },
    { region: 'APAC', ms: sample(210, 70) },
    { region: 'LATAM', ms: sample(240, 90) },
  ]
}

export default function GalleryBoxplot(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const data = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            data.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <BoxplotChart<Region> data={() => data()} x={(d) => d.region} values={(d) => d.ms} title="Response time (ms)" height={280} />
    </div>
  )
}
