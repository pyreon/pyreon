import { createFlow, type FlowInstance, type FlowNode } from '@pyreon/flow'
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
 *   • `loadJson(text)` — parse and `fromJSON()` a serialized graph,
 *     returning an error string on failure (no throw — the JSON
 *     sidebar surfaces the error inline).
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

  /**
   * Parse a JSON string and apply it via `fromJSON`. Returns null on
   * success or an error message on failure. The JSON sidebar surfaces
   * the error inline rather than throwing — keeps the editor usable
   * mid-edit.
   */
  function loadJson(text: string): string | null {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid JSON'
    }
    if (!parsed || typeof parsed !== 'object') {
      return 'Expected an object with `nodes` and `edges` arrays'
    }
    const obj = parsed as { nodes?: unknown; edges?: unknown }
    if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
      return 'Expected `nodes` and `edges` to be arrays'
    }
    try {
      instance.pushHistory()
      instance.fromJSON({
        nodes: obj.nodes as FlowNode<WorkflowNodeData>[],
        edges: obj.edges as never,
      })
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'Failed to load graph'
    }
  }

  return {
    instance,
    addNodeOfKind,
    reset,
    loadJson,
  }
})
