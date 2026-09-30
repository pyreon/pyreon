import { TreemapChart, type TreeNode } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a treemap: each leaf a rectangle with area proportional to its
 * value, nested in its parent. "Vary" regenerates the sizes.
 */
function make(): TreeNode[] {
  const v = (): number => 10 + Math.round(Math.random() * 90)
  return [
    { name: 'core', children: [{ name: 'reactivity', value: v() }, { name: 'runtime-dom', value: v() }, { name: 'compiler', value: v() }] },
    { name: 'fundamentals', children: [{ name: 'charts', value: v() }, { name: 'query', value: v() }, { name: 'form', value: v() }, { name: 'store', value: v() }] },
    { name: 'ui-system', children: [{ name: 'styler', value: v() }, { name: 'elements', value: v() }] },
  ]
}

export default function GalleryTreemap(props: { shared?: Signal<number> }) {
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
      <TreemapChart data={() => data()} title="Source size by package (KB)" height={300} />
    </div>
  )
}
