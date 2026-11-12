import { el } from '../../kit'

/**
 * The role's render, live (`.mini`). Bounded so a tall component (a table, a
 * tree) cannot make one card a screen long; the full render is the canvas.
 * `inert`: it is a picture of the canvas, not a second place to tab through.
 */
export const RoleMini = el.attrs({ tag: 'div', block: true }).theme((t) => ({
  padding: '12px',
  borderRadius: t.radius.button,
  background: t.codeBg,
  maxHeight: '160px',
  overflow: 'auto',
  contain: 'layout',
  extendCss: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;',
}))
