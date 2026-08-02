import { el } from '../../kit'

export const BrandRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 12,
  })
  .theme(() => ({
    minWidth: '192px',
  }))
