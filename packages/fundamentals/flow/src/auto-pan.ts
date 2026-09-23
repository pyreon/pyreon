/**
 * Auto-pan velocity while a node or a connection is dragged near the edge of
 * the viewport (React Flow's `calcAutoPan`). Within `threshold` px of an edge
 * the viewport pans toward it, faster the closer the pointer is; past the edge
 * it pans at full `speed`. Mirrored by the native `pyreonFlowAutoPanVelocity`.
 *
 * `x` / `y` are the pointer's position relative to the flow container. The
 * result is how far to move the viewport this frame, in screen px.
 */
export function autoPanVelocity(x: number, y: number, width: number, height: number, speed = 15, threshold = 40): { x: number; y: number } {
  const axis = (value: number, size: number): number => {
    if (size <= 2 * threshold) return 0
    if (value < threshold) return Math.min(Math.max(threshold - value, 1), threshold) / threshold
    if (value > size - threshold) return -Math.min(Math.max(value - (size - threshold), 1), threshold) / threshold
    return 0
  }
  return { x: axis(x, width) * speed, y: axis(y, height) * speed }
}
