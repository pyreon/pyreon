import { el, type T } from '../../kit'

export const AddonPanel = el
  .attrs({
    tag: 'section',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t: T) => ({
    width: '352px',
    flex: 'none',
    minHeight: '0',
    borderLeft: t.hairline,
    background: t.surface,
  }))
