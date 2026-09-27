import { el, type T } from '../../kit'

/**
 * The compact-layout addon panel: a bottom SHEET over the canvas. The desktop
 * panel is a 352px column, which on a phone either squeezed the canvas to
 * nothing or (closed) left no route to Controls at all.
 */
export const Sheet = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme((t: T) => ({
    position: 'fixed',
    left: '0',
    right: '0',
    bottom: '0',
    height: 'min(64vh, 560px)',
    zIndex: '61',
    background: t.surface,
    borderTop: t.hairline,
    extendCss: `border-radius:${t.radius.modal} ${t.radius.modal} 0 0;box-shadow:0 -16px 48px -16px rgba(0,0,0,.45);animation:atlas-sheet .2s ease-out;overflow:hidden;outline:none;`,
  }))
