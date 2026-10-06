// Golden-only: a shape harvested from the native-compiler test suite that the rest of the corpus does not reach in the flow lowering
// (@pyreon/flow native-plugin). Its expected output was recorded from the PRE-MOVE compiler, so a change here is a change of emitted Swift/Kotlin.

import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' }, parentId: 'root', extent: 'parent', draggable: false, selectable: true, connectable: false, focusable: true, ariaLabel: 'Start node', hidden: false, deletable: true, class: 'source-node', style: 'background: #fff', expandParent: true, group: true, sourceHandles: [{ id: 'out', type: 'source', position: 'right' }], targetHandles: [{ type: 'target', position: 'left' }] }],
    edges: [{ id: 'e1', source: '1', target: '1', data: { label: 'wire', weight: 2, active: true, tags: ['a', null], meta: { kind: 'signal' } }, class: 'signal-edge', style: 'stroke: #f00; stroke-width: 2', markerStart: { type: 'arrowclosed', color: '#f00', width: 12, height: 8, strokeWidth: 2 }, markerEnd: 'arrow', sourceHandle: 'out', targetHandle: 'in', focusable: true, ariaLabel: 'Loop', hidden: false, deletable: true, reconnectable: false, interactionWidth: 24, pathOptions: { curvature: 0.4, borderRadius: 8, offset: 30 } }, { id: 'e2', source: '1', target: '1', markerEnd: null }],
    defaultMarkerEnd: null,
    nodesDraggable: false, nodesConnectable: false, nodesSelectable: false, nodesFocusable: false,
    edgesFocusable: false, nodesDeletable: false, edgesDeletable: false, edgesReconnectable: false,
    edgeInteractionWidth: 32, connectionRadius: 9, pannable: false, zoomable: false, multiSelect: false, onlyRenderVisibleElements: false,
    defaultEdgeType: 'step', fitView: true, fitViewPadding: 0.2,
    defaultEdgeOptions: { type: 'smoothstep', label: 'Default', animated: true, interactionWidth: 30, pathOptions: { borderRadius: 8, offset: 12 }, markerEnd: null },
  })
  return (<Stack><Text>{flow.nodes().length}</Text></Stack>)
}
