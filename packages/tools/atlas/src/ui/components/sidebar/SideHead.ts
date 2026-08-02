import { el } from '../../kit'

export const SideHead = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'spaceBetween',
  })
  .theme(() => ({
    padding: '16px 16px 8px',
  }))
