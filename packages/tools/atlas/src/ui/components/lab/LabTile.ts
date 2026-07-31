import { el, type T } from '../../kit'

export const LabTile = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme((t: T) => ({
    borderRadius: t.radius.modal,
    overflow: 'hidden',
    border: t.hairline,
    boxShadow: '0 8px 24px -18px rgba(15,18,30,.4)',
  }))
