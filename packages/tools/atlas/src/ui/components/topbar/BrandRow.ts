import { el } from '../../kit'

export const BrandRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 9,
  })
  .theme(() => ({
    flex: 'none',
    minWidth: '0',
    whiteSpace: 'nowrap',
  }))
