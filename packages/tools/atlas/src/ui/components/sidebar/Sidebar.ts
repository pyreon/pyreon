import { el, type T } from '../../kit'

export const Sidebar = el
  .attrs({
    tag: 'aside',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t: T) => ({
    width: '264px',
    flex: 'none',
    minHeight: '0',
    borderRight: t.hairline,
    background: t.surface,
  }))
