import { el, type T } from '../../kit'

export const Segment = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 2,
  })
  .theme((t: T) => ({
    padding: '4px',
    borderRadius: t.radius.panel,
    background: t.surface2,
  }))
