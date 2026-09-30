import { SankeyChart, type SankeyLink, type SankeyNode } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a Sankey diagram: traffic from sources through landing pages to
 * outcomes, each link as wide as its flow. "Vary" regenerates the flows.
 */
const NODES: SankeyNode[] = [
  { name: 'Search' },
  { name: 'Social' },
  { name: 'Email' },
  { name: 'Home' },
  { name: 'Pricing' },
  { name: 'Signed up' },
  { name: 'Left' },
]

function make(): SankeyLink[] {
  const r = (lo: number, hi: number): number => lo + Math.round(Math.random() * (hi - lo))
  return [
    { source: 'Search', target: 'Home', value: r(300, 500) },
    { source: 'Search', target: 'Pricing', value: r(100, 250) },
    { source: 'Social', target: 'Home', value: r(150, 300) },
    { source: 'Email', target: 'Pricing', value: r(80, 200) },
    { source: 'Home', target: 'Signed up', value: r(80, 160) },
    { source: 'Home', target: 'Left', value: r(300, 450) },
    { source: 'Pricing', target: 'Signed up', value: r(90, 180) },
    { source: 'Pricing', target: 'Left', value: r(60, 150) },
  ]
}

export default function GallerySankey(props: { shared?: Signal<number> }) {
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
      <SankeyChart nodes={NODES} links={() => links()} title="Visitors this week" height={300} />
    </div>
  )
}
