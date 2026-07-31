/**
 * Measure addon overlay — a box outline + a dimensions label that track the
 * hovered element. POSITIONED IMPERATIVELY (the view writes left/top/width/
 * height directly): continuous per-pixel geometry is measurement, not styling
 * — hashing a class per mousemove would grow the style cache without bound.
 * Same precedent as `@pyreon/elements`' overlay positioning.
 */
import { el, type T } from '../../kit'

export const MeasureBox = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    position: 'absolute',
    display: 'none',
    pointerEvents: 'none',
    border: `1px dashed ${t.accent}`,
    background: 'transparent',
    zIndex: '30',
  }))
