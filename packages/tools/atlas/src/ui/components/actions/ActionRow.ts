import { el, type T } from '../../kit'

export const ActionRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 11px',
    borderRadius: t.radius.field,
    marginBottom: '6px',
    background: t.surface2,
    extendCss: 'animation:atlas-in .18s;',
  }))
