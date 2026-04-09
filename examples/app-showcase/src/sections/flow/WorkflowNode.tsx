import { Handle, Position, type NodeComponentProps } from '@pyreon/flow'
import type { WorkflowNodeData } from './data/types'
import { NodeCard, NodeConfig, NodeKindLabel, NodeLabel } from './styled'

/**
 * Custom workflow node renderer registered with `<Flow nodeTypes={...}>`.
 *
 * Every prop except `id` is a reactive accessor: `data()`,
 * `selected()`, and `dragging()`. Read them inside reactive scopes
 * so the node patches in place when any underlying state changes
 * — including drags (60+ updates/sec), selection clicks, and data
 * mutations — without re-mounting the component. Each WorkflowNode
 * mounts exactly ONCE across the lifetime of the graph.
 *
 * Each node has a target handle on the left and a source handle on
 * the right — that's enough for the linear workflow demo. A real
 * editor would expose multiple typed handles (e.g. success/failure
 * branches on a Filter node).
 */
export function WorkflowNode(props: NodeComponentProps<WorkflowNodeData>) {
  return (
    <NodeCard $kind={props.data().kind} $selected={props.selected()}>
      <Handle type="target" position={Position.Left} />
      <NodeKindLabel $kind={props.data().kind}>{() => props.data().kind}</NodeKindLabel>
      <NodeLabel>{() => props.data().label}</NodeLabel>
      {() => {
        const config = props.data().config
        return config ? <NodeConfig>{config}</NodeConfig> : null
      }}
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  )
}
