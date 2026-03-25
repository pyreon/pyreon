import type { VNodeChild } from "@pyreon/core"

export interface NodeToolbarProps {
  /** Position relative to node — default: 'top' */
  position?: "top" | "bottom" | "left" | "right"
  /** Offset from node in px — default: 8 */
  offset?: number
  /** Only show when node is selected — default: true */
  showOnSelect?: boolean
  /** Whether the node is currently selected */
  selected?: boolean
  style?: string
  class?: string
  children?: VNodeChild
}

const positionStyles: Record<string, string> = {
  top: "bottom: 100%; left: 50%; transform: translateX(-50%);",
  bottom: "top: 100%; left: 50%; transform: translateX(-50%);",
  left: "right: 100%; top: 50%; transform: translateY(-50%);",
  right: "left: 100%; top: 50%; transform: translateY(-50%);",
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
  const { position = "top", offset = 8, showOnSelect = true, selected = false, children } = props

  if (showOnSelect && !selected) return null

  const posStyle = positionStyles[position] ?? positionStyles.top
  const marginProp =
    position === "top"
      ? `margin-bottom: ${offset}px;`
      : position === "bottom"
        ? `margin-top: ${offset}px;`
        : position === "left"
          ? `margin-right: ${offset}px;`
          : `margin-left: ${offset}px;`

  const baseStyle = `position: absolute; ${posStyle} ${marginProp} z-index: 10; display: flex; gap: 4px; background: white; border: 1px solid #ddd; border-radius: 6px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); ${props.style ?? ""}`

  return (
    <div class={`pyreon-flow-node-toolbar ${props.class ?? ""}`} style={baseStyle}>
      {children}
    </div>
  )
}
