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

/**
 * Position each handle so its CENTER sits on the node edge/corner. The
 * negative offset is half the handle size — hardcoding `-4px` (half of the
 * default 8) left handles off-center for any custom `handleSize`.
 */
function directionPosition(dir: ResizeDirection, handleSize: number): string {
  const off = `-${handleSize / 2}px`
  switch (dir) {
    case 'nw':
      return `top: ${off}; left: ${off};`
    case 'ne':
      return `top: ${off}; right: ${off};`
    case 'sw':
      return `bottom: ${off}; left: ${off};`
    case 'se':
      return `bottom: ${off}; right: ${off};`
    case 'n':
      return `top: ${off}; left: 50%; transform: translateX(-50%);`
    case 's':
      return `bottom: ${off}; left: 50%; transform: translateX(-50%);`
    case 'e':
      return `right: ${off}; top: 50%; transform: translateY(-50%);`
    case 'w':
      return `left: ${off}; top: 50%; transform: translateY(-50%);`
  }
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
  const minWidth = props.minWidth ?? 50
  const minHeight = props.minHeight ?? 30
  const handleSize = props.handleSize ?? 8
  const showEdgeHandles = props.showEdgeHandles ?? false

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

      const node = props.instance.getNode(props.nodeId)
      if (!node) return

      startX = e.clientX
      startY = e.clientY
      startWidth = node.width ?? 150
      startHeight = node.height ?? 40
      startNodeX = node.position.x
      startNodeY = node.position.y
      zoomAtStart = props.instance.viewport.peek().zoom

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

      props.instance.updateNode(props.nodeId, {
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
            style={`${baseStyle} ${directionPosition(dir, handleSize)} cursor: ${directionCursors[dir]};`}
            onPointerDown={handler.onPointerDown}
            onPointerMove={handler.onPointerMove}
            onPointerUp={handler.onPointerUp}
          />
        )
      })}
    </>
  )
}
