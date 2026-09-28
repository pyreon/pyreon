import { TreeChart, type TreeNode } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a tree: a hierarchy drawn as nodes and links, left to right.
 * "Vary" regrows the leaves under each branch.
 */
function make(): TreeNode[] {
  const leaves = (prefix: string): TreeNode[] => Array.from({ length: 1 + Math.floor(Math.random() * 3) }, (_, i) => ({ name: `${prefix}${i + 1}` }))
  return [
    {
      name: 'src',
      children: [
        { name: 'engine', children: leaves('mark-') },
        { name: 'hosts', children: leaves('host-') },
        { name: 'tests', children: leaves('spec-') },
      ],
    },
  ]
}

export default function GalleryTree(props: { shared?: Signal<number> }) {
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
      <TreeChart data={() => data()} tree={{ orient: 'LR' }} title="Source tree" height={320} />
    </div>
  )
}
