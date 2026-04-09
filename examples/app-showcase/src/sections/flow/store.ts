import { createFlow, type FlowInstance } from '@pyreon/flow'
import { defineStore } from '@pyreon/store'
import { NODE_KIND_LABELS, SEED_EDGES, SEED_NODES } from './data/seed'
import type { WorkflowNodeData, WorkflowNodeKind } from './data/types'

/**
 * Flow editor store.
 *
 * Wraps a single `createFlow` instance in a `defineStore` singleton so
 * the canvas, JSON sidebar, and toolbar all share state across
 * navigations. The flow instance owns its own signals — we don't
 * mirror them — but the store adds a few app-specific helpers:
 *
 *   • `addNodeOfKind(kind)` — append a workflow node at a sensible
 *     position with `pushHistory()` so the action is undoable.
 *   • `reset()` — restore the seed graph and fit-view, undoable.
 *
 * The JSON sidebar's text-to-graph parsing used to live here as a
 * `loadJson` helper, but it's now handled by `bindEditorToSignal`
 * from `@pyreon/code` directly inside the sidebar component (the
 * helper's `parse` callback throws on validation failures, and
 * `onParseError` surfaces them inline). Removing the wrapper
 * eliminates a layer of indirection and lets the sidebar own its
 * own validation rules.
 *
 * The store does NOT proxy `flow.nodes` / `flow.edges` etc. — consumers
 * read those directly from `useFlowEditor().instance` so the reactivity
 * graph stays flat.
 */
export const useFlowEditor = defineStore('flow-editor', () => {
  // createFlow is generic over the data shape — pass WorkflowNodeData
  // explicitly so reads on `node.data.kind` narrow to the typed union.
  const instance: FlowInstance<WorkflowNodeData> = createFlow<WorkflowNodeData>({
    nodes: SEED_NODES,
    edges: SEED_EDGES,
    defaultEdgeType: 'smoothstep',
    fitView: true,
    fitViewPadding: 0.15,
    minZoom: 0.25,
    maxZoom: 2.5,
    snapToGrid: true,
    snapGrid: 20,
  })

  /** Find a non-overlapping spawn position based on existing nodes. */
  function nextSpawnPosition() {
    const all = instance.nodes()
    if (all.length === 0) return { x: 60, y: 60 }
    // Stagger to the right of the rightmost node so new additions
    // don't pile on top of existing geometry.
    const rightmost = all.reduce((acc, n) => (n.position.x > acc.position.x ? n : acc), all[0]!)
    return { x: rightmost.position.x + 220, y: rightmost.position.y + 40 }
  }

  function addNodeOfKind(kind: WorkflowNodeKind) {
    instance.pushHistory()
    const id = `${kind}-${Date.now().toString(36)}`
    const data: WorkflowNodeData = {
      kind,
      label: NODE_KIND_LABELS[kind],
      config: kind === 'trigger' ? 'configure source' : 'configure rule',
    }
    instance.addNode({
      id,
      type: 'workflow',
      position: nextSpawnPosition(),
      data,
    })
  }

  function reset() {
    instance.pushHistory()
    instance.fromJSON({ nodes: SEED_NODES, edges: SEED_EDGES })
    instance.fitView()
  }

  return {
    instance,
    addNodeOfKind,
    reset,
  }
})
