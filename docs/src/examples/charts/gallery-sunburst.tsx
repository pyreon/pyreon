import { SunburstChart, type TreeNode } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a sunburst: a hierarchy as rings, each parent the sum of its
 * children. "Vary" regenerates the leaf values.
 */
function make(): TreeNode[] {
  const v = (): number => 5 + Math.round(Math.random() * 40)
  return [
    { name: 'Web', children: [{ name: 'Chrome', value: v() }, { name: 'Safari', value: v() }, { name: 'Firefox', value: v() }] },
    { name: 'Mobile', children: [{ name: 'iOS', value: v() }, { name: 'Android', value: v() }] },
    { name: 'Desktop', children: [{ name: 'macOS', value: v() }, { name: 'Windows', value: v() }, { name: 'Linux', value: v() }] },
  ]
}

export default function GallerySunburst(props: { shared?: Signal<number> }) {
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
      <SunburstChart data={() => data()} innerRatio={0.25} title="Sessions by platform" height={320} />
    </div>
  )
}
