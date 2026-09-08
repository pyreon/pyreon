import { Portal, useContext, type VNodeChild } from '@pyreon/core'
import { FlowLayersContext } from './flow-context'

export interface EdgeLabelRendererProps {
  children?: VNodeChild
}

/**
 * Render HTML for an edge label. SVG `<text>` cannot hold buttons, inputs or
 * wrapped rich text, so a custom edge wraps its label in this component: the
 * children are portaled into a `<div>` layer that sits inside the viewport
 * (it pans and zooms with the graph) and position themselves with the edge's
 * `labelX` / `labelY` accessors. The layer is `pointer-events: none`; give an
 * interactive label `pointer-events: all` and the `nopan` class so a click on
 * it does not start a canvas pan. React Flow's `<EdgeLabelRenderer>`.
 *
 * Outside a mounted `<Flow>` (and on the server) it renders nothing.
 *
 * @example
 * ```tsx
 * function LabeledEdge(props: EdgeComponentProps) {
 *   return (
 *     <>
 *       <path d={() => getBezierPath({ ... }).path} style="fill: none; stroke: #999;" />
 *       <EdgeLabelRenderer>
 *         <div
 *           class="nopan"
 *           style={() =>
 *             `position: absolute; transform: translate(-50%, -50%) translate(${props.labelX()}px, ${props.labelY()}px); pointer-events: all;`
 *           }
 *         >
 *           <button onClick={() => remove(props.edge.id)}>×</button>
 *         </div>
 *       </EdgeLabelRenderer>
 *     </>
 *   )
 * }
 * ```
 */
export function EdgeLabelRenderer(props: EdgeLabelRendererProps): VNodeChild {
  const layers = useContext(FlowLayersContext)
  if (!layers) return null
  return <Portal target={layers.edgeLabels}>{props.children}</Portal>
}
