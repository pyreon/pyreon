import { el } from '../../kit'

export const RightRow = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'right',
    gap: 8,
  })
  .theme(() => ({
    minWidth: '192px',
  }))
