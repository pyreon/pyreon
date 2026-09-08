/**
 * @pyreon/flow — Reactive flow diagrams for Pyreon.
 *
 * Signal-native nodes, edges, pan/zoom, auto-layout. No D3 dependency.
 * Per-node signal reactivity — O(1) updates instead of O(n) array diffing.
 *
 * @example
 * ```tsx
 * import { createFlow, Flow, Background, MiniMap, Controls } from '@pyreon/flow'
 *
 * const flow = createFlow({
 *   nodes: [
 *     { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
 *     { id: '2', position: { x: 200, y: 100 }, data: { label: 'End' } },
 *   ],
 *   edges: [{ source: '1', target: '2' }],
 * })
 *
 * <Flow instance={flow}>
 *   <Background />
 *   <MiniMap />
 *   <Controls />
 * </Flow>
 * ```
 */

export { Background } from './components/background'
export { Controls } from './components/controls'
export type { FlowComponentProps } from './components/flow-component'
// Components
export { Flow } from './components/flow-component'
export { Handle } from './components/handle'
export { MiniMap } from './components/minimap'
export type { NodeResizerProps } from './components/node-resizer'
export { NodeResizer } from './components/node-resizer'
export type { NodeToolbarProps } from './components/node-toolbar'
export { NodeToolbar } from './components/node-toolbar'
export type { EdgeLabelRendererProps } from './components/edge-label-renderer'
export { EdgeLabelRenderer } from './components/edge-label-renderer'
export type { FlowLayers } from './components/flow-context'
export { FlowLayersContext } from './components/flow-context'
export { Panel } from './components/panel'
// Edge path utilities
export type {
  BezierPathParams,
  SmoothStepPathParams,
  StepPathParams,
  StraightPathParams,
  WaypointPathParams,
} from './edges'
export {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  getBezierPath,
  getEdgePath,
  getEffectiveDimensions,
  getFloatingEndpoints,
  getHandlePosition,
  getNodeIntersection,
  getSmartHandlePositions,
  getSmoothStepPath,
  getStepPath,
  getStraightPath,
  getWaypointPath,
  resolveHandleAnchor,
} from './edges'
export {
  collectEdgeMarkers,
  DEFAULT_MARKER_END,
  markerId,
  resolveEdgeMarkers,
  resolveMarker,
} from './markers'
// Core
export { createFlow } from './flow'
export { useFlow } from './use-flow'
// Layout
export { computeLayout } from './layout'
// Styles
export { flowStyles } from './styles'
export type {
  BackgroundProps,
  Connection,
  ConnectionRule,
  ControlsProps,
  DefaultEdgeOptions,
  Dimensions,
  EdgeGeometry,
  EdgeMarker,
  EdgeMarkerSpec,
  EdgePathOptions,
  EdgePathResult,
  EdgeSegment,
  EdgeType,
  FlowConfig,
  FlowEdge,
  FlowInstance,
  FlowNode,
  FlowProps,
  HandleConfig,
  HandleProps,
  HandleType,
  LayoutAlgorithm,
  LayoutOptions,
  MeasuredHandle,
  MiniMapProps,
  NodeChange,
  NodeComponentProps,
  NodeMeasurement,
  PanelProps,
  Rect,
  SnapSession,
  Viewport,
  XYPosition,
  ConnectionLineProps,
  ModifierKey,
} from './types'
// Types
export { MarkerType, Position } from './types'
