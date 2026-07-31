import { el } from '../../kit'

export const AddonBody = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme(() => ({
    flex: '1',
    overflowY: 'auto',
    padding: '16px',
  }))
