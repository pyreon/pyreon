import { el } from '../../kit'

export const AddonBody = el
  .attrs({
    tag: 'div',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    flex: '1',
    overflowY: 'auto',
    padding: '16px',
  }))
