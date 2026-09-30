import { GraphChart, type GraphLink, type GraphNode } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a network graph laid out on a circle: node size follows its
 * value, colour its category. "Vary" rewires the links.
 */
const NODES: GraphNode[] = [
  { id: 'core', name: 'core', value: 9, category: 0 },
  { id: 'reactivity', name: 'reactivity', value: 8, category: 0 },
  { id: 'router', name: 'router', value: 5, category: 1 },
  { id: 'head', name: 'head', value: 3, category: 1 },
  { id: 'store', name: 'store', value: 4, category: 2 },
  { id: 'form', name: 'form', value: 4, category: 2 },
  { id: 'query', name: 'query', value: 5, category: 2 },
  { id: 'charts', name: 'charts', value: 6, category: 2 },
]

function make(): GraphLink[] {
  const links: GraphLink[] = [{ source: 'core', target: 'reactivity' }]
  for (const n of NODES.slice(2)) {
    links.push({ source: n.id, target: Math.random() < 0.5 ? 'core' : 'reactivity' })
    if (Math.random() < 0.3) links.push({ source: n.id, target: NODES[2 + Math.floor(Math.random() * 6)]!.id })
  }
  return links.filter((l) => l.source !== l.target)
}

export default function GalleryGraph(props: { shared?: Signal<number> }) {
  const varies = props.shared ?? signal(0)
  const links = signal(make())
  return (
    <div class="example-col">
      <div class="example-row">
        <button
          type="button"
          onClick={() => {
            links.set(make())
            varies.update((n) => n + 1)
          }}
        >
          Vary
        </button>
        <span>varies: {() => varies()}</span>
      </div>
      <GraphChart
        nodes={NODES}
        links={() => links()}
        graph={{ layout: 'circular', categories: ['Core', 'Routing', 'Data'] }}
        title="Package dependencies"
        height={320}
      />
    </div>
  )
}
