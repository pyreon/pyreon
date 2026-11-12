import type { T } from '../../kit'
import { el } from '../../kit'

/**
 * The compact-layout catalog: an OVERLAY drawer under the top bar rather than
 * a column. As a column, the catalog left a 390px phone ~170px of canvas;
 * overlaid, the canvas keeps the whole width and the catalog is one tap away.
 */
export const Drawer = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({
    position: 'fixed',
    top: '48px',
    left: '0',
    bottom: '0',
    width: 'min(280px, 86vw)',
    zIndex: '61',
    background: t.surface,
    borderRight: t.hairline,
    extendCss: `box-shadow:20px 0 40px -20px ${t.shadow};animation:atlas-drawer .18s ease-out;outline:none;`,
  }))
