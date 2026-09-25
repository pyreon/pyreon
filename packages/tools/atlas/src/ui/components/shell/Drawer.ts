import { el, type T } from '../../kit'

/**
 * The compact-layout sidebar: an OVERLAY drawer rather than a flex sibling.
 * As a sibling, a 272px sidebar left a 390px phone ~80px of canvas — the
 * preview read as broken. Overlaid, the canvas keeps the whole width and the
 * tree is one tap away.
 */
export const Drawer = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({
    position: 'fixed',
    top: '0',
    left: '0',
    bottom: '0',
    width: 'min(320px, 86vw)',
    zIndex: '61',
    background: t.surface,
    borderRight: t.hairline,
    extendCss:
      'box-shadow:16px 0 48px -16px rgba(0,0,0,.45);animation:atlas-drawer .18s ease-out;outline:none;',
  }))
