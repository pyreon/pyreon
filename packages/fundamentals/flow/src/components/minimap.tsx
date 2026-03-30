import type { VNodeChild } from '@pyreon/core'
import type { FlowInstance, MiniMapProps } from '../types'

/**
 * Miniature overview of the flow diagram showing all nodes
 * and the current viewport position. Click to navigate.
 *
 * @example
 * ```tsx
 * <Flow instance={flow}>
 *   <MiniMap nodeColor={(n) => n.type === 'error' ? 'red' : '#ddd'} />
 * </Flow>
 * ```
 */
export function MiniMap(props: MiniMapProps & { instance?: FlowInstance }): VNodeChild {
  const {
    width = 200,
    height = 150,
    nodeColor = '#e2e8f0',
    maskColor = 'rgba(0, 0, 0, 0.08)',
    instance,
  } = props

  if (!instance) return null

  const containerStyle = `position: absolute; bottom: 10px; right: 10px; width: ${width}px; height: ${height}px; border: 1px solid #ddd; background: white; border-radius: 4px; overflow: hidden; z-index: 5; cursor: pointer;`

  return () => {
    const nodes = instance.nodes()
    if (nodes.length === 0) return <div class="pyreon-flow-minimap" style={containerStyle} />

    // Calculate graph bounds
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const node of nodes) {
      const w = node.width ?? 150
      const h = node.height ?? 40
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + w)
      maxY = Math.max(maxY, node.position.y + h)
    }

    const padding = 40
    const graphW = maxX - minX + padding * 2
    const graphH = maxY - minY + padding * 2
    const scale = Math.min(width / graphW, height / graphH)

    // Viewport rectangle in minimap coordinates
    const vp = instance.viewport()
    const cs = instance.containerSize()
    const vpLeft = (-vp.x / vp.zoom - minX + padding) * scale
    const vpTop = (-vp.y / vp.zoom - minY + padding) * scale
    const vpWidth = (cs.width / vp.zoom) * scale
    const vpHeight = (cs.height / vp.zoom) * scale

    const handleClick = (e: MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      // Convert minimap click to flow coordinates
      const flowX = clickX / scale + minX - padding
      const flowY = clickY / scale + minY - padding

      // Center viewport on clicked point
      instance.viewport.set({
        ...vp,
        x: -(flowX * vp.zoom) + cs.width / 2,
        y: -(flowY * vp.zoom) + cs.height / 2,
      })
    }

    return (
      <div class="pyreon-flow-minimap" style={containerStyle} onClick={handleClick}>
        <svg role="img" aria-label="minimap" width={String(width)} height={String(height)}>
          {/* Mask outside viewport */}
          <rect width={String(width)} height={String(height)} fill={maskColor} />

          {/* Nodes */}
          {nodes.map((node) => {
            const w = (node.width ?? 150) * scale
            const h = (node.height ?? 40) * scale
            const x = (node.position.x - minX + padding) * scale
            const y = (node.position.y - minY + padding) * scale
            const color = typeof nodeColor === 'function' ? nodeColor(node) : nodeColor

            return (
              <rect
                key={node.id}
                x={String(x)}
                y={String(y)}
                width={String(w)}
                height={String(h)}
                fill={color}
                rx="2"
              />
            )
          })}

          {/* Viewport indicator */}
          <rect
            x={String(Math.max(0, vpLeft))}
            y={String(Math.max(0, vpTop))}
            width={String(Math.min(vpWidth, width))}
            height={String(Math.min(vpHeight, height))}
            fill="none"
            stroke="#3b82f6"
            stroke-width="1.5"
            rx="2"
          />
        </svg>
      </div>
    )
  }
}
