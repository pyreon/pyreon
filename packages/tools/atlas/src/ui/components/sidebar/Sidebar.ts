import { el, type T } from '../../kit'

export const Sidebar = el
  .attrs({
    tag: 'aside',
  })
  .theme((t: T) => ({
    alignItems: 'stretch',
    width: '264px',
    flex: 'none',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '0',
    borderRight: t.hairline,
    background: t.surface,
  }))
