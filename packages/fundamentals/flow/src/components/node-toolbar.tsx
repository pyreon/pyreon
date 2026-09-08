import { cx, Portal, useContext } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { getEffectiveDimensions } from '../edges'
import { FlowContext, FlowLayersContext } from './flow-context'

export interface NodeToolbarProps {
  /** Position relative to node — default: 'top' */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** Offset from node in px — default: 8 */
  offset?: number
  /** Only show when node is selected — default: true */
  showOnSelect?: boolean
  /**
   * Whether the node is currently selected. Accepts a boolean OR a reactive
   * accessor — `NodeComponentProps.selected` is `() => boolean`, so pass it
   * directly (`selected={props.selected}`) and the toolbar shows / hides
   * reactively as selection changes.
   */
  selected?: boolean | (() => boolean)
  /**
   * The node this toolbar belongs to (`props.id` of the custom node). With it,
   * the toolbar is PORTALED out of the node into the canvas's toolbar layer:
   * it follows the node through pan and zoom but is never scaled or clipped
   * by the node's own `overflow`, and it sits above every node. Without it
   * the toolbar renders inline, absolutely positioned inside the node.
   */
  nodeId?: string
  /** Horizontal (top/bottom) or vertical (left/right) alignment along the node — default: 'center' */
  align?: 'start' | 'center' | 'end'
  style?: string
  class?: string
  children?: VNodeChild
}

const positionStyles: Record<string, string> = {
  top: 'bottom: 100%; left: 50%; transform: translateX(-50%);',
  bottom: 'top: 100%; left: 50%; transform: translateX(-50%);',
  left: 'right: 100%; top: 50%; transform: translateY(-50%);',
  right: 'left: 100%; top: 50%; transform: translateY(-50%);',
}

/**
 * Floating toolbar that appears near a node, typically when selected.
 * Place inside a custom node component.
 *
 * @example
 * ```tsx
 * function EditableNode({ id, data, selected }: NodeComponentProps) {
 *   return (
 *     <div class="node">
 *       {data.label}
 *       <NodeToolbar selected={selected}>
 *         <button onClick={() => duplicate(id)}>Duplicate</button>
 *         <button onClick={() => remove(id)}>Delete</button>
 *       </NodeToolbar>
 *     </div>
 *   )
 * }
 * ```
 */
export function NodeToolbar(props: NodeToolbarProps): VNodeChild {
  const position = props.position ?? 'top'
  const offset = props.offset ?? 8
  const showOnSelect = props.showOnSelect ?? true
  const instance = useContext(FlowContext)
  const layers = useContext(FlowLayersContext)
  const nodeId = props.nodeId

  const isShown = (): boolean => {
    const isSelected =
      typeof props.selected === 'function' ? props.selected() : (props.selected ?? false)
    return !showOnSelect || isSelected
  }
  const chrome = `z-index: 10; display: flex; gap: 4px; background: var(--pyreon-flow-toolbar-bg, white); border: 1px solid var(--pyreon-flow-toolbar-border, #ddd); border-radius: 6px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);`

  // Portaled form: positioned in CONTAINER pixels from the node's absolute
  // position × zoom + pan, so it tracks the node without being scaled.
  if (instance && layers && nodeId) {
    const align = props.align ?? 'center'
    const alignFactor = align === 'start' ? 0 : align === 'end' ? 1 : 0.5
    const alignPct = align === 'start' ? '0%' : align === 'end' ? '-100%' : '-50%'
    // Reactive absolute position: own position plus every ancestor's (a
    // sub-flow child holds a relative position), read through the per-id
    // computeds so a parent drag re-places the toolbar with no extra write.
    const absolute = (): { x: number; y: number } => {
      const own = instance._nodeById(nodeId)()
      if (!own) return { x: 0, y: 0 }
      let x = own.position.x
      let y = own.position.y
      const seen = new Set<string>([nodeId])
      let pid = own.parentId
      while (pid && !seen.has(pid)) {
        seen.add(pid)
        const parent = instance._nodeById(pid)()
        if (!parent) break
        x += parent.position.x
        y += parent.position.y
        pid = parent.parentId
      }
      return { x, y }
    }
    const placement = () => {
      const node = instance._nodeById(nodeId)()
      const abs = absolute()
      const vp = instance.viewport()
      const dims = node
        ? getEffectiveDimensions(node, instance.measurements().get(nodeId))
        : { width: 0, height: 0 }
      const sx = abs.x * vp.zoom + vp.x
      const sy = abs.y * vp.zoom + vp.y
      const w = dims.width * vp.zoom
      const h = dims.height * vp.zoom
      switch (position) {
        case 'bottom':
          return `left: ${sx + w * alignFactor}px; top: ${sy + h + offset}px; transform: translate(${alignPct}, 0);`
        case 'left':
          return `left: ${sx - offset}px; top: ${sy + h * alignFactor}px; transform: translate(-100%, ${alignPct});`
        case 'right':
          return `left: ${sx + w + offset}px; top: ${sy + h * alignFactor}px; transform: translate(0, ${alignPct});`
        default:
          return `left: ${sx + w * alignFactor}px; top: ${sy - offset}px; transform: translate(${alignPct}, -100%);`
      }
    }
    return () => {
      if (!isShown()) return null
      return (
        <Portal target={layers.toolbars}>
          <div
            class={cx(['pyreon-flow-node-toolbar', 'nodrag', props.class])}
            data-nodeid={nodeId}
            style={() => `position: absolute; pointer-events: auto; ${placement()} ${chrome} ${props.style ?? ''}`}
          >
            {props.children}
          </div>
        </Portal>
      )
    }
  }

  const posStyle = positionStyles[position] ?? positionStyles.top
  const marginProp =
    position === 'top'
      ? `margin-bottom: ${offset}px;`
      : position === 'bottom'
        ? `margin-top: ${offset}px;`
        : position === 'left'
          ? `margin-right: ${offset}px;`
          : `margin-left: ${offset}px;`

  const baseStyle = `position: absolute; ${posStyle} ${marginProp} z-index: 10; display: flex; gap: 4px; background: var(--pyreon-flow-toolbar-bg, white); border: 1px solid var(--pyreon-flow-toolbar-border, #ddd); border-radius: 6px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); ${props.style ?? ''}`

  // Reactive accessor — components run ONCE, so a top-level `return null`
  // could never react to selection changes. Reading `props.selected` (a
  // value OR an accessor) inside the returned thunk makes the show / hide
  // track the live selection state and mount / unmount accordingly.
  return () => {
    if (!isShown()) return null
    return (
      <div class={cx(['pyreon-flow-node-toolbar', props.class])} style={baseStyle}>
        {props.children}
      </div>
    )
  }
}
