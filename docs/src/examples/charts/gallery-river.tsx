import { RiverChart, type RiverSeries } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a river (streamgraph): layers stacked around a centre line, one
 * value per week. "Vary" regenerates the layers.
 */
const WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10']

function make(): RiverSeries[] {
  return ['Bugs', 'Features', 'Docs', 'Chores'].map((name, s) => ({
    name,
    values: WEEKS.map((_, i) => Math.round(4 + 6 * Math.abs(Math.sin((i + s * 2) / 3)) + Math.random() * 4)),
  }))
}

export default function GalleryRiver(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const series = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            series.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <RiverChart series={() => series()} river={{ categories: WEEKS, curve: 'smooth' }} title="Merged pull requests by kind" height={300} />
    </div>
  )
}
