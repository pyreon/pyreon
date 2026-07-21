import type { VNodeChild } from '@pyreon/core'
import type { HandleProps } from '../types'

/**
 * Positioning style for a handle dot: pinned to its side, placed along that
 * side at `offset`% (default 50 = centered). The translate centers the DOT on
 * the placement point, so `offset` reads as "percent along the side".
 */
function positionStyle(position: string, offset: number): string {
  const pct = `${Math.min(100, Math.max(0, offset))}%`
  switch (position) {
    case 'top':
      return `top: -4px; left: ${pct}; transform: translateX(-50%);`
    case 'right':
      return `right: -4px; top: ${pct}; transform: translateY(-50%);`
    case 'left':
      return `left: -4px; top: ${pct}; transform: translateY(-50%);`
    default:
      return `bottom: -4px; left: ${pct}; transform: translateX(-50%);`
  }
}

/**
 * Connection handle — attachment point on a node where edges connect.
 * Place inside custom node components.
 *
 * Multiple handles on the SAME side: give each a distinct `id` AND a distinct
 * `offset` (percent along the side, default 50 = centered) so the dots don't
 * overlap — the measurement pass anchors edges at each dot's real rendered
 * center, so `offset` moves the edge attachment with the dot. (A handle can't
 * auto-distribute — it renders independently and can't see its siblings.)
 *
 * @example
 * ```tsx
 * function CustomNode(props: NodeComponentProps) {
 *   return (
 *     <div class="custom-node">
 *       <Handle type="target" position={Position.Left} />
 *       <span>{() => props.data().label}</span>
 *       <Handle type="source" position={Position.Right} id="out-a" offset={30} />
 *       <Handle type="source" position={Position.Right} id="out-b" offset={70} />
 *     </div>
 *   )
 * }
 * ```
 */
export function Handle(props: HandleProps): VNodeChild {
  const posStyle = positionStyle(props.position, props.offset ?? 50)
  const style = props.style ?? ''
  // Themeable via --pyreon-flow-handle-bg / --pyreon-flow-handle-border with
  // the historical values as fallbacks (see the docs "Theming" table); a
  // consumer `style` prop appended last still overrides everything.
  const baseStyle = `position: absolute; ${posStyle} width: 8px; height: 8px; background: var(--pyreon-flow-handle-bg, #555); border: 2px solid var(--pyreon-flow-handle-border, white); border-radius: 50%; cursor: crosshair; z-index: 1; ${style}`

  return (
    <div
      class={`pyreon-flow-handle pyreon-flow-handle-${props.type} ${props.class ?? ''}`}
      style={baseStyle}
      data-handletype={props.type}
      data-handleid={props.id ?? props.type}
      data-handleposition={props.position}
    />
  )
}
