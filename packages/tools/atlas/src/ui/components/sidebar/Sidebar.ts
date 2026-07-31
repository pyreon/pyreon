import { el, type T } from '../../kit'

export const Sidebar = el
  .attrs({
    tag: 'aside',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme((t: T) => ({
    width: '264px',
    flex: 'none',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '0',
    borderRight: t.hairline,
    background: t.surface,
  }))
