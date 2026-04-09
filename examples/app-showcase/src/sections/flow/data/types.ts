/**
 * Workflow node taxonomy. Every node carries a `kind` so the JSON
 * sidebar can validate roundtrips, and a human label for the canvas.
 *
 * Keeping this narrow (4 kinds) makes the demo legible — a real
 * editor would extend the union with more node families.
 */
export type WorkflowNodeKind = 'trigger' | 'filter' | 'transform' | 'notify'

/**
 * Node data payload.
 *
 * The index signature is required so the type satisfies
 * `Record<string, unknown>` — `@pyreon/flow`'s `FlowNode` defaults
 * `data` to `Record<string, unknown>` and `createFlow` is non-generic,
 * so without the index signature TS rejects assignment at the
 * boundary. Keys are still strongly typed on read; the index just
 * widens the type-level shape.
 */
export interface WorkflowNodeData {
  kind: WorkflowNodeKind
  label: string
  /** Optional one-line config summary surfaced in the canvas card. */
  config?: string
  // Required by FlowNode<Record<string, unknown>> compatibility:
  [key: string]: unknown
}
