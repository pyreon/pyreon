import { el } from '../../kit'

export const ActionsHead = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    contentAlignX: 'spaceBetween',
  })
  .theme(() => ({
    marginBottom: '12px',
  }))
