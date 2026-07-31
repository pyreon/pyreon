import { el, type T } from '../../kit'

export const Segment = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    display: 'flex',
    gap: '2px',
    padding: '3px',
    borderRadius: t.radius.panel,
    background: t.surface2,
  }))
