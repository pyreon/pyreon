import { Handle, Position, type NodeComponentProps } from '@pyreon/flow'
import type { WorkflowNodeData } from './data/types'
import { NodeCard, NodeConfig, NodeKindLabel, NodeLabel } from './styled'

/**
 * Custom workflow node renderer registered with `<Flow nodeTypes={...}>`.
 *
 * `props.selected` and `props.dragging` are accessor functions
 * (`() => boolean`), not plain booleans — read inside reactive scopes
 * so the node patches in place when selection or drag state changes
 * instead of re-mounting on every selection click. The runtime
 * mounts each WorkflowNode exactly once across the lifetime of the
 * graph; only the per-prop accessor reads re-evaluate.
 *
 * Each node has a target handle on the left and a source handle on
 * the right — that's enough for the linear workflow demo. A real
 * editor would expose multiple typed handles (e.g. success/failure
 * branches on a Filter node).
 */
export function WorkflowNode(props: NodeComponentProps<WorkflowNodeData>) {
  return (
    <NodeCard $kind={props.data.kind} $selected={props.selected()}>
      <Handle type="target" position={Position.Left} />
      <NodeKindLabel $kind={props.data.kind}>{props.data.kind}</NodeKindLabel>
      <NodeLabel>{props.data.label}</NodeLabel>
      {props.data.config ? <NodeConfig>{props.data.config}</NodeConfig> : null}
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  )
}
