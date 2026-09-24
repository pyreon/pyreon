import { Bar, Chart, Tooltip } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a horizontal ranking: `horizontal` turns the category axis on its
 * side, and `showValues` labels each bar. "Re-rank" sorts ascending or
 * descending; the `shared` signal counts re-ranks.
 */
interface Lang {
  name: string
  value: number
}

const LANGS: Lang[] = [
  { name: 'TypeScript', value: 38.5 },
  { name: 'Python', value: 51 },
  { name: 'Rust', value: 12.6 },
  { name: 'Go', value: 13.5 },
  { name: 'Kotlin', value: 9.4 },
  { name: 'Swift', value: 4.7 },
]

export default function GalleryHorizontal(props: { shared?: Signal<number> }) {
  const reranks = props.shared ?? signal(0)
  const ascending = signal(true)
  const sorted = () => [...LANGS].sort((a, b) => (ascending() ? a.value - b.value : b.value - a.value))
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            ascending.set(!ascending())
            reranks.update((n) => n + 1)
          }}
        >
          Re-rank
        </button>
        <span>re-ranks: {() => reranks()}</span>
      </div>
      <Chart<Lang> data={() => sorted()} x="name" horizontal height={280} title="Language use (%)">
        <Bar y="value" label="Share" showValues />
        <Tooltip />
      </Chart>
    </div>
  )
}
