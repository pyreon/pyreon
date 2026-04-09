/**
 * Workflow node taxonomy. Every node carries a `kind` so the JSON
 * sidebar can validate roundtrips, and a human label for the canvas.
 *
 * Keeping this narrow (4 kinds) makes the demo legible — a real
 * editor would extend the union with more node families.
 */
export type WorkflowNodeKind = 'trigger' | 'filter' | 'transform' | 'notify'

/**
 * Node data payload — fully typed, no index signature needed.
 *
 * `@pyreon/flow`'s `createFlow<TData>` is generic, so this clean
 * interface threads through `FlowNode<WorkflowNodeData>` end-to-end
 * without forcing a `[key: string]: unknown` index signature. Reads
 * on `node.data.kind` narrow to the typed union, not `unknown`.
 */
export interface WorkflowNodeData {
  kind: WorkflowNodeKind
  label: string
  /** Optional one-line config summary surfaced in the canvas card. */
  config?: string
}
