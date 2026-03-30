import type { VNodeChild } from '@pyreon/core'
import type { FlowInstance } from '../types'

export interface NodeResizerProps {
  nodeId: string
  instance: FlowInstance
  /** Minimum width — default: 50 */
  minWidth?: number
  /** Minimum height — default: 30 */
  minHeight?: number
  /** Handle size in px — default: 8 */
  handleSize?: number
  /** Also show edge (non-corner) resize handles — default: false */
  showEdgeHandles?: boolean
}

type ResizeDirection = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

const directionCursors: Record<ResizeDirection, string> = {
  nw: 'nw-resize',
  ne: 'ne-resize',
  sw: 'sw-resize',
  se: 'se-resize',
  n: 'n-resize',
  s: 's-resize',
  e: 'e-resize',
  w: 'w-resize',
}

const directionPositions: Record<ResizeDirection, string> = {
  nw: 'top: -4px; left: -4px;',
  ne: 'top: -4px; right: -4px;',
  sw: 'bottom: -4px; left: -4px;',
  se: 'bottom: -4px; right: -4px;',
  n: 'top: -4px; left: 50%; transform: translateX(-50%);',
  s: 'bottom: -4px; left: 50%; transform: translateX(-50%);',
  e: 'right: -4px; top: 50%; transform: translateY(-50%);',
  w: 'left: -4px; top: 50%; transform: translateY(-50%);',
}

/**
 * Node resize handles. Place inside a custom node component
 * to allow users to resize the node by dragging corners or edges.
 *
 * Uses pointer capture for clean event handling — no document listener leaks.
 *
 * @example
 * ```tsx
 * function ResizableNode({ id, data, selected }: NodeComponentProps) {
 *   return (
 *     <div style="min-width: 100px; min-height: 50px; position: relative;">
 *       {data.label}
 *       <NodeResizer nodeId={id} instance={flow} />
 *     </div>
 *   )
 * }
 * ```
 */
export function NodeResizer(props: NodeResizerProps): VNodeChild {
  const {
    nodeId,
    instance,
    minWidth = 50,
    minHeight = 30,
    handleSize = 8,
    showEdgeHandles = false,
  } = props

  const directions: ResizeDirection[] = showEdgeHandles
    ? ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']
    : ['nw', 'ne', 'sw', 'se']

  const createHandler = (dir: ResizeDirection) => {
    let startX = 0
    let startY = 0
    let startWidth = 0
    let startHeight = 0
    let startNodeX = 0
    let startNodeY = 0
    let zoomAtStart = 1

    const onPointerDown = (e: PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()

      const node = instance.getNode(nodeId)
      if (!node) return

      startX = e.clientX
      startY = e.clientY
      startWidth = node.width ?? 150
      startHeight = node.height ?? 40
      startNodeX = node.position.x
      startNodeY = node.position.y
      zoomAtStart = instance.viewport.peek().zoom

      // Use pointer capture — clean, no leaks
      const el = e.currentTarget as HTMLElement
      el.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement
      if (!el.hasPointerCapture(e.pointerId)) return

      const dx = (e.clientX - startX) / zoomAtStart
      const dy = (e.clientY - startY) / zoomAtStart

      let newW = startWidth
      let newH = startHeight
      let newX = startNodeX
      let newY = startNodeY

      // Horizontal
      if (dir === 'e' || dir === 'se' || dir === 'ne') {
        newW = Math.max(minWidth, startWidth + dx)
      }
      if (dir === 'w' || dir === 'sw' || dir === 'nw') {
        newW = Math.max(minWidth, startWidth - dx)
        newX = startNodeX + startWidth - newW
      }

      // Vertical
      if (dir === 's' || dir === 'se' || dir === 'sw') {
        newH = Math.max(minHeight, startHeight + dy)
      }
      if (dir === 'n' || dir === 'ne' || dir === 'nw') {
        newH = Math.max(minHeight, startHeight - dy)
        newY = startNodeY + startHeight - newH
      }

      instance.updateNode(nodeId, {
        width: newW,
        height: newH,
        position: { x: newX, y: newY },
      })
    }

    const onPointerUp = (e: PointerEvent) => {
      const el = e.currentTarget as HTMLElement
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId)
      }
    }

    return { onPointerDown, onPointerMove, onPointerUp }
  }

  const size = `${handleSize}px`
  const baseStyle = `position: absolute; width: ${size}; height: ${size}; background: white; border: 1.5px solid #3b82f6; border-radius: 2px; z-index: 2;`

  return (
    <>
      {directions.map((dir) => {
        const handler = createHandler(dir)
        return (
          <div
            key={dir}
            class={`pyreon-flow-resizer pyreon-flow-resizer-${dir}`}
            style={`${baseStyle} ${directionPositions[dir]} cursor: ${directionCursors[dir]};`}
            onPointerDown={handler.onPointerDown}
            onPointerMove={handler.onPointerMove}
            onPointerUp={handler.onPointerUp}
          />
        )
      })}
    </>
  )
}
