/**
 * The JSON payload of the plugin's `flow-state` declaration — what the
 * `createFlow` / `useFlow` recognizer captured from the literal config. It was a
 * closed `DeclIR` kind in the compiler before the lowering moved here; the
 * fields are unchanged.
 */
import type { ExprIR, TypeIR } from '@pyreon/native-compiler/plugin-api'

export interface FlowStatePayload {
  /** True for `useFlow`: dispose listeners/history when the component unmounts. */
  lifecycleOwned?: boolean
  /** Explicit `createFlow<T>` / `useFlow<T>` node-data type when supplied. */
  dataType?: TypeIR
  nodes: {
    id: string
    type?: string
    positionX: ExprIR
    positionY: ExprIR
    /** The node's `data: {...}` object literal; emitters union heterogeneous field sets. */
    data: ExprIR
    width?: ExprIR
    height?: ExprIR
    draggable?: boolean
    selectable?: boolean
    connectable?: boolean
    focusable?: boolean
    ariaLabel?: string
    hidden?: boolean
    deletable?: boolean
    cssClass?: string
    style?: string
    parentId?: string
    extent?: [number, number, number, number]
    extentParent?: boolean
    expandParent?: boolean
    group?: boolean
    sourceHandles?: { id?: string; type: string; position: string; offset?: number }[]
    targetHandles?: { id?: string; type: string; position: string; offset?: number }[]
    zIndex?: number
  }[]
  edges: {
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
    type?: string
    label?: string
    animated?: boolean
    focusable?: boolean
    ariaLabel?: string
    hidden?: boolean
    deletable?: boolean
    reconnectable?: boolean
    interactionWidth?: number
    zIndex?: number
    data?: ExprIR
    cssClass?: string
    style?: string
    pathOptions?: { curvature?: number; borderRadius?: number; offset?: number }
    markerStart?: { type: string; color?: string; width?: number; height?: number; strokeWidth?: number }
    markerEnd?: { type: string; color?: string; width?: number; height?: number; strokeWidth?: number } | null
    waypoints?: { x: ExprIR; y: ExprIR }[]
  }[]
  /** `minZoom` from the config, when written as a numeric literal. */
  minZoom?: number
  /** `maxZoom` from the config, when written as a numeric literal. */
  maxZoom?: number
  snapToGrid?: boolean
  snapGrid?: number
  nodeExtent?: [number, number, number, number]
  defaultMarkerEnd?: { type: string; color?: string; width?: number; height?: number; strokeWidth?: number } | null
  nodesDraggable?: boolean
  nodesConnectable?: boolean
  nodesSelectable?: boolean
  nodesFocusable?: boolean
  edgesFocusable?: boolean
  disableKeyboardA11y?: boolean
  nodesDeletable?: boolean
  edgesDeletable?: boolean
  edgesReconnectable?: boolean
  edgeInteractionWidth?: number
  connectionRadius?: number
  pannable?: boolean
  panOnDrag?: boolean
  zoomable?: boolean
  zoomOnPinch?: boolean
  zoomOnDoubleClick?: boolean
  panOnScroll?: boolean
  panOnScrollSpeed?: number
  zoomOnScroll?: boolean
  selectionOnDrag?: boolean
  selectionMode?: string
  connectionMode?: string
  elevateNodesOnSelect?: boolean
  elevateEdgesOnSelect?: boolean
  autoPanOnNodeDrag?: boolean
  autoPanOnConnect?: boolean
  autoPanSpeed?: number
  multiSelect?: boolean
  onlyRenderVisibleElements?: boolean
  snapToObjects?: boolean
  autoHistory?: boolean
  historyLimit?: number
  reducedMotion?: boolean
  deleteKeys?: string[] | null
  multiSelectionKey?: string | null
  selectionKey?: string | null
  zoomActivationKey?: string | null
  preventScrolling?: boolean
  defaultEdgeType?: string
  connectionLineType?: string
  defaultEdgeOptions?: {
    type?: string; label?: string; animated?: boolean; focusable?: boolean; ariaLabel?: string
    hidden?: boolean; deletable?: boolean; reconnectable?: boolean; interactionWidth?: number
    pathOptions?: { curvature?: number; borderRadius?: number; offset?: number }
    markerStart?: { type: string; color?: string; width?: number; height?: number; strokeWidth?: number }
    markerEnd?: { type: string; color?: string; width?: number; height?: number; strokeWidth?: number } | null
  }
  fitView?: boolean
  fitViewPadding?: number
  connectionRules?: Record<string, string[]>
  connectionValidator?: ExprIR
}

/** The declaration as the emitters read it: the payload plus the binding name. */
export type FlowStateDecl = FlowStatePayload & { readonly name: string }
