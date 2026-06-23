import {
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  type FlowInstance,
  type NodeComponentProps,
} from '@pyreon/flow'

/**
 * Feature-matrix custom node. Exercises four component-level flow features
 * that the package previously shipped broken or untested:
 *   • <Handle> source/target — drag-to-connect (fixed: elementFromPoint drop).
 *   • <NodeToolbar> — show-on-select (fixed: reactive `selected` accessor).
 *   • <NodeResizer> — corner resize handles (fixed: handleSize-scaled offset).
 *
 * Every prop except `id` is a reactive accessor — read inside thunks.
 */
export function FeatureNode(props: NodeComponentProps & { instance: FlowInstance<any> }) {
  return (
    <div
      data-testid={`fnode-${props.id}`}
      style={() =>
        `position: relative; padding: 10px 16px; min-width: 96px; text-align: center; border-radius: 8px; font-size: 13px; user-select: none; background: white; border: 2px solid ${props.selected() ? '#6366f1' : '#cbd5e1'}; cursor: ${props.dragging() ? 'grabbing' : 'grab'};`
      }
    >
      <Handle type="target" position={Position.Left} />
      {() => ((props.data() as { label?: string }).label ?? props.id)}

      {/* Toolbar shows only when the node is selected (reactive accessor). */}
      <NodeToolbar selected={props.selected}>
        <button
          type="button"
          data-testid={`fnode-del-${props.id}`}
          style="font-size: 11px; padding: 2px 6px; cursor: pointer;"
          onClick={() => props.instance.removeNode(props.id)}
        >
          Delete
        </button>
      </NodeToolbar>

      {/* Resize handles appear on selection. */}
      {() =>
        props.selected() ? <NodeResizer nodeId={props.id} instance={props.instance} /> : null
      }

      <Handle type="source" position={Position.Right} />
    </div>
  )
}
