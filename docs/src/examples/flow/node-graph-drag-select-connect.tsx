import { useFlow, Flow, Background, MiniMap, Controls } from '@pyreon/flow'
import type { Signal } from '@pyreon/reactivity'

/**
 * The live counterpart to the "Workflow builder" snippet on the Flow
 * docs page — a REAL `@pyreon/flow` graph, not a hand-rolled SVG.
 *
 * Drag any node to move it, click to select, drag from a node edge to
 * connect. The flow instance manages all of it — no `applyNodeChanges`
 * callbacks, no manual state. `useFlow` auto-disposes the instance on
 * unmount, so this example is leak-safe across the docs page's mount /
 * unmount lifecycle.
 *
 * Arrows are made explicit + contrasty here (indigo, 18×14) so the
 * edge direction reads at a glance — the framework default is the
 * React-Flow-conventional light gray, which is correct in an app but
 * easy to miss in a small docs demo. `a→b` is a filled `ArrowClosed`,
 * `b→c` is an open `Arrow` chevron, so both marker shapes are visible
 * side by side. (Auto-layout + the full marker vocabulary get their own
 * interactive demo in the Flow playground further down the page.)
 *
 * Overlay order no longer matters on current compilers (the template
 * ref-hoist fix) — `<MiniMap>` is kept before `<Controls>` here only for
 * continuity with the e2e assertions. See the "Overlay child order" note
 * in docs/flow.md.
 *
 * The `shared` prop is part of the `<Example>` contract; this example
 * has no cross-mount signal to bridge, so it's accepted and ignored.
 */
export default function NodeGraphDragSelectConnect(_props: {
  shared?: Signal<unknown>
}) {
  const flow = useFlow({
    fitView: true,
    nodes: [
      { id: 'a', type: 'input', position: { x: 20, y: 30 }, data: { label: 'Start' } },
      { id: 'b', position: { x: 200, y: 110 }, data: { label: 'Process' } },
      { id: 'c', type: 'output', position: { x: 380, y: 30 }, data: { label: 'End' } },
    ],
    edges: [
      // No explicit markerEnd → the unified default arrowhead: a small filled
      // triangle in the LINE colour, so each edge reads as one connected stroke.
      { id: 'a-b', source: 'a', target: 'b' },
      { id: 'b-c', source: 'b', target: 'c' },
    ],
  })

  return (
    <div style="height: 280px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
      <Flow instance={flow}>
        <Background variant="dots" gap={20} size={1} />
        <MiniMap width={140} height={90} />
        <Controls position="bottom-left" />
      </Flow>
    </div>
  )
}
