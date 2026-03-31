import type { VNodeChild } from '@pyreon/core'
import type { HandleProps } from '../types'

const positionOffset: Record<string, string> = {
  top: 'top: -4px; left: 50%; transform: translateX(-50%);',
  right: 'right: -4px; top: 50%; transform: translateY(-50%);',
  bottom: 'bottom: -4px; left: 50%; transform: translateX(-50%);',
  left: 'left: -4px; top: 50%; transform: translateY(-50%);',
}

/**
 * Connection handle — attachment point on a node where edges connect.
 * Place inside custom node components.
 *
 * @example
 * ```tsx
 * function CustomNode({ data }: NodeComponentProps) {
 *   return (
 *     <div class="custom-node">
 *       <Handle type="target" position={Position.Left} />
 *       <span>{data.label}</span>
 *       <Handle type="source" position={Position.Right} />
 *     </div>
 *   )
 * }
 * ```
 */
export function Handle(props: HandleProps): VNodeChild {
  const posStyle = positionOffset[props.position] ?? positionOffset.bottom
  const style = props.style ?? ''
  const baseStyle = `position: absolute; ${posStyle} width: 8px; height: 8px; background: #555; border: 2px solid white; border-radius: 50%; cursor: crosshair; z-index: 1; ${style}`

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
