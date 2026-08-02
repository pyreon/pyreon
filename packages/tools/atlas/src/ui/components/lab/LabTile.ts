import { el, type T } from '../../kit'

export const LabTile = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme((t: T) => ({
    borderRadius: t.radius.modal,
    overflow: 'hidden',
    border: t.hairline,
    boxShadow: '0 8px 24px -18px rgba(15,18,30,.4)',
  }))
