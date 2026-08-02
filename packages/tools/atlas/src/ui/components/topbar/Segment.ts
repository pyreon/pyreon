import { el, type T } from '../../kit'

export const Segment = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    alignItems: 'center',
    display: 'flex',
    gap: '2px',
    padding: '4px',
    borderRadius: t.radius.panel,
    background: t.surface2,
  }))
