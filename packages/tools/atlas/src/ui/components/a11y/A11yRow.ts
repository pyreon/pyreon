import { el, type T } from '../../kit'

export const A11yRow = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:flex-start;',
  })
  .theme((t: T) => ({
    display: 'flex',
    gap: '11px',
    padding: '11px 12px',
    borderRadius: t.radius.panel,
    marginBottom: '7px',
    background: t.surface2,
  }))
