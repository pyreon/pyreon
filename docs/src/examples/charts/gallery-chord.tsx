import { ChordChart, type ChordLink, type ChordNode } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a chord diagram: flows between teams, each ribbon as wide as its
 * value at both ends. "Vary" regenerates the flows.
 */
const NODES: ChordNode[] = [{ name: 'Design' }, { name: 'Web' }, { name: 'Mobile' }, { name: 'Platform' }, { name: 'Data' }]

function make(): ChordLink[] {
  const links: ChordLink[] = []
  for (let a = 0; a < NODES.length; a++) {
    for (let b = a + 1; b < NODES.length; b++) {
      links.push({ source: NODES[a]!.name, target: NODES[b]!.name, value: 2 + Math.round(Math.random() * 18) })
    }
  }
  return links
}

export default function GalleryChord(props: { shared?: Signal<number> }) {
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
      <ChordChart nodes={NODES} links={() => links()} title="Pull requests reviewed across teams" height={340} />
    </div>
  )
}
