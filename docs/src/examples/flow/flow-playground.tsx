import { useFlow, Flow, Background, MiniMap, Controls } from '@pyreon/flow'
import { signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'

/**
 * Flow playground — the kitchen-sink live demo for the Flow docs page.
 *
 * One graph exercising every visible @pyreon/flow feature:
 *  - Edge ARROWS: filled `ArrowClosed`, open `Arrow` chevron, per-edge
 *    colours, and a both-ends marker — so the marker vocabulary reads at
 *    a glance (the framework default is a subtle gray, deliberately
 *    overridden here so the feature is unmistakable in a docs demo).
 *  - AUTO-LAYOUT: four real elkjs runs behind labelled buttons —
 *    `layered →`, `layered ↓`, `tree`, `force`. Click one and the nodes
 *    animate to the computed positions (elkjs is lazy-loaded on first call).
 *  - Background dots, MiniMap, and Controls.
 *  - Drag a node to move it, click to select, drag from a node edge to
 *    connect — the instance manages all of it, no manual change handlers.
 *
 * The layout toolbar lives OUTSIDE `<Flow>` (a normal DOM toolbar) — the
 * in-canvas `<Panel>` is for read-only overlays; interactive controls
 * belong in regular markup, matching the app-showcase Flow Feature Matrix.
 *
 * `useFlow` auto-disposes on unmount, so the example is leak-safe across
 * the docs page's mount/unmount lifecycle. The `shared` prop is the
 * `<Example>` contract; this demo has no cross-mount signal, so it's
 * accepted and ignored.
 */
export default function FlowPlayground(_props: { shared?: Signal<unknown> }) {
  const flow = useFlow({
    fitView: true,
    nodes: [
      { id: 'source', type: 'input', position: { x: 40, y: 140 }, data: { label: 'Source' } },
      { id: 'validate', position: { x: 240, y: 60 }, data: { label: 'Validate' } },
      { id: 'transform', position: { x: 240, y: 220 }, data: { label: 'Transform' } },
      { id: 'merge', position: { x: 460, y: 140 }, data: { label: 'Merge' } },
      { id: 'store', type: 'output', position: { x: 680, y: 60 }, data: { label: 'Store' } },
      { id: 'notify', type: 'output', position: { x: 680, y: 220 }, data: { label: 'Notify' } },
    ],
    edges: [
      // No explicit markers → the unified default arrowhead: a small filled
      // triangle in the LINE colour, so every edge reads as one connected stroke.
      { id: 'e1', source: 'source', target: 'validate' },
      { id: 'e2', source: 'source', target: 'transform' },
      { id: 'e3', source: 'validate', target: 'merge' },
      { id: 'e4', source: 'transform', target: 'merge' },
      { id: 'e5', source: 'merge', target: 'store' },
      { id: 'e6', source: 'merge', target: 'notify' },
    ],
  })

  const current = signal('manual')

  // Buttons are written EXPLICITLY (not via `.map()`): a `.map()` slot
  // followed by the reactive `{() => current()}` readout triggers the
  // compiler template-ordering bug (a static reactive element after a
  // `_mountSlot` sibling — see anti-patterns.md), which leaves the readout
  // stuck on its baked placeholder. Four static buttons keep the ref-walk
  // over static siblings only.
  const run = (id: string, fn: () => Promise<void>) => {
    current.set(id)
    void fn()
  }
  const btn =
    'font-size: 12px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg, #fff); cursor: pointer;'

  return (
    <div style="border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
      {/* Toolbar OUTSIDE <Flow> — normal DOM, so onClick + reactive text work. */}
      <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 8px 10px; border-bottom: 1px solid var(--border);">
        <span style="font-size: 11px; opacity: 0.7;">auto-layout:</span>
        <button type="button" data-testid="flow-layout-layered-right" style={btn} onClick={() => run('layered-right', () => flow.layout('layered', { direction: 'RIGHT', nodeSpacing: 40, layerSpacing: 90 }))}>layered →</button>
        <button type="button" data-testid="flow-layout-layered-down" style={btn} onClick={() => run('layered-down', () => flow.layout('layered', { direction: 'DOWN', nodeSpacing: 40, layerSpacing: 90 }))}>layered ↓</button>
        <button type="button" data-testid="flow-layout-tree" style={btn} onClick={() => run('tree', () => flow.layout('tree', { direction: 'DOWN', nodeSpacing: 40 }))}>tree</button>
        <button type="button" data-testid="flow-layout-force" style={btn} onClick={() => run('force', () => flow.layout('force', { nodeSpacing: 80 }))}>force</button>
        <span data-testid="flow-layout-current" style="font-size: 11px; opacity: 0.6; margin-left: 4px;">
          {() => current()}
        </span>
      </div>
      <div style="height: 340px;">
        <Flow instance={flow}>
          <Background variant="dots" gap={20} size={1} />
          <MiniMap width={150} height={100} />
          <Controls position="bottom-left" />
        </Flow>
      </div>
    </div>
  )
}
