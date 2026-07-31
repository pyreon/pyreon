import { el } from '../../kit'

export const Body = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:stretch;',
  })
  .theme(() => ({
    flex: '1',
    minHeight: '0',
  }))
