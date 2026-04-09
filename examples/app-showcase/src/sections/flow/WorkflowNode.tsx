import { Handle, Position, type NodeComponentProps } from '@pyreon/flow'
import type { WorkflowNodeData } from './data/types'
import { NodeCard, NodeConfig, NodeKindLabel, NodeLabel } from './styled'

/**
 * Custom workflow node renderer registered with `<Flow nodeTypes={...}>`.
 *
 * Receives `NodeComponentProps` from the runtime: id, data, selected,
 * dragging. The `selected` and `dragging` flags are NOT signals — Flow
 * passes the current values on each render. Because Pyreon components
 * run once, we read them as plain props (Flow re-instantiates the
 * node component when its underlying selection state changes).
 *
 * Each node has a target handle on the left and a source handle on
 * the right — that's enough for the linear workflow demo. A real
 * editor would expose multiple typed handles (e.g. success/failure
 * branches on a Filter node).
 */
export function WorkflowNode(props: NodeComponentProps<WorkflowNodeData>) {
  return (
    <NodeCard $kind={props.data.kind} $selected={props.selected}>
      <Handle type="target" position={Position.Left} />
      <NodeKindLabel $kind={props.data.kind}>{props.data.kind}</NodeKindLabel>
      <NodeLabel>{props.data.label}</NodeLabel>
      {props.data.config ? <NodeConfig>{props.data.config}</NodeConfig> : null}
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  )
}
