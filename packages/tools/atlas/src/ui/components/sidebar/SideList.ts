import { el } from '../../kit'

export const SideList = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme(() => ({
    flex: '1',
    overflowY: 'auto',
    padding: '0 10px 16px',
  }))
