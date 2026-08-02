import { el } from '../../kit'

export const CtrlHead = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'spaceBetween',
  })
  .theme(() => ({
    marginBottom: '8px',
  }))
