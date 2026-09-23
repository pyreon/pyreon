import { Portal, useContext, type VNodeChild } from '@pyreon/core'
import { FlowLayersContext } from './flow-context'

export interface BaseEdgeProps {
  /** SVG path data, typically `getBezierPath({...}).path`. */
  path: string
  /** Inline style for the visible stroke (e.g. `"stroke: #16a34a; stroke-width: 2"`). */
  style?: string
  class?: string
  /** A `url(#marker-id)` reference for the start marker. */
  markerStart?: string
  /** A `url(#marker-id)` reference for the end marker. */
  markerEnd?: string
  /** Optional text drawn at `labelX` / `labelY` (flow coordinates). */
  label?: string
  labelX?: number
  labelY?: number
  labelStyle?: string
}

/**
 * The visible part of an edge: its stroke, markers and an optional text label
 * (React Flow's `BaseEdge`). Use it inside a custom edge component; the flow
 * already adds the invisible, wider hit path around every edge.
 *
 * @example
 * function Wire(props: EdgeComponentProps) {
 *   const edge = () => getBezierPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
 *   return <BaseEdge path={edge().path} label="wire" labelX={edge().labelX} labelY={edge().labelY} />
 * }
 */
export function BaseEdge(props: BaseEdgeProps): VNodeChild {
  return (
    <>
      <path
        class={() => `pyreon-flow-edge-path ${props.class ?? ''}`.trim()}
        d={() => props.path}
        fill="none"
        style={() => props.style ?? 'stroke: var(--pyreon-flow-edge, #999); stroke-width: 1.5px'}
        marker-start={() => props.markerStart}
        marker-end={() => props.markerEnd}
      />
      {() =>
        props.label !== undefined && props.labelX !== undefined && props.labelY !== undefined ? (
          <EdgeText x={props.labelX} y={props.labelY} label={props.label} {...(props.labelStyle !== undefined ? { style: props.labelStyle } : {})} />
        ) : null
      }
    </>
  )
}

export interface EdgeTextProps {
  /** Centre of the text, in flow coordinates. */
  x: number
  y: number
  label: string
  style?: string
}

/**
 * A text label centred at a point on an edge (React Flow's `EdgeText`), drawn
 * in the edge layer so it pans and zooms with the graph.
 *
 * @example
 * <EdgeText x={labelX} y={labelY} label="yes" />
 */
export function EdgeText(props: EdgeTextProps): VNodeChild {
  return (
    <text
      class="pyreon-flow-edge-text"
      x={() => props.x}
      y={() => props.y}
      text-anchor="middle"
      dominant-baseline="central"
      style={() => props.style ?? 'font-size: 11px; fill: var(--pyreon-flow-edge-label, #666)'}
    >
      {() => props.label}
    </text>
  )
}

export interface ViewportPortalProps {
  children?: VNodeChild
}

/**
 * Renders its children inside the flow's viewport layer, so they pan and zoom
 * with the graph (React Flow's `ViewportPortal`). Position children in flow
 * coordinates, e.g. `style="position: absolute; transform: translate(100px, 50px)"`.
 * Web only: the positioning is CSS, which has no native meaning; natively the
 * compiler names it and points at `EdgeLabelRenderer`, `Panel` or `FlowWebView`.
 *
 * @example
 * <Flow instance={flow}>
 *   <ViewportPortal><div style="position: absolute; transform: translate(0px, -40px)">Start here</div></ViewportPortal>
 * </Flow>
 */
export function ViewportPortal(props: ViewportPortalProps): VNodeChild {
  const layers = useContext(FlowLayersContext)
  if (!layers) return null
  return <Portal target={layers.edgeLabels}>{props.children}</Portal>
}
